/*
 * S.G.J.A — API Gateway (microsserviço)
 *  GET  /health                          → status do serviço
 *  GET  /api/v1/entidades/:entidade      → lista registros (proxy Base44, chave fica no servidor)
 *  POST /api/v1/entidades/:entidade      → cria registro
 *  PUT  /api/v1/entidades/:entidade/:id  → atualiza registro
 *  POST /api/v1/certificados/enviar      → envia o PDF do certificado por e-mail (Nodemailer)
 *  GET  /api/v1/lembretes/agenda         → quando sai cada lembrete de WhatsApp e quantos já foram
 * Também roda o agendador de lembretes por WhatsApp (30 min antes de cada atividade).
 */
const express = require("express");
const nodemailer = require("nodemailer");

require("./env");
const lembretes = require("./lembretes");

const ENTIDADES = new Set(["Aluno", "Frequencia", "Certificado", "EmailEnviado"]);
const ORIGENS = (process.env.ORIGENS_PERMITIDAS || "").split(",").map((s) => s.trim()).filter(Boolean);
const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "3mb" })); // PDF em base64 cabe com folga

// CORS só para os domínios do site.
app.use((req, res, next) => {
  const origem = req.headers.origin;
  if (origem && ORIGENS.includes(origem)) {
    res.setHeader("Access-Control-Allow-Origin", origem);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  }
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

// Limite simples de requisições por IP (60 por minuto).
const acessos = new Map();
app.use((req, res, next) => {
  const ip = req.ip, agora = Date.now();
  const reg = acessos.get(ip) || { n: 0, inicio: agora };
  if (agora - reg.inicio > 60000) { reg.n = 0; reg.inicio = agora; }
  reg.n += 1; acessos.set(ip, reg);
  if (reg.n > 60) return res.status(429).json({ erro: "Muitas requisições. Tente em 1 minuto." });
  next();
});

app.get("/health", (_req, res) => res.json({ status: "ok", servico: "sgja-api-gateway", hora: new Date().toISOString() }));

async function base44(metodo, caminho, corpo) {
  const { BASE44_APP_ID, BASE44_API_KEY } = process.env;
  if (!BASE44_APP_ID || !BASE44_API_KEY) throw Object.assign(new Error("Base44 não configurado"), { status: 503 });
  const r = await fetch(`https://app.base44.com/api/apps/${BASE44_APP_ID}/entities/${caminho}`, {
    method: metodo, headers: { api_key: BASE44_API_KEY, "Content-Type": "application/json" },
    body: corpo ? JSON.stringify(corpo) : undefined
  });
  const dados = await r.json().catch(() => null);
  if (!r.ok) throw Object.assign(new Error("Erro no Base44"), { status: r.status, dados });
  return dados;
}

function entidadeValida(req, res, next) {
  if (!ENTIDADES.has(req.params.entidade)) return res.status(404).json({ erro: "Entidade inexistente" });
  next();
}

app.get("/api/v1/entidades/:entidade", entidadeValida, async (req, res, next) => {
  try { res.json(await base44("GET", req.params.entidade)); } catch (e) { next(e); }
});

app.post("/api/v1/entidades/:entidade", entidadeValida, async (req, res, next) => {
  try {
    // Regra de proteção também no servidor: CPF/e-mail únicos.
    if (req.params.entidade === "Aluno") {
      const cpf = String(req.body.cpf || "").replace(/\D/g, "");
      const email = String(req.body.email || "").trim().toLowerCase();
      const todos = await base44("GET", "Aluno");
      if (todos.some((a) => a.cpf === cpf)) return res.status(409).json({ erro: "CPF já inscrito", campo: "cpf" });
      if (todos.some((a) => a.email === email)) return res.status(409).json({ erro: "E-mail já inscrito", campo: "email" });
    }
    res.status(201).json(await base44("POST", req.params.entidade, req.body));
  } catch (e) { next(e); }
});

app.put("/api/v1/entidades/:entidade/:id", entidadeValida, async (req, res, next) => {
  try { res.json(await base44("PUT", `${req.params.entidade}/${encodeURIComponent(req.params.id)}`, req.body)); } catch (e) { next(e); }
});

const transporte = process.env.SMTP_USER ? nodemailer.createTransport({
  host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT || 465), secure: Number(process.env.SMTP_PORT || 465) === 465,
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
}) : null;

app.post("/api/v1/certificados/enviar", async (req, res, next) => {
  try {
    const { para, nome, assunto, mensagem, arquivo, pdfBase64 } = req.body || {};
    if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(para || "")) return res.status(400).json({ erro: "E-mail inválido" });
    if (!pdfBase64 || !/^[A-Za-z0-9+/=]+$/.test(pdfBase64)) return res.status(400).json({ erro: "PDF ausente ou inválido" });
    const pdf = Buffer.from(pdfBase64, "base64");
    if (pdf.subarray(0, 4).toString() !== "%PDF") return res.status(400).json({ erro: "Anexo não é um PDF" });
    if (!transporte) return res.status(503).json({ erro: "SMTP não configurado" });
    const info = await transporte.sendMail({
      from: process.env.EMAIL_REMETENTE || process.env.SMTP_USER, to: para,
      subject: String(assunto || "Seu certificado").slice(0, 150), text: String(mensagem || `Olá, ${nome}! Segue seu certificado.`),
      attachments: [{ filename: String(arquivo || "certificado.pdf").replace(/[^\w.-]/g, "_"), content: pdf, contentType: "application/pdf" }]
    });
    res.json({ ok: true, id: info.messageId });
  } catch (e) { next(e); }
});

app.get("/api/v1/lembretes/agenda", async (_req, res, next) => {
  try { res.json(await lembretes.agenda()); } catch (e) { next(e); }
});

app.use((err, _req, res, _next) => {
  console.error(err.message);
  res.status(err.status || 500).json({ erro: err.status ? err.message : "Erro interno" });
});

const PORT = Number(process.env.PORT || 3000);
if (require.main === module) {
  app.listen(PORT, () => console.log(`S.G.J.A API Gateway em http://localhost:${PORT}`));
  if (process.env.LEMBRETES_ATIVO !== "false") {
    lembretes.iniciar();
    console.log("Agendador de lembretes WhatsApp ativo (verifica a cada minuto).");
  }
}
module.exports = app;
