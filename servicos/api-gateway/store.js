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

const LIMITE_PAGINA = 500;

class Base44Store {
  constructor(appId, apiKey) {
    this.url = `https://app.base44.com/api/apps/${encodeURIComponent(appId)}/entities`;
    this.headers = { api_key: apiKey, "Content-Type": "application/json" };
  }
  async _req(metodo, caminho, corpo) {
    const r = await fetch(`${this.url}/${caminho}`, { method: metodo, headers: this.headers, body: corpo ? JSON.stringify(corpo) : undefined });
    if (!r.ok) { const e = new Error(`Base44 respondeu ${r.status}`); e.status = 502; throw e; }
    return r.status === 204 ? null : r.json();
  }
  _ent(ent) { if (!ENTIDADES.includes(ent)) throw new Error("Entidade inválida"); return ent; }
  // A listagem do Base44 é paginada: busca em páginas até acabar (o evento tem poucos milhares de registros).
  async list(ent) {
    const todos = [];
    for (let skip = 0; ; skip += LIMITE_PAGINA) {
      const pagina = await this._req("GET", `${this._ent(ent)}?limit=${LIMITE_PAGINA}&skip=${skip}`);
      const itens = Array.isArray(pagina) ? pagina : (pagina && pagina.items) || [];
      todos.push(...itens);
      if (itens.length < LIMITE_PAGINA) return todos;
    }
  }
  create(ent, obj) { return this._req("POST", this._ent(ent), obj); }
  update(ent, id, patch) { return this._req("PUT", `${this._ent(ent)}/${encodeURIComponent(id)}`, patch); }
  remove(ent, id) { return this._req("DELETE", `${this._ent(ent)}/${encodeURIComponent(id)}`); }
  async limparTudo() { const e = new Error("Limpeza em massa desativada no Base44."); e.status = 403; throw e; }
}

function criarStore() {
  const { BASE44_APP_ID, BASE44_API_KEY } = process.env;
  if (BASE44_APP_ID && BASE44_API_KEY) return new Base44Store(BASE44_APP_ID, BASE44_API_KEY);
  return new ArquivoStore(process.env.DADOS_DIR || path.join(__dirname, "dados"));
}

module.exports = { criarStore, ArquivoStore, ENTIDADES };
