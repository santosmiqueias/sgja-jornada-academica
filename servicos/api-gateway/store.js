/*
 * Armazenamento do servidor. Mesma interface do navegador: list, create, update, remove, limparTudo.
 *   - Base44 (se BASE44_APP_ID e BASE44_API_KEY estiverem no .env): a chave fica só aqui, nunca vai ao site.
 *   - Arquivos JSON em dados/ (padrão): funciona sem nenhum serviço externo.
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

// As mesmas entidades de base44/entities/*.jsonc (o esquema enviado ao Base44 com "npm run base44:push").
const ENTIDADES = ["Aluno", "Frequencia", "Certificado", "EmailEnviado", "MembroComissao", "Trabalho", "LembreteWhatsApp"];

class ArquivoStore {
  constructor(dir) {
    this.dir = dir;
    this.cache = {};
    this.filas = {};
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  }
  _arq(ent) {
    if (!ENTIDADES.includes(ent)) throw new Error("Entidade inválida");
    return path.join(this.dir, `${ent}.json`);
  }
  _ler(ent) {
    if (!this.cache[ent]) {
      try { this.cache[ent] = JSON.parse(fs.readFileSync(this._arq(ent), "utf8")); } catch (_) { this.cache[ent] = []; }
    }
    return this.cache[ent];
  }
  _gravar(ent, lista) {
    this.cache[ent] = lista;
    const tmp = `${this._arq(ent)}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(lista), { mode: 0o600 });
    fs.renameSync(tmp, this._arq(ent)); // troca atômica
  }
  // Uma alteração por vez em cada entidade (evita perder gravações simultâneas).
  _emFila(ent, fn) {
    const anterior = this.filas[ent] || Promise.resolve();
    const prox = anterior.then(fn, fn);
    this.filas[ent] = prox.catch(() => {});
    return prox;
  }
  async list(ent) { return this._ler(ent).map((x) => ({ ...x })); }
  create(ent, obj) {
    return this._emFila(ent, () => {
      const novo = { ...obj, id: `${ent.slice(0, 2).toUpperCase()}${crypto.randomBytes(9).toString("hex").toUpperCase()}`, created_date: new Date().toISOString() };
      this._gravar(ent, [...this._ler(ent), novo]);
      return { ...novo };
    });
  }
  update(ent, id, patch) {
    return this._emFila(ent, () => {
      const lista = this._ler(ent).slice();
      const i = lista.findIndex((x) => x.id === id);
      if (i < 0) { const e = new Error("Registro não encontrado."); e.status = 404; throw e; }
      const { id: _i, created_date: _c, ...seguro } = patch; // id e data de criação não mudam
      lista[i] = { ...lista[i], ...seguro, updated_date: new Date().toISOString() };
      this._gravar(ent, lista);
      return { ...lista[i] };
    });
  }
  remove(ent, id) { return this._emFila(ent, () => this._gravar(ent, this._ler(ent).filter((x) => x.id !== id))); }
  async limparTudo() { for (const e of ENTIDADES) await this._emFila(e, () => this._gravar(e, [])); }
}

const LIMITE_PAGINA = 5000; // máximo por página no Base44

// O Base44 devolve null nos campos nunca preenchidos e as datas automáticas sem o "Z" (são UTC).
// Aqui os null viram "ausentes" e as datas ganham o "Z", para o código ver o mesmo formato do armazenamento em arquivos.
const SEM_FUSO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?$/;
function normalizar(reg) {
  if (!reg || typeof reg !== "object" || Array.isArray(reg)) return reg;
  const r = Object.fromEntries(Object.entries(reg).filter(([, v]) => v !== null));
  for (const k of ["created_date", "updated_date"]) if (typeof r[k] === "string" && SEM_FUSO.test(r[k])) r[k] += "Z";
  return r;
}

// API de entidades do Base44. A chave (token pessoal com acesso total, ou chave de API do workspace)
// vai no cabeçalho Authorization: Bearer, aceito pelos dois tipos. Ela fica só neste servidor.
//
// Limites do Base44 (plano base): 70 listagens, 80 criações e 70 alterações por minuto. As regras de
// js/servico.js releem as tabelas a cada operação, então este store guarda uma cópia em memória:
//   - o servidor é o único que grava (rode uma única instância), então a cópia é atualizada a cada gravação;
//   - a cópia é relida do Base44 a cada BASE44_CACHE_SEGUNDOS (padrão 60), para pegar edições feitas no painel do Base44;
//   - resposta 429/503 do Base44: espera o Retry-After e tenta de novo (até 5 vezes).
const esperar = (ms) => new Promise((ok) => setTimeout(ok, ms));
class Base44Store {
  constructor(appId, apiKey, opcoes = {}) {
    this.url = `https://app.base44.com/api/apps/${encodeURIComponent(appId)}/entities`;
    this.headers = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };
    this.ttl = (opcoes.cacheSegundos ?? Number(process.env.BASE44_CACHE_SEGUNDOS || 60)) * 1000;
    this.tentativas = opcoes.tentativas ?? 5;
    this.esperaMaxMs = opcoes.esperaMaxMs ?? 30000;
    this.cache = {}; // ent -> { lista, em }
    this.carregando = {}; // ent -> Promise (uma leitura por vez)
  }
  async _req(metodo, caminho, corpo) {
    for (let n = 1; ; n++) {
      const r = await fetch(`${this.url}/${caminho}`, { method: metodo, headers: this.headers, body: corpo ? JSON.stringify(corpo) : undefined });
      if ((r.status === 429 || r.status === 503) && n < this.tentativas) {
        const ra = Number(r.headers && r.headers.get && r.headers.get("retry-after"));
        await esperar(Math.min(this.esperaMaxMs, ra > 0 ? ra * 1000 : 1000 * 2 ** (n - 1)));
        continue;
      }
      if (!r.ok) { const e = new Error(`Base44 respondeu ${r.status}`); e.status = 502; throw e; }
      return r.status === 204 ? null : r.json();
    }
  }
  _ent(ent) { if (!ENTIDADES.includes(ent)) throw new Error("Entidade inválida"); return ent; }
  // Listagem paginada por cursor (endpoint v2/list): segue next_cursor até has_more ser false.
  async _buscarTudo(ent) {
    const todos = [];
    let pagina = await this._req("GET", `${ent}/v2/list?limit=${LIMITE_PAGINA}`);
    for (;;) {
      todos.push(...((pagina && pagina.items) || []).map(normalizar));
      if (!pagina || !pagina.has_more || !pagina.next_cursor) return todos;
      pagina = await this._req("GET", `${ent}/v2/list?cursor=${encodeURIComponent(pagina.next_cursor)}`);
    }
  }
  async _lista(ent) {
    this._ent(ent);
    const c = this.cache[ent];
    if (c && Date.now() - c.em < this.ttl) return c.lista;
    if (!this.carregando[ent]) {
      this.carregando[ent] = this._buscarTudo(ent)
        .then((lista) => { this.cache[ent] = { lista, em: Date.now() }; return lista; })
        .finally(() => { delete this.carregando[ent]; });
    }
    return this.carregando[ent];
  }
  async list(ent) { return (await this._lista(ent)).map((x) => ({ ...x })); }
  async create(ent, obj) {
    const novo = normalizar(await this._req("POST", this._ent(ent), obj));
    const c = this.cache[ent];
    if (c) c.lista = [...c.lista, novo];
    return { ...novo };
  }
  async update(ent, id, patch) {
    const novo = normalizar(await this._req("PUT", `${this._ent(ent)}/${encodeURIComponent(id)}`, patch));
    const c = this.cache[ent];
    if (c) c.lista = c.lista.map((x) => (x.id === novo.id ? novo : x));
    return { ...novo };
  }
  async remove(ent, id) {
    await this._req("DELETE", `${this._ent(ent)}/${encodeURIComponent(id)}`);
    const c = this.cache[ent];
    if (c) c.lista = c.lista.filter((x) => x.id !== id);
  }
  async limparTudo() { const e = new Error("Limpeza em massa desativada no Base44."); e.status = 403; throw e; }
}

// Um store por configuração, compartilhado no processo: o servidor e o agendador de lembretes
// usam a mesma cópia em memória (e, no Base44, o mesmo controle de limite).
const criados = {};
function criarStore() {
  const { BASE44_APP_ID, BASE44_API_KEY } = process.env;
  const dir = process.env.DADOS_DIR || path.join(__dirname, "dados");
  const chave = BASE44_APP_ID && BASE44_API_KEY ? `b44:${BASE44_APP_ID}` : `arq:${dir}`;
  if (!criados[chave]) criados[chave] = BASE44_APP_ID && BASE44_API_KEY ? new Base44Store(BASE44_APP_ID, BASE44_API_KEY) : new ArquivoStore(dir);
  return criados[chave];
}

module.exports = { criarStore, ArquivoStore, Base44Store, ENTIDADES };
