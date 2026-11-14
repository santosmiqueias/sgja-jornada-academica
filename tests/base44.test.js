// Coerência entre o código e o Base44: os registros que o sistema grava de verdade
// (submissões, avaliação, check-in, certificados, e-mails, comissão e lembretes)
// precisam caber exatamente nos esquemas de base44/entities/*.jsonc.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const vm = require("vm");

const RAIZ = path.join(__dirname, "..");
const DIR_ENT = path.join(RAIZ, "base44", "entities");
const lerJSONC = (arq) => JSON.parse(fs.readFileSync(arq, "utf8").split("\n").filter((l) => !l.trim().startsWith("//")).join("\n"));
const esquemas = Object.fromEntries(fs.readdirSync(DIR_ENT).filter((f) => f.endsWith(".jsonc")).map((f) => {
  const e = lerJSONC(path.join(DIR_ENT, f));
  return [e.name, e];
}));
const AUTOMATICOS = new Set(["id", "created_date", "updated_date", "created_by", "created_by_id"]);

function tipoDe(v) { return Array.isArray(v) ? "array" : v === null ? "null" : typeof v; }
function validarValor(v, def, onde, erros) {
  const t = tipoDe(v);
  if (def.type && def.type !== t) return erros.push(`${onde}: esperado ${def.type}, veio ${t}`);
  if (def.enum && !def.enum.includes(v)) erros.push(`${onde}: "${v}" fora de ${JSON.stringify(def.enum)}`);
  if (t === "string") {
    if (def.pattern && !new RegExp(def.pattern).test(v)) erros.push(`${onde}: "${v}" não segue ${def.pattern}`);
    if (def.maxLength && v.length > def.maxLength) erros.push(`${onde}: maior que ${def.maxLength}`);
    if (def.format === "email" && v && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) erros.push(`${onde}: e-mail inválido`);
    if (def.format === "date-time" && v && Number.isNaN(Date.parse(v))) erros.push(`${onde}: data inválida`);
  }
  if (t === "array" && def.items) v.forEach((x, i) => validarValor(x, def.items, `${onde}[${i}]`, erros));
  if (t === "object" && def.properties) {
    for (const [k, x] of Object.entries(v)) {
      if (!def.properties[k]) erros.push(`${onde}.${k}: campo fora do esquema`);
      else validarValor(x, def.properties[k], `${onde}.${k}`, erros);
    }
  }
}
function validarRegistro(ent, reg) {
  const e = esquemas[ent], erros = [];
  for (const r of e.required || []) if (reg[r] === undefined) erros.push(`${ent}.${r}: obrigatório`);
  for (const [k, v] of Object.entries(reg)) {
    if (AUTOMATICOS.has(k)) continue;
    if (!e.properties[k]) erros.push(`${ent}.${k}: campo fora do esquema`);
    else validarValor(v, e.properties[k], `${ent}.${k}`, erros);
  }
  return erros;
}

test("Base44: as entidades do projeto são exatamente as do servidor, todas restritas ao administrador", () => {
  const { ENTIDADES } = require("../servicos/api-gateway/store.js");
  assert.deepEqual(Object.keys(esquemas).sort(), [...ENTIDADES].sort());
  for (const e of Object.values(esquemas)) {
    assert.equal(e.type, "object");
    for (const op of ["create", "read", "update", "delete"]) assert.deepEqual(e.rls[op], { user_condition: { role: "admin" } }, `${e.name}.rls.${op}`);
    for (const r of e.required) assert.ok(e.properties[r], `${e.name}: obrigatório ${r} sem definição`);
  }
  const cfg = lerJSONC(path.join(RAIZ, "base44", "config.jsonc"));
  assert.equal(cfg.visibility, "private");
});

test("Base44: tudo o que o sistema grava cabe nos esquemas", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sgja-b44-"));
  process.env.DADOS_DIR = dir;
  process.env.WHATSAPP_PROVEDOR = "simulado";
  delete process.env.BASE44_APP_ID;
  for (const k of Object.keys(require.cache)) if (k.includes("api-gateway")) delete require.cache[k];
  const ctx = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(RAIZ, "js", "config.js"), "utf8"), ctx);
  const CFG = ctx.window.SGJA_CONFIG;
  const C = require("../js/core.js");
  const { criarServico } = require("../js/servico.js");
  const { ArquivoStore } = require("../servicos/api-gateway/store.js");
  const store = new ArquivoStore(dir);
  const S = criarServico({ store, config: CFG, core: C, segredo: "segredo-de-teste-com-tamanho-ok" });

  await S.popularDemo(); // submissões, avaliação, sessões, check-in e comissão
  const alunos = await store.list("Aluno");
  let emitidos = 0;
  for (const a of alunos) {
    try {
      const cert = await S.emitirCertificado(a.id);
      await S.registrarEnvio(a, cert, CFG.email.assunto, "Segue seu certificado.", "certificado.pdf", "simulado", "simulado");
      emitidos++;
    } catch (e) { if (e.status !== 403) throw e; }
  }
  assert.ok(emitidos > 0);
  const log = console.log; console.log = () => {};
  try { await require("../servicos/api-gateway/lembretes.js").executar(new Date("2026-12-09T08:31:00-03:00")); } finally { console.log = log; }

  const erros = [];
  for (const ent of Object.keys(esquemas)) {
    const regs = await store.list(ent);
    assert.ok(regs.length > 0, `nenhum registro de ${ent} para conferir`);
    for (const r of regs) erros.push(...validarRegistro(ent, r));
  }
  assert.deepEqual(erros, []);
});

test("Base44Store: segue o cursor, usa a chave só no cabeçalho, trata null e fuso das datas", async () => {
  const { Base44Store } = require("../servicos/api-gateway/store.js");
  const chamadas = [];
  const original = global.fetch;
  global.fetch = async (url, opt) => {
    chamadas.push({ url, opt });
    const segunda = new URL(url).searchParams.get("cursor") === "c2";
    const n = segunda ? 3 : 5000;
    const items = Array.from({ length: n }, (_, i) => ({ id: `A${i}`, nome: "Ana Sousa", telefone: null, created_date: "2026-11-14T11:10:08.389000" }));
    return { ok: true, status: 200, json: async () => ({ items, next_cursor: segunda ? null : "c2", has_more: !segunda }) };
  };
  try {
    const st = new Base44Store("app123", "chave-secreta", { cacheSegundos: 0 });
    const todos = await st.list("Aluno");
    assert.equal(todos.length, 5003);
    assert.equal(chamadas.length, 2);
    assert.match(chamadas[0].url, /\/api\/apps\/app123\/entities\/Aluno\/v2\/list\?limit=5000$/);
    assert.match(chamadas[1].url, /\/Aluno\/v2\/list\?cursor=c2$/);
    assert.equal(chamadas[0].opt.headers.Authorization, "Bearer chave-secreta");
    assert.ok(!chamadas.some((c) => c.url.includes("chave-secreta")));
    assert.equal("telefone" in todos[0], false);
    assert.equal(todos[0].created_date, "2026-11-14T11:10:08.389000Z");
    await assert.rejects(() => st.list("User"), /Entidade inválida/);
  } finally { global.fetch = original; }
});

test("Base44Store: cópia em memória evita o limite de leituras e espera quando o Base44 pede (429)", async () => {
  const { Base44Store } = require("../servicos/api-gateway/store.js");
  const original = global.fetch;
  const banco = [{ id: "A1", nome: "Ana Sousa" }];
  let listagens = 0, gravacoes = 0, falhou = false;
  global.fetch = async (url, opt) => {
    const u = new URL(url);
    if (opt.method === "GET") { listagens++; return { ok: true, status: 200, json: async () => ({ items: banco.map((x) => ({ ...x })), has_more: false }) }; }
    gravacoes++;
    if (!falhou) { falhou = true; return { ok: false, status: 429, headers: { get: () => "0" }, json: async () => ({}) }; }
    if (opt.method === "POST") { const novo = { ...JSON.parse(opt.body), id: "A2" }; banco.push(novo); return { ok: true, status: 200, json: async () => novo }; }
    if (opt.method === "PUT") { const id = u.pathname.split("/").pop(); const r = banco.find((x) => x.id === id); Object.assign(r, JSON.parse(opt.body)); return { ok: true, status: 200, json: async () => ({ ...r }) }; }
    return { ok: true, status: 200, json: async () => ({ success: true }) };
  };
  try {
    const st = new Base44Store("app123", "k", { esperaMaxMs: 5 });
    for (let i = 0; i < 50; i++) await st.list("Aluno");
    assert.equal(listagens, 1); // 50 leituras, 1 chamada ao Base44
    await st.create("Aluno", { nome: "Bruno Lima" }); // 1ª tentativa recebe 429, a 2ª grava
    assert.equal(gravacoes, 2);
    await st.update("Aluno", "A1", { nome: "Ana Maria Sousa" });
    await st.remove("Aluno", "A2");
    const lista = await st.list("Aluno");
    assert.equal(listagens, 1);
    assert.deepEqual(lista.map((x) => x.nome), ["Ana Maria Sousa"]);
    lista[0].nome = "alterado fora"; // cópia: quem lê não altera o cache
    assert.equal((await st.list("Aluno"))[0].nome, "Ana Maria Sousa");
  } finally { global.fetch = original; }
});

test("Resumo: 1.500 caracteres sem contar os espaços é aceito; 1.501 é recusado", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sgja-resumo-"));
  const ctx = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(RAIZ, "js", "config.js"), "utf8"), ctx);
  const C = require("../js/core.js");
  const { criarServico } = require("../js/servico.js");
  const { ArquivoStore } = require("../servicos/api-gateway/store.js");
  const S = criarServico({ store: new ArquivoStore(dir), config: ctx.window.SGJA_CONFIG, core: C, segredo: "segredo-de-teste-com-tamanho-ok" });
  const palavras = Array(300).fill("abcde").join(" "); // 1.500 letras + 299 espaços
  const dados = (titulo, resumo) => ({
    titulo, vinculo: "APIEXT2", curso: "Direito", resumo, orientadores: ["Profª. Drª. Helena Martins Costa"],
    representante: { nome: "Ana Beatriz Sousa", cpf: "52998224725", email: "ana.resumo@exemplo.com", telefone: "86999990001", matricula: "20260001" },
    participantes: [], consentimentoLGPD: true
  });
  const arq = { nome: "t.pdf", tipo: "application/pdf", tamanho: 10, ref: "x" };
  const ok = await S.submeterTrabalho(dados("Resumo no limite", palavras), arq);
  assert.match(ok.trabalho.protocolo, /^TR-/);
  await assert.rejects(() => S.submeterTrabalho(dados("Resumo acima", palavras + " a"), arq), /sem contar os espaços/);
});
