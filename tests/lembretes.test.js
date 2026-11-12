// Testes do lembrete por WhatsApp (regras + agendador com relógio simulado).
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const C = require("../js/core.js");

const ev = { id: "EV01", titulo: "Abertura", data: "2026-12-09", horario: "08:00 – 12:00", sala: "Auditório", cargaHoraria: 4 };

test("Início da atividade no fuso de Teresina", () => {
  assert.equal(C.inicioEvento(ev, "-03:00").toISOString(), "2026-12-09T11:00:00.000Z");
  assert.equal(C.inicioEvento({ ...ev, horario: "sem hora" }), null);
});

test("Janela do lembrete: de 30 min antes até o início", () => {
  const em = (h) => C.eventosParaLembrete([ev], `2026-12-09T${h}:00-03:00`, 30, "-03:00").length;
  assert.equal(em("07:29"), 0);
  assert.equal(em("07:30"), 1);
  assert.equal(em("07:59"), 1);
  assert.equal(em("08:00"), 0);
});

test("Telefone no formato do WhatsApp", () => {
  assert.equal(C.telefoneE164("(86) 99999-8888"), "5586999998888");
  assert.equal(C.telefoneE164("5586999998888"), "5586999998888");
  assert.equal(C.telefoneE164("123"), null);
});

test("Só recebe quem autorizou e se inscreveu na atividade", () => {
  assert.equal(C.recebeLembrete({ aceitaWhatsApp: true, atividades: ["EV01"] }, "EV01"), true);
  assert.equal(C.recebeLembrete({ aceitaWhatsApp: true, atividades: ["EV02"] }, "EV01"), false);
  assert.equal(C.recebeLembrete({ aceitaWhatsApp: false, atividades: ["EV01"] }, "EV01"), false);
  assert.equal(C.recebeLembrete({ aceitaWhatsApp: true }, "EV01"), false);
});

test("Validação da escolha de atividades", () => {
  const evs = [{ id: "EV01" }, { id: "EV02" }];
  assert.equal(C.validarAtividades(["EV01"], evs), true);
  assert.equal(C.validarAtividades([], evs), false);
  assert.equal(C.validarAtividades(["EV09"], evs), false);
  assert.equal(C.validarAtividades(["EV01", "EV01"], evs), false);
  assert.equal(C.validarAtividades("EV01", evs), false);
});

test("Mensagem tem nome, atividade, hora e sala", () => {
  const m = C.mensagemLembrete({ nome: "maria da silva" }, ev, "6ª Jornada Acadêmica", 30);
  for (const trecho of ["maria", "30 minutos", "Abertura", "08:00", "Auditório", "QR Code"]) assert.ok(m.includes(trecho), trecho);
});

test("Agendador: envia uma vez, respeita autorização e ignora telefone inválido", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sgja-"));
  process.env.DADOS_DIR = dir;
  process.env.WHATSAPP_PROVEDOR = "simulado";
  delete process.env.BASE44_APP_ID;
  fs.writeFileSync(path.join(dir, "Aluno.json"), JSON.stringify([
    { id: "A1", nome: "Ana Sousa", telefone: "86999990001", aceitaWhatsApp: true, atividades: ["EV01", "EV02"] },
    { id: "A2", nome: "Bruno Lima", telefone: "86999990002", aceitaWhatsApp: false, atividades: ["EV01"] },
    { id: "A3", nome: "Carla Reis", telefone: "123", aceitaWhatsApp: true, atividades: ["EV01"] },
    { id: "A4", nome: "Diego Rocha", telefone: "86999990004", aceitaWhatsApp: true, atividades: ["EV02"] },
    { id: "A5", nome: "Elisa Prado", telefone: "86999990005", aceitaWhatsApp: true }
  ]));
  const log = console.log; console.log = () => {};
  const L = require("../servicos/api-gateway/lembretes.js");
  try {
    const cedo = await L.executar(new Date("2026-12-09T07:00:00-03:00"));
    assert.equal(cedo.simulados, 0);

    const r1 = await L.executar(new Date("2026-12-09T07:31:00-03:00"));
    assert.deepEqual(r1.atividades, ["EV01"]);
    // só Ana: Bruno não autorizou, Carla tem telefone inválido,
    // Diego só se inscreveu na EV02 e Elisa não escolheu atividades
    assert.equal(r1.simulados, 1);

    const r2 = await L.executar(new Date("2026-12-09T07:40:00-03:00"));
    assert.equal(r2.simulados, 0); // não repete

    const enviados = JSON.parse(fs.readFileSync(path.join(dir, "lembretes-enviados.json"), "utf8"));
    assert.equal(enviados["A1:EV01"].status, "simulado");
    assert.equal(enviados["A1:EV01"].telefone, "5586999990001");
    assert.equal(enviados["A3:EV01"].erro, "telefone inválido");
    assert.equal(enviados["A2:EV01"], undefined);
    assert.equal(enviados["A4:EV01"], undefined);
    assert.equal(enviados["A5:EV01"], undefined);

    // À tarde, a EV02 vai para Ana e Diego (os inscritos nela)
    const tarde = await L.executar(new Date("2026-12-09T13:35:00-03:00"));
    assert.deepEqual(tarde.atividades, ["EV02"]);
    assert.equal(tarde.simulados, 2);

    const ag = await L.agenda();
    assert.equal(ag.autorizaramWhatsApp, 4);
    const ev1 = ag.atividades.find((a) => a.id === "EV01");
    assert.equal(ev1.envioEm, "2026-12-09T10:30:00.000Z");
    assert.equal(ev1.destinatarios, 2); // Ana e Carla (Carla falha pelo telefone)
    assert.equal(ag.atividades.find((a) => a.id === "EV03").destinatarios, 0);
  } finally { console.log = log; }
});

test("Agendador: falha do provedor é tentada de novo no minuto seguinte", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sgja-"));
  fs.writeFileSync(path.join(dir, "Aluno.json"), JSON.stringify([{ id: "A9", nome: "Davi Melo", telefone: "86999990009", aceitaWhatsApp: true, atividades: ["EV01"] }]));
  process.env.DADOS_DIR = dir;
  for (const k of Object.keys(require.cache)) if (k.includes("api-gateway")) delete require.cache[k];
  const wa = require("../servicos/api-gateway/whatsapp.js");
  const original = wa.enviar;
  let chamadas = 0;
  wa.enviar = async () => { chamadas++; if (chamadas === 1) throw new Error("instável"); return { status: "enviado", id: "x" }; };
  const err = console.error; console.error = () => {};
  try {
    const L = require("../servicos/api-gateway/lembretes.js");
    const r1 = await L.executar(new Date("2026-12-09T07:31:00-03:00"));
    assert.equal(r1.falhas, 1);
    const r2 = await L.executar(new Date("2026-12-09T07:32:00-03:00"));
    assert.equal(r2.enviados, 1);
    const r3 = await L.executar(new Date("2026-12-09T07:33:00-03:00"));
    assert.equal(r3.enviados, 0);
  } finally { wa.enviar = original; console.error = err; }
});
