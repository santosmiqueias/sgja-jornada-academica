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
  ORIGENS_PERMITIDAS: "https://site.exemplo", ALLOW_DEMO: "true", ALLOW_RESET: "false", LEMBRETES_ATIVO: "false", LIMITE_SUBMISSOES: "20", LIMITE_LOGIN_GOOGLE: "50", LIMITE_CONSULTAS: "50", CERTIFICADOS_A_PARTIR_DE: "2026-01-01"
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
  cpf: ["52998224725", "11144477735", "39053344705", "15350946056"][n], matricula: String(20269000 + n)
});
const pdfFalso = { nome: "trabalho.pdf", base64: Buffer.from("%PDF-1.4\nconteudo de teste").toString("base64") };
const submissao = (extra = {}) => ({
  titulo: "Horta comunitária na escola", vinculo: "APIEXT1", curso: "Direito", orientadores: ["Profª. Drª. Helena Martins Costa"],
  resumo: "Introdução: projeto de horta. Objetivos: educar. Método: oficinas semanais com a comunidade escolar. Resultados: maior consumo de verduras e participação das famílias. Considerações finais: a ação deve continuar no próximo semestre.",
  representante: alunoBase(0), participantes: [{ nome: alunoBase(1).nome, cpf: alunoBase(1).cpf, email: alunoBase(1).email }],
  consentimentoLGPD: true, aceitaWhatsApp: true, arquivo: pdfFalso, ...extra
});
const arquivosNoDisco = () => fs.readdirSync(path.join(dir, "arquivos")).length;

let tokenProf, ana, tokenCom;

test("rotas antigas sem login não existem mais (vazamento em massa)", async () => {
  for (const ent of ["Aluno", "MembroComissao", "Frequencia", "Trabalho"]) assert.equal((await chamar("GET", `/entidades/${ent}`)).status, 404);
  // /publico/inscricoes voltou com outra função (inscrição de participante, com validação e sem dados de terceiros):
  // ela recusa dados incompletos. Os testes dela estão no fim deste arquivo.
  assert.equal((await chamar("POST", "/publico/inscricoes", alunoBase(0))).status, 400);
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

test("submissão: valida no servidor, guarda o arquivo e bloqueia duplicados e entradas maliciosas", async () => {
  const r = await chamar("POST", "/publico/submissoes", submissao());
  assert.equal(r.status, 201);
  ana = r.dados.representante;
  assert.ok(ana.tokenIngresso && !("telefone" in ana));
  assert.equal(r.dados.trabalho.status, "em_analise");
  assert.equal(r.dados.participantes, 2);
  assert.equal(arquivosNoDisco(), 1);
  assert.equal((await chamar("POST", "/publico/submissoes", submissao())).status, 409);
  assert.equal((await chamar("POST", "/publico/submissoes", submissao({ titulo: "Outro", representante: { ...alunoBase(2), cpf: "12345678900" } }))).status, 400);
  assert.equal((await chamar("POST", "/publico/submissoes", submissao({ titulo: "Outro", representante: { ...alunoBase(2), nome: "<img src=x onerror=alert(1)> Silva" } }))).status, 400);
  assert.equal((await chamar("POST", "/publico/submissoes", submissao({ titulo: "Outro", curso: "Curso Inventado" }))).status, 400);
  assert.equal((await chamar("POST", "/publico/submissoes", submissao({ titulo: "Outro", resumo: "x".repeat(1501) }))).status, 400);
  // 1.501 letras recusa, mesmo com espaços (o caso aceito está em tests/base44.test.js)
  const comEspacos = Array(300).fill("abcde").join(" ");
  assert.equal((await chamar("POST", "/publico/submissoes", submissao({ titulo: "Resumo acima do limite", resumo: comEspacos + " a" }))).status, 400);
  assert.equal((await chamar("POST", "/publico/submissoes", '{"titulo": quebrado')).status, 400);
  assert.equal((await chamar("POST", "/publico/submissoes", submissao({ titulo: "Sem orientador", orientadores: [] }))).status, 400);
  assert.equal((await chamar("POST", "/publico/submissoes", submissao({ titulo: "Orientador repetido", orientadores: ["Ana Lima Souza", "ana lima souza"] }))).status, 400);
  assert.equal(arquivosNoDisco(), 1, "submissões recusadas não deixam arquivo no servidor");
});

test("arquivo: tipo conferido pelo conteúdo e tamanho máximo", async () => {
  const exe = Buffer.concat([Buffer.from("MZ"), Buffer.alloc(200)]).toString("base64");
  const disfarcado = await chamar("POST", "/publico/submissoes", submissao({ titulo: "Exe disfarcado", arquivo: { nome: "trabalho.pdf", base64: exe } }));
  assert.equal(disfarcado.status, 400);
  assert.match(disfarcado.dados.erro, /conteúdo/);
  assert.equal((await chamar("POST", "/publico/submissoes", submissao({ titulo: "Exe", arquivo: { nome: "virus.exe", base64: exe } }))).status, 400);
  const grande = Buffer.concat([Buffer.from("%PDF-1.4"), Buffer.alloc(10.5 * 1048576)]).toString("base64");
  assert.equal((await chamar("POST", "/publico/submissoes", submissao({ titulo: "Grande", arquivo: { nome: "grande.pdf", base64: grande } }))).status, 400);
  assert.equal((await chamar("POST", "/publico/submissoes", submissao({ titulo: "Sem arquivo", arquivo: undefined }))).status, 400);
  assert.equal(arquivosNoDisco(), 1);
});

test("regra do edital: APIExt II é sempre comunicação oral", async () => {
  const r = await chamar("POST", "/publico/submissoes", submissao({ titulo: "Teatro na comunidade", vinculo: "APIEXT2", modalidade: "banner", representante: alunoBase(2), participantes: [] }));
  assert.equal(r.status, 201);
  assert.equal(r.dados.trabalho.modalidade, "oral");
});

test("arquivo e avaliação dos trabalhos só para a organização", async () => {
  const dados = (await chamar("GET", "/professor/dados", undefined, tokenProf)).dados;
  const t = dados.trabalhos.find((x) => x.titulo === "Horta comunitária na escola");
  assert.equal((await fetch(`${base}/professor/trabalhos/${t.id}/arquivo`)).status, 401);
  assert.equal((await chamar("PUT", `/professor/trabalhos/${t.id}`, { status: "aprovado" })).status, 401);
  const r = await fetch(`${base}/professor/trabalhos/${t.id}/arquivo`, { headers: { Authorization: `Bearer ${tokenProf}` } });
  assert.equal(r.status, 200);
  assert.equal(r.headers.get("content-type"), "application/pdf");
  assert.match(r.headers.get("content-disposition"), /^attachment/);
  assert.equal(Buffer.from(await r.arrayBuffer()).toString().slice(0, 8), "%PDF-1.4");
  assert.equal((await fetch(`${base.replace("/api/v1", "")}/dados/arquivos/${t.arquivo.ref}`)).status, 404);
  assert.equal((await chamar("PUT", `/professor/trabalhos/${t.id}`, { sessao: "EV99" }, tokenProf)).status, 400);
  const ok = await chamar("PUT", `/professor/trabalhos/${t.id}`, { status: "aprovado", sessao: "EV02", parecer: "Muito bom." }, tokenProf);
  assert.equal(ok.status, 200);
  const consulta = await chamar("POST", "/publico/participante", { cpf: alunoBase(0).cpf, email: alunoBase(0).email });
  assert.equal(consulta.dados.trabalhos[0].status, "aprovado");
  assert.equal(consulta.dados.trabalhos[0].parecer, "Muito bom.");
  assert.ok(!("arquivo" in consulta.dados.trabalhos[0]) && !("resumo" in consulta.dados.trabalhos[0]));
  const depois = (await chamar("GET", "/professor/dados", undefined, tokenProf)).dados;
  assert.deepEqual(depois.alunos.find((a) => a.cpf === alunoBase(0).cpf).atividades, ["EV02"]); // lembrete da sessão
});

test("consulta do participante exige CPF + e-mail e não vaza dados de outros", async () => {
  assert.equal((await chamar("POST", "/publico/participante", { cpf: alunoBase(0).cpf, email: "outro@exemplo.com" })).status, 404);
  const ok = await chamar("POST", "/publico/participante", { cpf: alunoBase(0).cpf, email: alunoBase(0).email });
  assert.equal(ok.status, 200);
  assert.equal(ok.dados.aluno.nome, alunoBase(0).nome);
  assert.ok(!("telefone" in ok.dados.aluno));
  assert.equal((await chamar("POST", "/publico/cpf-inscrito", { cpf: alunoBase(0).cpf })).status, 404); // não existe mais
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

test("certificado: sem presença não emite; com 1 dia sai de 20h; horas não podem ser impostas", async () => {
  const dados = (await chamar("GET", "/professor/dados", undefined, tokenProf)).dados;
  const semPresenca = dados.alunos.find((a) => !dados.frequencias.some((f) => f.alunoId === a.id));
  assert.equal((await chamar("POST", `/professor/certificados/${semPresenca.id}`, undefined, tokenProf)).status, 403);
  const ok = await chamar("POST", "/publico/certificado", { cpf: alunoBase(0).cpf, email: alunoBase(0).email, horas: 5 });
  assert.equal(ok.status, 200);
  assert.equal(ok.dados.certificado.horas, 20); // regra do evento, não o que foi enviado
  assert.ok(Array.isArray(ok.dados.certificado.trabalhos)); // lista dos trabalhos apresentados (verso)
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

test("Submissão: representante aluno exige matrícula; público externo exige instituição e não guarda matrícula", async () => {
  const base = (rep, titulo) => submissao({ titulo, participantes: [], representante: rep });
  const aluno = { nome: "Rita Moura Lopes", email: "rita.aluna@exemplo.com", telefone: "86999995555", cpf: "45678912364", tipo: "aluno" };
  const semMat = await chamar("POST", "/publico/submissoes", base({ ...aluno, matricula: "" }, "Trabalho da aluna sem matrícula"));
  assert.equal(semMat.dados.campo, "r-matricula", JSON.stringify(semMat));
  const okAluno = await chamar("POST", "/publico/submissoes", base({ ...aluno, matricula: "20261234" }, "Trabalho da aluna com matrícula"));
  assert.equal(okAluno.status, 201);
  const ext = { nome: "Caio Brito Nunes", email: "caio.externo@exemplo.com", telefone: "86999996666", cpf: "23456789173", tipo: "externo", matricula: "99999999" };
  assert.equal((await chamar("POST", "/publico/submissoes", base({ ...ext, instituicao: "" }, "Trabalho externo sem instituição"))).dados.campo, "r-instituicao");
  const okExt = await chamar("POST", "/publico/submissoes", base({ ...ext, instituicao: "UFPI" }, "Trabalho externo com instituição"));
  assert.equal(okExt.status, 201);
  const c = (await chamar("GET", "/professor/dados", undefined, tokenProf)).dados.alunos.find((a) => a.cpf === "23456789173");
  assert.equal(c.publico, "externo"); assert.equal(c.instituicao, "UFPI"); assert.equal(c.matricula, "");
});

test("Arquivo: aceita documento (PDF, DOC, DOCX, ODT) e slides (PPT, PPTX, ODP) conferindo o conteúdo", async () => {
  const pk = Buffer.from([0x50, 0x4b, 0x03, 0x04]), ole = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
  const zip = (...partes) => Buffer.concat([pk, Buffer.alloc(26), ...partes.map((t) => Buffer.from(t, "latin1"))]);
  const verdadeiros = {
    "t.pdf": Buffer.from("%PDF-1.4 teste"), "t.doc": Buffer.concat([ole, Buffer.alloc(64)]), "t.ppt": Buffer.concat([ole, Buffer.alloc(64)]),
    "t.docx": zip("[Content_Types].xml", "word/document.xml"), "t.pptx": zip("[Content_Types].xml", "ppt/presentation.xml"),
    "t.odt": zip("mimetypeapplication/vnd.oasis.opendocument.text"), "t.odp": zip("mimetypeapplication/vnd.oasis.opendocument.presentation")
  };
  for (const [nome, buf] of Object.entries(verdadeiros)) {
    const r = app.conferirTipoArquivo(nome, buf);
    assert.ok(r.extensaoOk && r.conteudoOk, nome);
  }
  // Extensão trocada ou formato fora da lista: recusado
  assert.equal(app.conferirTipoArquivo("falso.pptx", verdadeiros["t.docx"]).conteudoOk, false);
  assert.equal(app.conferirTipoArquivo("falso.odp", verdadeiros["t.odt"]).conteudoOk, false);
  assert.equal(app.conferirTipoArquivo("falso.pdf", Buffer.from("MZ executavel")).conteudoOk, false);
  assert.equal(app.conferirTipoArquivo("t.txt", Buffer.from("texto")).extensaoOk, false);
  // Pela rota: slides com conteúdo falso não são gravados
  const r = await chamar("POST", "/publico/submissoes", submissao({ titulo: "Teste de slides falsos", arquivo: { nome: "apresentacao.pptx", base64: Buffer.from("MZ executavel").toString("base64") } }));
  assert.equal(r.status, 400); assert.equal(r.dados.campo, "arquivo");
});

test("limite de submissões por minuto contra robôs", async () => {
  let ultimo;
  for (let i = 0; i < 25; i++) ultimo = await chamar("POST", "/publico/submissoes", { titulo: "x" });
  assert.equal(ultimo.status, 429);
});

test("Hash do professor: tolera nome/aspas/espaços colados, recusa hash cortado e senha errada", () => {
  const h = auth.gerarHash("Senha Teste 2026");
  for (const v of [h, `PROFESSOR_SENHA_HASH=${h}`, `"${h}" `, `“${h}”`, `${h.slice(0, 40)}\n  ${h.slice(40)}`]) {
    assert.equal(auth.conferirHash("Senha Teste 2026", v), true);
    assert.equal(auth.conferirHash("Senha Errada 2026", v), false);
  }
  assert.equal(auth.conferirHash("Senha Teste 2026", h.slice(0, -5)), false);
  assert.equal(auth.diagnosticarHash(h.slice(0, -5)).ok, false);
  assert.equal(auth.diagnosticarHash("").motivo, "não definido");
});

/* ---------------- Login com Google (comissão) ---------------- */
const google = require("../google");
const parGoogle = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
const jwkGoogle = { ...parGoogle.publicKey.export({ format: "jwk" }), kid: "chave-teste", alg: "RS256", use: "sig" };
const CLIENTE = "123-teste.apps.googleusercontent.com";
function tokenGoogle(extra = {}, chavePrivada = parGoogle.privateKey, cab = {}) {
  const agora = Math.floor(Date.now() / 1000);
  const h = Buffer.from(JSON.stringify({ alg: "RS256", kid: "chave-teste", typ: "JWT", ...cab })).toString("base64url");
  const d = Buffer.from(JSON.stringify({ iss: "https://accounts.google.com", aud: CLIENTE, sub: "g-111", email: "lia.google@exemplo.com", email_verified: true, name: "Lia Campos Ferreira", iat: agora, exp: agora + 3600, ...extra })).toString("base64url");
  const s = crypto.sign("RSA-SHA256", Buffer.from(`${h}.${d}`), chavePrivada).toString("base64url");
  return `${h}.${d}.${s}`;
}

test("Google: desligado sem GOOGLE_CLIENT_ID", async () => {
  delete process.env.GOOGLE_CLIENT_ID;
  const r = await chamar("POST", "/comissao/google", { credencial: tokenGoogle() });
  assert.equal(r.status, 503);
});

test("Google: só aceita token assinado pelo Google, para o nosso app, válido e com e-mail verificado", async () => {
  process.env.GOOGLE_CLIENT_ID = CLIENTE;
  google._definirBuscaDeChaves(async () => ({ chaves: [jwkGoogle], validadeS: 3600 }));
  const outraChave = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey;
  const agora = Math.floor(Date.now() / 1000);
  for (const [nome, cred] of [
    ["assinado por outra chave", tokenGoogle({}, outraChave)],
    ["outro app (aud)", tokenGoogle({ aud: "outro.apps.googleusercontent.com" })],
    ["outro emissor", tokenGoogle({ iss: "https://malicioso.exemplo" })],
    ["expirado", tokenGoogle({ exp: agora - 3600 })],
    ["e-mail não verificado", tokenGoogle({ email_verified: false })],
    ["sem assinatura (alg none)", tokenGoogle({}, parGoogle.privateKey, { alg: "none" })],
    ["lixo", "abc.def.ghi"],
    ["vazio", ""]
  ]) {
    const r = await chamar("POST", "/comissao/google", { credencial: cred });
    assert.equal(r.status, 401, nome);
    assert.ok(!JSON.stringify(r.dados).includes("lia.google"), `${nome}: não revela dados`);
  }
});

test("Google: sem cadastro pede CPF e telefone; cadastro fica pendente até o professor liberar", async () => {
  process.env.GOOGLE_CLIENT_ID = CLIENTE;
  const sem = await chamar("POST", "/comissao/google", { credencial: tokenGoogle() });
  assert.equal(sem.status, 404);
  assert.equal(sem.dados.campo, "precisa-cadastro");
  assert.deepEqual(sem.dados.google, { nome: "Lia Campos Ferreira", email: "lia.google@exemplo.com" });

  assert.equal((await chamar("POST", "/comissao/google/cadastro", { credencial: tokenGoogle(), cpf: "123", telefone: "86999998888" })).status, 400);
  const cad = await chamar("POST", "/comissao/google/cadastro", { credencial: tokenGoogle(), cpf: "86288366757", telefone: "86999998888" });
  assert.equal(cad.status, 201);
  assert.equal(cad.dados.membro.status, "pendente");
  assert.equal((await chamar("POST", "/comissao/google/cadastro", { credencial: tokenGoogle(), cpf: "86288366757", telefone: "86999998888" })).status, 409);

  assert.equal((await chamar("POST", "/comissao/google", { credencial: tokenGoogle() })).status, 403); // pendente
  assert.equal((await chamar("PUT", `/professor/membros/${cad.dados.membro.id}`, { status: "ativo" }, tokenProf)).status, 200);
  const ok = await chamar("POST", "/comissao/google", { credencial: tokenGoogle() });
  assert.equal(ok.status, 200);
  assert.equal(ok.dados.membro.nome, "Lia Campos Ferreira");
  assert.equal((await chamar("GET", "/comissao/chamada?eventoId=EV01", undefined, ok.dados.token)).status, 200);

  // Quem entrou pelo Google não tem senha: e-mail + senha vazia ou qualquer senha é recusado.
  assert.equal((await chamar("POST", "/comissao/login", { email: "lia.google@exemplo.com", senha: "" })).status, 401);
  assert.equal((await chamar("POST", "/comissao/login", { email: "lia.google@exemplo.com", senha: "qualquer123" })).status, 401);
  // Dados internos não saem para o painel.
  const dados = (await chamar("GET", "/professor/dados", undefined, tokenProf)).dados;
  const lia = dados.membros.find((m) => m.email === "lia.google@exemplo.com");
  assert.ok(lia && !("googleSub" in lia) && !("senhaHash" in lia) && !("salt" in lia));
});

test("Google: liga a conta a um cadastro antigo com o mesmo e-mail, mas recusa outra conta Google com esse e-mail", async () => {
  process.env.GOOGLE_CLIENT_ID = CLIENTE;
  const r = await chamar("POST", "/comissao/google", { credencial: tokenGoogle({ sub: "g-222", email: "comissao.antiga@exemplo.com", name: "Rui Antigo Lima" }) });
  assert.equal(r.status, 404); // ainda não existe
  const cad = await chamar("POST", "/comissao/cadastro", { nome: "Rui Antigo Lima", email: "comissao.antiga@exemplo.com", cpf: "71428793860", telefone: "86999997777", senha: "senha1234" });
  assert.equal(cad.status, 201);
  await chamar("PUT", `/professor/membros/${cad.dados.membro.id}`, { status: "ativo" }, tokenProf);
  assert.equal((await chamar("POST", "/comissao/google", { credencial: tokenGoogle({ sub: "g-222", email: "comissao.antiga@exemplo.com" }) })).status, 200);
  assert.equal((await chamar("POST", "/comissao/google", { credencial: tokenGoogle({ sub: "g-999", email: "comissao.antiga@exemplo.com" }) })).status, 409);
  // A senha antiga continua valendo.
  assert.equal((await chamar("POST", "/comissao/login", { email: "comissao.antiga@exemplo.com", senha: "senha1234" })).status, 200);
});

/* ---------------- Inscrição de participante (sem trabalho) ---------------- */
test("Participante: inscreve com nome, CPF, e-mail e telefone, recebe ingresso e bloqueia duplicados", async () => {
  const dados = { nome: "Carla Mendes Rocha", cpf: "123.456.780-62", email: "Carla.Part@Exemplo.com", telefone: "(86) 99999-1212", consentimentoLGPD: true };
  assert.equal((await chamar("POST", "/publico/inscricoes", { ...dados, consentimentoLGPD: false })).status, 400);
  assert.equal((await chamar("POST", "/publico/inscricoes", { ...dados, cpf: "123.456.780-00" })).status, 400);
  assert.equal((await chamar("POST", "/publico/inscricoes", { ...dados, telefone: "123" })).status, 400);
  const ok = await chamar("POST", "/publico/inscricoes", dados);
  assert.equal(ok.status, 201);
  assert.equal(ok.dados.aluno.nome, "Carla Mendes Rocha");
  assert.equal(ok.dados.aluno.email, "carla.part@exemplo.com");
  assert.ok(ok.dados.aluno.tokenIngresso, "tem QR Code de ingresso");
  // Mesma pessoa de novo: não duplica e não devolve o ingresso sem comprovar o e-mail.
  const de_novo = await chamar("POST", "/publico/inscricoes", dados);
  assert.equal(de_novo.status, 409);
  assert.ok(!("aluno" in de_novo.dados));
  assert.equal((await chamar("POST", "/publico/inscricoes", { ...dados, email: "outro@exemplo.com" })).status, 409);   // CPF com outro e-mail
  assert.equal((await chamar("POST", "/publico/inscricoes", { ...dados, cpf: "234.567.891-73" })).status, 409);       // e-mail com outro CPF
  // Aparece no painel como participante, e a consulta de Meu certificado funciona com CPF + e-mail.
  const p = (await chamar("GET", "/professor/dados", undefined, tokenProf)).dados.alunos.find((a) => a.cpf === "12345678062");
  assert.equal(p.inscricao, "participante");
  assert.equal((await chamar("POST", "/publico/participante", { cpf: "12345678062", email: "carla.part@exemplo.com" })).status, 200);
});

test("Participante pelo Google: pede CPF e telefone, inscreve e devolve o ingresso de quem já está inscrito", async () => {
  process.env.GOOGLE_CLIENT_ID = CLIENTE;
  google._definirBuscaDeChaves(async () => ({ chaves: [jwkGoogle], validadeS: 3600 }));
  const conta = { sub: "g-part-1", email: "joao.part@exemplo.com", name: "João Pedro Alves" };
  assert.equal((await chamar("POST", "/publico/inscricoes/google", { credencial: tokenGoogle({ ...conta, aud: "outro" }) })).status, 401);
  const sem = await chamar("POST", "/publico/inscricoes/google", { credencial: tokenGoogle(conta) });
  assert.equal(sem.status, 404);
  assert.deepEqual(sem.dados.google, { nome: "João Pedro Alves", email: "joao.part@exemplo.com" });
  // O e-mail vem do Google, não do formulário (mesmo que alguém tente trocar).
  const cad = await chamar("POST", "/publico/inscricoes/google", { credencial: tokenGoogle(conta), cpf: "345.678.912-28", telefone: "86999991313", email: "invasor@exemplo.com", consentimentoLGPD: true });
  assert.equal(cad.status, 201);
  assert.equal(cad.dados.aluno.email, "joao.part@exemplo.com");
  assert.ok(cad.dados.aluno.tokenIngresso);
  const ja = await chamar("POST", "/publico/inscricoes/google", { credencial: tokenGoogle(conta) });
  assert.equal(ja.status, 200);
  assert.equal(ja.dados.jaInscrito, true);
  assert.equal(ja.dados.aluno.tokenIngresso, cad.dados.aluno.tokenIngresso);
  // E-mail do Google já inscrito com outro CPF: recusa.
  const outra = { sub: "g-part-2", email: "carla.part@exemplo.com", name: "Carla Mendes Rocha" };
  assert.equal((await chamar("POST", "/publico/inscricoes/google", { credencial: tokenGoogle(outra), cpf: "456.789.123-64", telefone: "86999991414", consentimentoLGPD: true })).status, 409);
  // O identificador do Google não sai no painel.
  const j = (await chamar("GET", "/professor/dados", undefined, tokenProf)).dados.alunos.find((a) => a.cpf === "34567891228");
  assert.ok(j && !("googleSub" in j));
});

test("Certificados: antes da data de liberação o participante não emite nem recebe por e-mail", async () => {
  const antes = process.env.CERTIFICADOS_A_PARTIR_DE;
  process.env.CERTIFICADOS_A_PARTIR_DE = "2099-12-14";
  try {
    const cred = { cpf: alunoBase(0).cpf, email: alunoBase(0).email };
    const r = await chamar("POST", "/publico/certificado", cred);
    assert.equal(r.status, 403);
    assert.match(r.dados.erro, /a partir de 14\/12\/2099/);
    assert.equal((await chamar("POST", "/publico/certificado/email", { ...cred, pdfBase64: "JVBERi0=" })).status, 403);
    // A consulta (resultado, ingresso, presença) continua funcionando.
    assert.equal((await chamar("POST", "/publico/participante", cred)).status, 200);
  } finally { process.env.CERTIFICADOS_A_PARTIR_DE = antes; }
});


