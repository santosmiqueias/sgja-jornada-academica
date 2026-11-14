/*
 * S.G.J.A — servidor (API) com login por perfil.
 *
 * Público (sem login, com limite de tentativas)
 *   GET  /api/v1/publico/resumo                  total de inscritos
 *   POST /api/v1/publico/submissoes              submissão de trabalho (com arquivo PDF/DOC/DOCX)
 *   POST /api/v1/publico/participante            { cpf, email } -> dados do próprio participante
 *   POST /api/v1/publico/certificado             { cpf, email } -> emite o certificado (se apto)
 *   POST /api/v1/publico/certificado/email       { cpf, email, pdfBase64 } -> envia ao e-mail da inscrição
 *   GET  /api/v1/publico/certificados/:codigo    validação pública
 * Comissão organizadora (login individual)
 *   POST /api/v1/comissao/cadastro | /login
 *   GET  /api/v1/comissao/chamada?eventoId=
 *   POST /api/v1/comissao/checkin                { eventoId, alunoId | cpf | qr }
 *   POST /api/v1/comissao/checkin/remover        { eventoId, alunoId }
 * Professor
 *   POST /api/v1/professor/login                 { senha }
 *   GET  /api/v1/professor/dados
 *   PUT  /api/v1/professor/membros/:id           { status }
 *   PUT  /api/v1/professor/trabalhos/:id         { status, parecer, sessao, horarioApresentacao, apresentado }
 *   GET  /api/v1/professor/trabalhos/:id/arquivo download do arquivo submetido
 *   POST /api/v1/professor/certificados/:alunoId
 *   POST /api/v1/professor/certificados/:alunoId/email  { pdfBase64 }
 *   GET  /api/v1/professor/lembretes/agenda
 *   POST /api/v1/professor/demo | /limpar        (só com ALLOW_DEMO / ALLOW_RESET = true)
 */
require("./env");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const express = require("express");
const nodemailer = require("nodemailer");
const C = require("../../js/core.js");
const { criarServico, ErroNegocio } = require("../../js/servico.js");
const { criarStore } = require("./store");
const auth = require("./auth");
const lembretes = require("./lembretes");

/* ---------- Configuração ---------- */
function carregarConfig() {
  const ctx = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "..", "..", "js", "config.js"), "utf8"), ctx);
  return ctx.window.SGJA_CONFIG;
}
const CFG = carregarConfig();
const SEGREDO = process.env.ASSINATURA_SEGREDO || "";
if (SEGREDO.length < 32) throw new Error("Defina ASSINATURA_SEGREDO no .env com pelo menos 32 caracteres aleatórios.");
auth.assinarToken({ teste: 1 }, 1); // falha cedo se TOKEN_SEGREDO estiver ausente
{
  const d = auth.diagnosticarHash(process.env.PROFESSOR_SENHA_HASH);
  if (d.ok) console.log(`PROFESSOR_SENHA_HASH: ${d.motivo}.`);
  else console.warn(`Aviso: PROFESSOR_SENHA_HASH ${d.motivo}. O login do professor não vai funcionar.`);
}

const store = criarStore();
const servico = criarServico({ store, config: CFG, core: C, segredo: SEGREDO });
const ORIGENS = (process.env.ORIGENS_PERMITIDAS || "").split(",").map((s) => s.trim()).filter(Boolean);
const SESSAO_PROF_MIN = Number(process.env.SESSAO_PROFESSOR_MIN || 120);
const SESSAO_COM_MIN = Number(process.env.SESSAO_COMISSAO_MIN || 240);

const app = express();
app.disable("x-powered-by");
if (process.env.TRUST_PROXY) app.set("trust proxy", 1); // atrás de Render/Railway/Nginx, para o IP real

/* ---------- Cabeçalhos de segurança e CORS ---------- */
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'");
  res.setHeader("Cache-Control", "no-store");
  if (req.secure) res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  const origem = req.headers.origin;
  if (origem && ORIGENS.includes(origem)) {
    res.setHeader("Access-Control-Allow-Origin", origem);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.setHeader("Access-Control-Max-Age", "600");
  }
  if (req.method === "OPTIONS") return res.sendStatus(origem && ORIGENS.includes(origem) ? 204 : 403);
  next();
});

const jsonPequeno = express.json({ limit: "20kb" });
const jsonPdf = express.json({ limit: "3mb" });
const geral = auth.limitador(240, 60000, "geral");
app.use("/api", geral);

const rota = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const campo = (v, max = 200) => String(v == null ? "" : v).slice(0, max);

app.get("/health", (_req, res) => res.json({ status: "ok" }));

/* ---------- Público ---------- */
app.get("/api/v1/publico/resumo", rota(async (_req, res) => res.json({ inscritos: await servico.contarInscritos() })));

/* ---------- Arquivos dos trabalhos ---------- */
const DIR_ARQ = path.join(process.env.DADOS_DIR || path.join(__dirname, "dados"), "arquivos");
fs.mkdirSync(DIR_ARQ, { recursive: true, mode: 0o700 });
const TIPOS = {
  pdf: { mime: "application/pdf", confere: (b) => b.subarray(0, 5).toString("latin1") === "%PDF-" },
  docx: { mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", confere: (b) => b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04 },
  doc: { mime: "application/msword", confere: (b) => b.subarray(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) }
};
const MAX_ARQ = CFG.submissao.arquivo.maxMB * 1048576;

// Confere extensão, tamanho e o conteúdo real do arquivo (assinatura), e grava com nome aleatório.
function salvarArquivo(arq) {
  const nome = String((arq && arq.nome) || "").slice(0, 120);
  const ext = nome.split(".").pop().toLowerCase();
  const tipo = TIPOS[ext];
  if (!tipo || !CFG.submissao.arquivo.extensoes.includes(ext)) throw new ErroNegocio("Envie o arquivo em PDF, DOC ou DOCX.", "arquivo");
  const b64 = String((arq && arq.base64) || "");
  if (!b64 || !/^[A-Za-z0-9+/=]+$/.test(b64)) throw new ErroNegocio("Arquivo ausente ou corrompido.", "arquivo");
  const buf = Buffer.from(b64, "base64");
  if (!buf.length || buf.length > MAX_ARQ) throw new ErroNegocio(`O arquivo pode ter no máximo ${CFG.submissao.arquivo.maxMB} MB.`, "arquivo");
  if (!tipo.confere(buf)) throw new ErroNegocio("O conteúdo do arquivo não corresponde a um PDF, DOC ou DOCX.", "arquivo");
  const ref = `${require("crypto").randomBytes(24).toString("hex")}.${ext}`;
  fs.writeFileSync(path.join(DIR_ARQ, ref), buf, { mode: 0o600 });
  return { nome: nome.replace(/[^\w.\- À-ÿ]/g, "_"), tipo: tipo.mime, tamanho: buf.length, ref };
}
const caminhoArquivo = (ref) => {
  if (!/^[a-f0-9]{48}\.(pdf|docx?)$/.test(String(ref))) throw new ErroNegocio("Arquivo não encontrado.", null, 404);
  return path.join(DIR_ARQ, ref);
};

app.post("/api/v1/publico/submissoes", auth.limitador(Number(process.env.LIMITE_SUBMISSOES || 5), 60000, "submissao"), express.json({ limit: "15mb" }), rota(async (req, res) => {
  const meta = salvarArquivo(req.body && req.body.arquivo);
  try {
    const { arquivo, ...dados } = req.body || {};
    res.status(201).json(await servico.submeterTrabalho(dados, meta));
  } catch (e) {
    fs.rmSync(path.join(DIR_ARQ, meta.ref), { force: true }); // não guarda arquivo de submissão recusada
    throw e;
  }
}));

// Consulta do próprio participante: CPF + e-mail, com bloqueio após 5 erros para o mesmo CPF.
async function comCredenciais(req, fn) {
  const cpf = C.soDigitos(campo(req.body && req.body.cpf, 20));
  const email = campo(req.body && req.body.email, 120);
  const chave = `participante:${cpf}`;
  if (auth.contaBloqueada(chave)) throw new ErroNegocio("Muitas tentativas para este CPF. Tente de novo em 15 minutos.", null, 429);
  try { const r = await fn(cpf, email); auth.limparFalhas(chave); return r; }
  catch (e) { if (e.status === 404) auth.registrarFalha(chave); throw e; }
}
const limiteConsulta = auth.limitador(10, 60000, "consulta");

app.post("/api/v1/publico/participante", limiteConsulta, jsonPequeno, rota(async (req, res) => {
  res.json(await comCredenciais(req, (cpf, email) => servico.consultarParticipante(cpf, email)));
}));

app.post("/api/v1/publico/certificado", limiteConsulta, jsonPequeno, rota(async (req, res) => {
  const cert = await comCredenciais(req, (cpf, email) => servico.emitirCertificadoParticipante(cpf, email));
  res.json({ certificado: publicoCert(cert) });
}));

app.post("/api/v1/publico/certificado/email", auth.limitador(3, 60000, "email-participante"), jsonPdf, rota(async (req, res) => {
  const aluno = await comCredenciais(req, (cpf, email) => servico.identificarParticipante(cpf, email));
  res.json(await enviarCertificado(aluno, req.body && req.body.pdfBase64));
}));

app.get("/api/v1/publico/certificados/:codigo", auth.limitador(30, 60000, "validar"), rota(async (req, res) => {
  const cert = await servico.buscarCertificadoPorCodigo(campo(req.params.codigo, 20));
  if (!cert) return res.status(404).json({ erro: "Certificado não encontrado." });
  res.json({ certificado: cert });
}));

/* ---------- Comissão organizadora ---------- */
app.post("/api/v1/comissao/cadastro", auth.limitador(5, 60000, "cadastro"), jsonPequeno, rota(async (req, res) => {
  res.status(201).json({ membro: publicoMembro(await servico.cadastrarMembro(req.body)) });
}));

app.post("/api/v1/comissao/login", auth.limitador(10, 60000, "login-comissao"), jsonPequeno, rota(async (req, res) => {
  const email = C.normalizarEmail(campo(req.body && req.body.email, 120));
  const chave = `comissao:${email}`;
  if (auth.contaBloqueada(chave)) throw new ErroNegocio("Muitas tentativas. Acesso bloqueado por 15 minutos.", null, 429);
  try {
    const m = await servico.autenticarMembro(email, campo(req.body && req.body.senha, 200));
    auth.limparFalhas(chave);
    res.json({ token: auth.assinarToken({ perfil: "comissao", sub: m.id, nome: m.nome }, SESSAO_COM_MIN), membro: publicoMembro(m) });
  } catch (e) { if (e.status === 401) auth.registrarFalha(chave); throw e; }
}));

const comissao = auth.exigir("comissao");
app.get("/api/v1/comissao/chamada", comissao, rota(async (req, res) => {
  res.json(await servico.chamada(req.sessao.sub, campo(req.query.eventoId, 10)));
}));

app.post("/api/v1/comissao/checkin", comissao, jsonPequeno, rota(async (req, res) => {
  const b = req.body || {}, ev = campo(b.eventoId, 10), id = req.sessao.sub;
  let r;
  if (b.qr) r = await servico.checkinPorQR(id, campo(b.qr, 200), ev);
  else if (b.cpf) r = await servico.checkinPorCPF(id, campo(b.cpf, 20), ev);
  else r = await servico.registrarCheckin(id, campo(b.alunoId, 40), ev, campo(b.origem, 10));
  res.json(r);
}));

app.post("/api/v1/comissao/checkin/remover", comissao, jsonPequeno, rota(async (req, res) => {
  await servico.removerCheckin(req.sessao.sub, campo(req.body && req.body.alunoId, 40), campo(req.body && req.body.eventoId, 10));
  res.json({ ok: true });
}));

/* ---------- Professor ---------- */
app.post("/api/v1/professor/login", auth.limitador(10, 60000, "login-professor"), jsonPequeno, rota(async (req, res) => {
  if (auth.contaBloqueada("professor")) throw new ErroNegocio("Muitas tentativas. Acesso bloqueado por 15 minutos.", null, 429);
  const hash = process.env.PROFESSOR_SENHA_HASH;
  if (!hash || !auth.conferirHash(campo(req.body && req.body.senha, 200), hash)) {
    auth.registrarFalha("professor");
    throw new ErroNegocio("Senha incorreta.", null, 401);
  }
  auth.limparFalhas("professor");
  res.json({ token: auth.assinarToken({ perfil: "professor", sub: "professor" }, SESSAO_PROF_MIN) });
}));

const professor = auth.exigir("professor");
app.get("/api/v1/professor/dados", professor, rota(async (_req, res) => res.json(await servico.dadosPainel())));

app.put("/api/v1/professor/membros/:id", professor, jsonPequeno, rota(async (req, res) => {
  res.json({ membro: await servico.definirStatusMembro(campo(req.params.id, 40), campo(req.body && req.body.status, 20)) });
}));

app.put("/api/v1/professor/trabalhos/:id", professor, jsonPequeno, rota(async (req, res) => {
  res.json({ trabalho: await servico.avaliarTrabalho(campo(req.params.id, 40), req.body) });
}));

app.get("/api/v1/professor/trabalhos/:id/arquivo", professor, rota(async (req, res) => {
  const arq = await servico.arquivoDoTrabalho(campo(req.params.id, 40));
  const caminho = caminhoArquivo(arq.ref);
  if (!fs.existsSync(caminho)) throw new ErroNegocio("Arquivo não encontrado.", null, 404);
  const ext = arq.ref.split(".").pop();
  res.setHeader("Content-Type", TIPOS[ext].mime);
  res.setHeader("Content-Disposition", `attachment; filename="trabalho.${ext}"; filename*=UTF-8''${encodeURIComponent(arq.nome)}`);
  fs.createReadStream(caminho).pipe(res);
}));

app.post("/api/v1/professor/certificados/:alunoId", professor, rota(async (req, res) => {
  res.json({ certificado: await servico.emitirCertificado(campo(req.params.alunoId, 40)) });
}));

app.post("/api/v1/professor/certificados/:alunoId/email", professor, jsonPdf, rota(async (req, res) => {
  res.json(await enviarCertificado(await servico.alunoParaEmail(campo(req.params.alunoId, 40)), req.body && req.body.pdfBase64));
}));

app.get("/api/v1/professor/lembretes/agenda", professor, rota(async (_req, res) => res.json(await lembretes.agenda())));

app.post("/api/v1/professor/demo", professor, rota(async (_req, res) => {
  if (process.env.ALLOW_DEMO !== "true") throw new ErroNegocio("Dados de demonstração desativados neste servidor.", null, 403);
  await servico.popularDemo(); res.json({ ok: true });
}));

app.post("/api/v1/professor/limpar", professor, rota(async (_req, res) => {
  if (process.env.ALLOW_RESET !== "true") throw new ErroNegocio("Apagar dados está desativado neste servidor.", null, 403);
  await servico.limparTudo(); res.json({ ok: true });
}));

/* ---------- Envio de certificado por e-mail ---------- */
const transporte = process.env.SMTP_USER ? nodemailer.createTransport({
  host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT || 465), secure: Number(process.env.SMTP_PORT || 465) === 465,
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
}) : null;

// Destino é sempre o e-mail da inscrição, e o texto é montado aqui (o servidor não envia conteúdo de terceiros).
async function enviarCertificado(aluno, pdfBase64) {
  const cert = await servico.emitirCertificado(aluno.id); // confere que está apto
  const b64 = String(pdfBase64 || "");
  if (!b64 || b64.length > 2.8e6 || !/^[A-Za-z0-9+/=]+$/.test(b64)) throw new ErroNegocio("PDF ausente ou inválido.");
  const pdf = Buffer.from(b64, "base64");
  if (pdf.subarray(0, 5).toString() !== "%PDF-") throw new ErroNegocio("O anexo não é um PDF.");
  const nomeArq = `certificado-jornada-${aluno.nome.normalize("NFD").replace(/[^A-Za-z0-9]+/g, "-").toLowerCase()}.pdf`;
  const assunto = CFG.email.assunto;
  const mensagem = `Olá, ${aluno.nome.split(" ")[0]}!\n\nObrigado por participar da ${CFG.evento.nome} da ${CFG.evento.sigla} Teresina.\n` +
    `Segue em anexo o seu certificado de ${cert.horas} horas.\n\nCódigo de autenticidade: ${cert.codigo}\n\nComissão Organizadora — ${CFG.evento.instituicao}`;
  let status = "simulado";
  if (transporte) {
    try {
      await transporte.sendMail({ from: process.env.EMAIL_REMETENTE || process.env.SMTP_USER, to: aluno.email, subject: assunto, text: mensagem,
        attachments: [{ filename: nomeArq, content: pdf, contentType: "application/pdf" }] });
      status = "enviado";
    } catch (e) { console.error("SMTP:", e.message); status = "falhou"; }
  }
  await servico.registrarEnvio(aluno, cert, assunto, mensagem, nomeArq, status, transporte ? "smtp" : "simulado");
  if (status === "falhou") throw new ErroNegocio("Não foi possível enviar o e-mail agora.", null, 502);
  const [u, d] = aluno.email.split("@");
  return { status, para: `${u.slice(0, 2)}***@${d}` };
}

const publicoCert = (c) => ({ codigo: c.codigo, nome: c.nome, curso: c.curso, horas: c.horas, atividades: c.atividades, trabalhos: c.trabalhos || [], emitidoEm: c.emitidoEm, enviadoPorEmail: !!c.enviadoPorEmail });
const publicoMembro = (m) => ({ id: m.id, nome: m.nome, status: m.status });

/* ---------- Erros ---------- */
app.use((_req, res) => res.status(404).json({ erro: "Rota não encontrada." }));
app.use((err, _req, res, _next) => {
  if (err.type === "entity.parse.failed") return res.status(400).json({ erro: "Dados enviados em formato inválido." });
  if (err.type === "entity.too.large") return res.status(413).json({ erro: "Dados enviados grandes demais." });
  if (err instanceof ErroNegocio || err.name === "ErroNegocio") return res.status(err.status || 400).json({ erro: err.message, campo: err.campo || undefined });
  console.error(err);
  res.status(err.status && err.status < 500 ? err.status : 500).json({ erro: "Erro interno." });
});

const PORT = Number(process.env.PORT || 3000);
if (require.main === module) {
  app.listen(PORT, () => console.log(`S.G.J.A API em http://localhost:${PORT}`));
  if (process.env.LEMBRETES_ATIVO !== "false") { lembretes.iniciar(); console.log("Agendador de lembretes WhatsApp ativo."); }
}
module.exports = app;
