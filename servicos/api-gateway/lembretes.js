/*
 * Agendador de lembretes por WhatsApp.
 * A cada minuto: vê quais atividades começam dentro da antecedência configurada (30 min),
 * e manda o lembrete para quem se inscreveu naquela atividade e autorizou WhatsApp. Cada par aluno+atividade
 * é enviado uma única vez, mesmo se o servidor reiniciar (log em dados/lembretes-enviados.json).
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
const DADOS = process.env.LEMBRETES_DADOS || path.join(__dirname, "dados");
const ARQ_LOG = path.join(DADOS, "lembretes-enviados.json");
const ARQ_INSCRITOS = path.join(DADOS, "inscritos.json");
const MAX_TENTATIVAS = 3;

// Mesma configuração do site (js/config.js): uma única fonte para eventos e horários.
function carregarConfig() {
  const ctx = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(RAIZ, "js", "config.js"), "utf8"), ctx);
  return ctx.window.SGJA_CONFIG;
}

function lerJSON(arq, padrao) {
  try { return JSON.parse(fs.readFileSync(arq, "utf8")); } catch (_) { return padrao; }
}
function gravarJSON(arq, dados) {
  fs.mkdirSync(path.dirname(arq), { recursive: true });
  const tmp = `${arq}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(dados, null, 2));
  fs.renameSync(tmp, arq); // troca atômica: o log nunca fica corrompido pela metade
}

// Inscritos: do Base44 (produção) ou do arquivo exportado pelo painel (modo demonstração).
async function carregarInscritos() {
  const { BASE44_APP_ID, BASE44_API_KEY } = process.env;
  if (BASE44_APP_ID && BASE44_API_KEY) {
    const r = await fetch(`https://app.base44.com/api/apps/${BASE44_APP_ID}/entities/Aluno`, { headers: { api_key: BASE44_API_KEY } });
    if (!r.ok) throw new Error(`Base44 respondeu ${r.status}`);
    return r.json();
  }
  return lerJSON(ARQ_INSCRITOS, []);
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
    const log = lerJSON(ARQ_LOG, {});

    for (const ev of devidos) {
      resumo.atividades.push(ev.id);
      // Só quem se inscreveu nesta atividade e autorizou WhatsApp.
      for (const aluno of inscritos.filter((a) => C.recebeLembrete(a, ev.id))) {
        const chave = `${aluno.id}:${ev.id}`;
        const reg = log[chave];
        if (reg && (reg.status !== "falhou" || reg.tentativas >= MAX_TENTATIVAS)) continue;
        const telefone = C.telefoneE164(aluno.telefone);
        if (!telefone) {
          log[chave] = { alunoId: aluno.id, eventoId: ev.id, status: "falhou", tentativas: MAX_TENTATIVAS, erro: "telefone inválido" };
          resumo.falhas++;
          gravarJSON(ARQ_LOG, log);
          continue;
        }

        const hora = String(ev.horario).split(/[–-]/)[0].trim();
        const dados = {
          nome: C.normalizarNome(aluno.nome).split(" ")[0], minutos, titulo: ev.titulo, hora, sala: ev.sala,
          texto: C.mensagemLembrete(aluno, ev, cfg.evento.nome, minutos)
        };
        try {
          const r = await whatsapp.enviar(telefone, dados);
          log[chave] = { alunoId: aluno.id, eventoId: ev.id, telefone, status: r.status, id: r.id, tentativas: (reg?.tentativas || 0) + 1, enviadoEm: new Date().toISOString() };
          r.status === "simulado" ? resumo.simulados++ : resumo.enviados++;
        } catch (e) {
          log[chave] = { alunoId: aluno.id, eventoId: ev.id, telefone, status: "falhou", erro: e.message, tentativas: (reg?.tentativas || 0) + 1 };
          resumo.falhas++;
          console.error(`[lembretes] falha para ${chave}: ${e.message}`);
        }
        gravarJSON(ARQ_LOG, log); // grava a cada envio: se cair no meio, não repete quem já recebeu
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
  const log = lerJSON(ARQ_LOG, {});
  let inscritos = [];
  try { inscritos = await carregarInscritos(); } catch (_) {}
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
