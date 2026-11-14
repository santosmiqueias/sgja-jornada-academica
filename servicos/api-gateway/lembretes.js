/*
 * Agendador de lembretes por WhatsApp.
 * A cada minuto: vê quais atividades começam dentro da antecedência configurada (30 min),
 * e manda o lembrete para quem se inscreveu naquela atividade e autorizou WhatsApp. Cada par aluno+atividade
 * é enviado uma única vez, mesmo se o servidor reiniciar: o registro fica na entidade LembreteWhatsApp
 * (no Base44 ou em dados/LembreteWhatsApp.json), e não no disco do servidor, que pode ser apagado a cada deploy.
 *
 * Uso direto pela linha de comando (bom para cron ou para testar):
 *   node lembretes.js --uma-vez
 *   node lembretes.js --uma-vez --agora 2026-12-09T07:31:00-03:00
 *   node lembretes.js --agenda
 */
require("./env");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const C = require("../../js/core.js");
const whatsapp = require("./whatsapp");

const RAIZ = path.join(__dirname, "..", "..");
const MAX_TENTATIVAS = 3;

// Mesma configuração do site (js/config.js): uma única fonte para eventos e horários.
function carregarConfig() {
  const ctx = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(RAIZ, "js", "config.js"), "utf8"), ctx);
  return ctx.window.SGJA_CONFIG;
}

// Inscritos: do mesmo armazenamento do servidor (arquivos em dados/ ou Base44).
const { criarStore } = require("./store");
let store = null;
function obterStore() { if (!store) store = criarStore(); return store; }
async function carregarInscritos() { return obterStore().list("Aluno"); }

// Registro dos envios: { "alunoId:eventoId": registro } a partir da entidade LembreteWhatsApp.
async function carregarLog() {
  const log = {};
  for (const r of await obterStore().list("LembreteWhatsApp")) log[r.chave] = r;
  return log;
}
// Cria ou atualiza o registro do par aluno+atividade (grava a cada envio: se cair no meio, não repete).
async function registrar(log, chave, dados) {
  const atual = log[chave];
  const reg = { chave, ...dados };
  log[chave] = atual ? await obterStore().update("LembreteWhatsApp", atual.id, reg) : await obterStore().create("LembreteWhatsApp", reg);
}

let rodando = false;

async function executar(agora = new Date()) {
  if (rodando) return { ignorado: true };
  rodando = true;
  const resumo = { enviados: 0, simulados: 0, falhas: 0, atividades: [] };
  try {
    const cfg = carregarConfig();
    if (!cfg.whatsapp || !cfg.whatsapp.ativo) return resumo;
    const minutos = cfg.whatsapp.antecedenciaMinutos;
    const devidos = C.eventosParaLembrete(cfg.eventos, agora, minutos, cfg.evento.fusoHorario);
    if (!devidos.length) return resumo;

    const inscritos = await carregarInscritos();
    const log = await carregarLog();

    for (const ev of devidos) {
      resumo.atividades.push(ev.id);
      // Só quem se inscreveu nesta atividade e autorizou WhatsApp.
      for (const aluno of inscritos.filter((a) => C.recebeLembrete(a, ev.id))) {
        const chave = `${aluno.id}:${ev.id}`;
        const reg = log[chave];
        if (reg && (reg.status !== "falhou" || reg.tentativas >= MAX_TENTATIVAS)) continue;
        const telefone = C.telefoneE164(aluno.telefone);
        if (!telefone) {
          await registrar(log, chave, { alunoId: aluno.id, eventoId: ev.id, telefone: "", status: "falhou", tentativas: MAX_TENTATIVAS, erro: "telefone inválido" });
          resumo.falhas++;
          continue;
        }

        const hora = String(ev.horario).split(/[–-]/)[0].trim();
        const dados = {
          nome: C.normalizarNome(aluno.nome).split(" ")[0], minutos, titulo: ev.titulo, hora, sala: ev.sala,
          texto: C.mensagemLembrete(aluno, ev, cfg.evento.nome, minutos)
        };
        try {
          const r = await whatsapp.enviar(telefone, dados);
          await registrar(log, chave, { alunoId: aluno.id, eventoId: ev.id, telefone, status: r.status, idProvedor: r.id || "", tentativas: (reg?.tentativas || 0) + 1, erro: "", enviadoEm: new Date().toISOString() });
          r.status === "simulado" ? resumo.simulados++ : resumo.enviados++;
        } catch (e) {
          try {
            await registrar(log, chave, { alunoId: aluno.id, eventoId: ev.id, telefone, status: "falhou", erro: String(e.message).slice(0, 300), tentativas: (reg?.tentativas || 0) + 1 });
          } catch (e2) { console.error(`[lembretes] não registrou ${chave}: ${e2.message}`); }
          resumo.falhas++;
          console.error(`[lembretes] falha para ${chave}: ${e.message}`);
        }
        await new Promise((ok) => setTimeout(ok, 150)); // respeita limite de envio do provedor
      }
    }
    return resumo;
  } finally {
    rodando = false;
  }
}

// Agenda para o painel: quando cada lembrete sai e quantos já foram.
async function agenda() {
  const cfg = carregarConfig();
  const minutos = cfg.whatsapp.antecedenciaMinutos;
  let inscritos = [], log = {};
  try { inscritos = await carregarInscritos(); log = await carregarLog(); } catch (_) {}
  const comWhats = inscritos.filter((a) => a.aceitaWhatsApp === true).length;
  return {
    provedor: whatsapp.provedor(), antecedenciaMinutos: minutos, inscritos: inscritos.length, autorizaramWhatsApp: comWhats,
    atividades: cfg.eventos.map((ev) => {
      const ini = C.inicioEvento(ev, cfg.evento.fusoHorario);
      const regs = Object.values(log).filter((r) => r.eventoId === ev.id);
      return {
        id: ev.id, titulo: ev.titulo, inicio: ini.toISOString(), envioEm: new Date(ini.getTime() - minutos * 60000).toISOString(),
        destinatarios: inscritos.filter((a) => C.recebeLembrete(a, ev.id)).length,
        enviados: regs.filter((r) => r.status !== "falhou").length, falhas: regs.filter((r) => r.status === "falhou").length
      };
    })
  };
}

function iniciar() {
  const tick = () => executar().then((r) => {
    if (r.atividades && r.atividades.length) console.log(`[lembretes] ${new Date().toISOString()} ${JSON.stringify(r)}`);
  }).catch((e) => console.error("[lembretes]", e.message));
  tick();
  return setInterval(tick, 60000);
}

module.exports = { executar, agenda, iniciar, carregarConfig };

if (require.main === module) {
  const args = process.argv.slice(2);
  const i = args.indexOf("--agora");
  const agora = i >= 0 ? new Date(args[i + 1]) : new Date();
  if (args.includes("--agenda")) agenda().then((a) => console.log(JSON.stringify(a, null, 2)));
  else if (args.includes("--uma-vez")) executar(agora).then((r) => console.log(JSON.stringify(r)));
  else { console.log("Agendador de lembretes WhatsApp rodando (Ctrl+C para parar)"); iniciar(); }
}
