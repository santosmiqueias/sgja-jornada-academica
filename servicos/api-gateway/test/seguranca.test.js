// Testes de segurança do servidor: tentam o que um invasor faria. Rodar: npm test (nesta pasta)
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sgja-seg-"));
Object.assign(process.env, {
  DADOS_DIR: dir, TOKEN_SEGREDO: crypto.randomBytes(32).toString("hex"), ASSINATURA_SEGREDO: crypto.randomBytes(32).toString("hex"),
  ORIGENS_PERMITIDAS: "https://site.exemplo", ALLOW_DEMO: "true", ALLOW_RESET: "false", LEMBRETES_ATIVO: "false"
});
delete process.env.BASE44_APP_ID; delete process.env.SMTP_USER;
const auth = require("../auth");
process.env.PROFESSOR_SENHA_HASH = auth.gerarHash("SenhaForte#2026");
const app = require("../server");
const C = require("../../../js/core.js");

let base, servidor;
test.before(() => new Promise((ok) => { servidor = app.listen(0, () => { base = `http://127.0.0.1:${servidor.address().port}/api/v1`; ok(); }); }));
test.after(() => servidor.close());

async function chamar(metodo, caminho, corpo, token, extra = {}) {
  const headers = { "Content-Type": "application/json", ...(extra.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  const r = await fetch(base + caminho, { method: metodo, headers, body: corpo === undefined ? undefined : (typeof corpo === "string" ? corpo : JSON.stringify(corpo)) });
  let dados = {}; try { dados = await r.json(); } catch (_) {}
  return { status: r.status, dados, headers: r.headers };
}

const alunoBase = (n) => ({
  nome: `Aluno Teste ${"ABCDEFGHIJ"[n]}`, email: `aluno${n}@exemplo.com`, telefone: "86999990000".slice(0, 9) + String(10 + n),
  cpf: ["52998224725", "11144477735", "39053344705", "15350946056"][n], matricula: String(20269000 + n), curso: "Direito",
  atividades: ["EV01", "EV02", "EV03"], consentimentoLGPD: true, aceitaWhatsApp: true
});

let tokenProf, ana, tokenCom;

test("rotas antigas sem login não existem mais (vazamento em massa)", async () => {
  for (const ent of ["Aluno", "MembroComissao", "Frequencia"]) assert.equal((await chamar("GET", `/entidades/${ent}`)).status, 404);
  assert.equal((await chamar("POST", "/certificados/enviar", { para: "vitima@exemplo.com", pdfBase64: "JVBERi0=" })).status, 404);
});

test("dados do painel exigem login de professor", async () => {
  assert.equal((await chamar("GET", "/professor/dados")).status, 401);
  assert.equal((await chamar("GET", "/professor/dados", undefined, "token.falso")).status, 401);
  const forjado = Buffer.from(JSON.stringify({ perfil: "professor", exp: Date.now() + 1e6 })).toString("base64url") + ".assinaturaFalsa";
  assert.equal((await chamar("GET", "/professor/dados", undefined, forjado)).status, 401);
  const vencido = auth.assinarToken({ perfil: "professor" }, -1);
  assert.equal((await chamar("GET", "/professor/dados", undefined, vencido)).status, 401);
});

test("token de comissão adulterado para virar professor é recusado", async () => {
  const t = auth.assinarToken({ perfil: "comissao", sub: "X" }, 10);
  const [corpo, assin] = t.split(".");
  const dados = JSON.parse(Buffer.from(corpo, "base64url"));
  dados.perfil = "professor";
  const adulterado = Buffer.from(JSON.stringify(dados)).toString("base64url") + "." + assin;
  assert.equal((await chamar("GET", "/professor/dados", undefined, adulterado)).status, 401);
  assert.equal((await chamar("GET", "/professor/dados", undefined, t)).status, 401); // perfil errado
});

test("login do professor: senha errada recusada, certa entra", async () => {
  assert.equal((await chamar("POST", "/professor/login", { senha: "2026" })).status, 401);
  const r = await chamar("POST", "/professor/login", { senha: "SenhaForte#2026" });
  assert.equal(r.status, 200);
  tokenProf = r.dados.token;
  assert.equal((await chamar("GET", "/professor/dados", undefined, tokenProf)).status, 200);
});

test("inscrição: valida no servidor e bloqueia duplicados e entradas maliciosas", async () => {
  const r = await chamar("POST", "/publico/inscricoes", alunoBase(0));
  assert.equal(r.status, 201);
  ana = r.dados.aluno;
  assert.ok(ana.tokenIngresso && !("telefone" in ana));
  assert.equal((await chamar("POST", "/publico/inscricoes", alunoBase(0))).status, 409);
  assert.equal((await chamar("POST", "/publico/inscricoes", { ...alunoBase(1), cpf: "12345678900" })).status, 400);
  const xss = await chamar("POST", "/publico/inscricoes", { ...alunoBase(1), nome: "<img src=x onerror=alert(1)> Silva" });
  assert.equal(xss.status, 400);
  assert.equal((await chamar("POST", "/publico/inscricoes", { ...alunoBase(1), curso: "Curso Inventado" })).status, 400);
  assert.equal((await chamar("POST", "/publico/inscricoes", '{"nome": quebrado')).status, 400);
  assert.equal((await chamar("POST", "/publico/inscricoes", { ...alunoBase(1), lixo: "x".repeat(30000) })).status, 413);
  assert.equal((await chamar("POST", "/publico/inscricoes", { ...alunoBase(1), __proto__: { admin: true }, id: "FORJADO" })).status, 201);
  const dados = (await chamar("GET", "/professor/dados", undefined, tokenProf)).dados;
  assert.ok(!dados.alunos.some((a) => a.id === "FORJADO" || a.admin), "id/campos extras não podem ser impostos por quem envia");
});

test("consulta do participante exige CPF + e-mail e não vaza dados de outros", async () => {
  assert.equal((await chamar("POST", "/publico/participante", { cpf: alunoBase(0).cpf, email: "outro@exemplo.com" })).status, 404);
  const ok = await chamar("POST", "/publico/participante", { cpf: alunoBase(0).cpf, email: alunoBase(0).email });
  assert.equal(ok.status, 200);
  assert.equal(ok.dados.aluno.nome, alunoBase(0).nome);
  assert.ok(!("telefone" in ok.dados.aluno));
  const existe = await chamar("POST", "/publico/cpf-inscrito", { cpf: alunoBase(0).cpf });
  assert.deepEqual(Object.keys(existe.dados), ["inscrito"]);
});

test("força bruta no e-mail de um CPF é bloqueada após 5 erros", async () => {
  const cpf = alunoBase(1).cpf;
  for (let i = 0; i < 5; i++) await chamar("POST", "/publico/participante", { cpf, email: `chute${i}@exemplo.com` });
  assert.equal((await chamar("POST", "/publico/participante", { cpf, email: "chute@exemplo.com" })).status, 429);
});

test("comissão: cadastro pendente não entra; após liberação entra; lista não vaza contatos", async () => {
  const cad = await chamar("POST", "/comissao/cadastro", { nome: "Paula Martins Lima", email: "paula@exemplo.com", cpf: "39053344705", telefone: "86999991111", senha: "senha1234" });
  assert.equal(cad.status, 201);
  assert.ok(!("senhaHash" in cad.dados.membro) && !("salt" in cad.dados.membro));
  assert.equal((await chamar("POST", "/comissao/login", { email: "paula@exemplo.com", senha: "senha1234" })).status, 403);
  assert.equal((await chamar("PUT", `/professor/membros/${cad.dados.membro.id}`, { status: "ativo" })).status, 401);
  assert.equal((await chamar("PUT", `/professor/membros/${cad.dados.membro.id}`, { status: "ativo" }, tokenProf)).status, 200);
  assert.equal((await chamar("POST", "/comissao/login", { email: "paula@exemplo.com", senha: "errada123" })).status, 401);
  const login = await chamar("POST", "/comissao/login", { email: "paula@exemplo.com", senha: "senha1234" });
  assert.equal(login.status, 200);
  tokenCom = login.dados.token;
  const ch = await chamar("GET", "/comissao/chamada?eventoId=EV01", undefined, tokenCom);
  assert.equal(ch.status, 200);
  const a = ch.dados.alunos[0];
  assert.ok(!("email" in a) && !("telefone" in a) && !("cpf" in a) && /^\*\*\*\./.test(a.cpfMascarado));
  assert.equal((await chamar("GET", "/professor/dados", undefined, tokenCom)).status, 401);
});

test("QR Code forjado é recusado; QR verdadeiro registra presença com o nome do membro", async () => {
  const forjado = await C.gerarTokenIngresso(ana.id, alunoBase(0).cpf, "SGJA-6JA-UNINASSAU-2026");
  assert.equal((await chamar("POST", "/comissao/checkin", { qr: forjado, eventoId: "EV01" }, tokenCom)).status, 400);
  const ok = await chamar("POST", "/comissao/checkin", { qr: ana.tokenIngresso, eventoId: "EV01" }, tokenCom);
  assert.equal(ok.status, 200); assert.equal(ok.dados.novo, true);
  assert.equal((await chamar("POST", "/comissao/checkin", { alunoId: ana.id, eventoId: "EV01" })).status, 401);
  const dados = (await chamar("GET", "/professor/dados", undefined, tokenProf)).dados;
  assert.equal(dados.frequencias.find((f) => f.alunoId === ana.id).registradoPorNome, "Paula Martins Lima");
});

test("certificado: participante não apto não emite; horas não podem ser impostas", async () => {
  const r = await chamar("POST", "/publico/certificado", { cpf: alunoBase(0).cpf, email: alunoBase(0).email, horas: 20 });
  assert.equal(r.status, 403);
  for (const ev of ["EV02", "EV03"]) await chamar("POST", "/comissao/checkin", { cpf: alunoBase(0).cpf, eventoId: ev }, tokenCom);
  const ok = await chamar("POST", "/publico/certificado", { cpf: alunoBase(0).cpf, email: alunoBase(0).email, horas: 20 });
  assert.equal(ok.status, 200);
  assert.equal(ok.dados.certificado.horas, 10); // calculado pelas presenças, não pelo que foi enviado
  const v = await chamar("GET", `/publico/certificados/${ok.dados.certificado.codigo}`);
  assert.equal(v.status, 200);
  assert.ok(!("cpf" in v.dados.certificado) && !("alunoId" in v.dados.certificado));
  assert.equal((await chamar("GET", "/publico/certificados/AAAA-BBBB-CCCC")).status, 404);
  assert.equal((await chamar("GET", "/publico/certificados/..%2F..%2Fetc%2Fpasswd")).status, 404);
});

test("e-mail do certificado só vai para o e-mail da inscrição e só com PDF de verdade", async () => {
  const cred = { cpf: alunoBase(0).cpf, email: alunoBase(0).email };
  assert.equal((await chamar("POST", "/publico/certificado/email", { ...cred, pdfBase64: Buffer.from("<html>spam</html>").toString("base64") })).status, 400);
  const r = await chamar("POST", "/publico/certificado/email", { ...cred, para: "vitima@exemplo.com", pdfBase64: Buffer.from("%PDF-1.4 teste").toString("base64") });
  assert.equal(r.status, 200);
  assert.equal(r.dados.para, "al***@exemplo.com");
  const emails = (await chamar("GET", "/professor/dados", undefined, tokenProf)).dados.emails;
  assert.ok(emails.every((m) => m.para === alunoBase(0).email));
});

test("membro bloqueado perde o acesso na hora, mesmo com token válido", async () => {
  const dados = (await chamar("GET", "/professor/dados", undefined, tokenProf)).dados;
  const paula = dados.membros.find((m) => m.email === "paula@exemplo.com");
  await chamar("PUT", `/professor/membros/${paula.id}`, { status: "bloqueado" }, tokenProf);
  assert.equal((await chamar("GET", "/comissao/chamada?eventoId=EV01", undefined, tokenCom)).status, 403);
  assert.equal((await chamar("POST", "/comissao/checkin", { alunoId: ana.id, eventoId: "EV04" }, tokenCom)).status, 403);
});

test("apagar todos os dados fica desligado por padrão", async () => {
  assert.equal((await chamar("POST", "/professor/limpar", undefined, tokenProf)).status, 403);
});

test("cabeçalhos de segurança e CORS restrito", async () => {
  const r = await chamar("GET", "/publico/resumo");
  assert.equal(r.headers.get("x-frame-options"), "DENY");
  assert.equal(r.headers.get("x-content-type-options"), "nosniff");
  assert.match(r.headers.get("content-security-policy"), /default-src 'none'/);
  assert.equal(r.headers.get("x-powered-by"), null);
  assert.equal(r.headers.get("cache-control"), "no-store");
  const malicioso = await chamar("GET", "/publico/resumo", undefined, null, { headers: { Origin: "https://site-malicioso.exemplo" } });
  assert.equal(malicioso.headers.get("access-control-allow-origin"), null);
  const permitido = await chamar("GET", "/publico/resumo", undefined, null, { headers: { Origin: "https://site.exemplo" } });
  assert.equal(permitido.headers.get("access-control-allow-origin"), "https://site.exemplo");
  const pre = await fetch(base + "/publico/resumo", { method: "OPTIONS", headers: { Origin: "https://site-malicioso.exemplo" } });
  assert.equal(pre.status, 403);
});

test("arquivos de dados não ficam legíveis por outros usuários do servidor", () => {
  const modo = fs.statSync(path.join(dir, "Aluno.json")).mode & 0o777;
  assert.equal(modo & 0o077, 0);
});

test("força bruta na senha do professor é bloqueada", async () => {
  let ultimo;
  for (let i = 0; i < 6; i++) ultimo = await chamar("POST", "/professor/login", { senha: `chute${i}` });
  assert.equal(ultimo.status, 429);
});

test("limite de inscrições por minuto contra robôs", async () => {
  let ultimo;
  for (let i = 0; i < 12; i++) ultimo = await chamar("POST", "/publico/inscricoes", { nome: "x" });
  assert.equal(ultimo.status, 429);
});
