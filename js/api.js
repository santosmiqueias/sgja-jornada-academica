/*
 * Camada de dados (API). As telas só falam com window.SGJA_API.
 * Por baixo existem dois "drivers" com a mesma interface:
 *   - LocalStore  : salva no navegador (demonstração, funciona offline)
 *   - Base44Store : REST das entidades do Base44
 * As regras (bloquear CPF/e-mail duplicado, check-in único etc.) ficam aqui,
 * valendo para os dois drivers.
 */
(function () {
  "use strict";
  const C = window.SGJACore;
  const CFG = window.SGJA_CONFIG;

  const ENTIDADES = { aluno: "Aluno", frequencia: "Frequencia", certificado: "Certificado", email: "EmailEnviado" };

  class ErroNegocio extends Error {
    constructor(mensagem, campo) { super(mensagem); this.name = "ErroNegocio"; this.campo = campo; }
  }

  /* ---------------- Driver: navegador ---------------- */
  class LocalStore {
    constructor(prefixo) {
      this.prefixo = prefixo;
      this.memoria = {};
    }
    _ler(ent) {
      try {
        const raw = localStorage.getItem(this.prefixo + ent);
        return raw ? JSON.parse(raw) : [];
      } catch (_) { return this.memoria[ent] || []; }
    }
    _gravar(ent, lista) {
      this.memoria[ent] = lista;
      try { localStorage.setItem(this.prefixo + ent, JSON.stringify(lista)); } catch (_) { /* modo privado */ }
    }
    async list(ent) { return this._ler(ent); }
    async create(ent, obj) {
      const lista = this._ler(ent);
      const novo = { id: C.gerarId(ent.slice(0, 2)), created_date: new Date().toISOString(), ...obj };
      lista.push(novo);
      this._gravar(ent, lista);
      return novo;
    }
    async update(ent, id, patch) {
      const lista = this._ler(ent);
      const i = lista.findIndex((x) => x.id === id);
      if (i < 0) throw new ErroNegocio("Registro não encontrado.");
      lista[i] = { ...lista[i], ...patch, updated_date: new Date().toISOString() };
      this._gravar(ent, lista);
      return lista[i];
    }
    async remove(ent, id) {
      this._gravar(ent, this._ler(ent).filter((x) => x.id !== id));
    }
    async limparTudo() {
      Object.values(ENTIDADES).forEach((e) => this._gravar(e, []));
    }
  }

  /* ---------------- Driver: Base44 ---------------- */
  class Base44Store {
    constructor({ appId, apiKey, baseUrl }) {
      if (!appId || !apiKey) throw new Error("Configure base44.appId e base44.apiKey em js/config.js");
      this.url = `${baseUrl.replace(/\/$/, "")}/${appId}/entities`;
      this.headers = { "api_key": apiKey, "Content-Type": "application/json" };
    }
    async _req(metodo, caminho, corpo) {
      const resp = await fetch(`${this.url}/${caminho}`, {
        method: metodo, headers: this.headers, body: corpo ? JSON.stringify(corpo) : undefined
      });
      if (!resp.ok) throw new Error(`Base44 respondeu ${resp.status} em ${metodo} ${caminho}`);
      return resp.status === 204 ? null : resp.json();
    }
    list(ent) { return this._req("GET", ent); }
    create(ent, obj) { return this._req("POST", ent, obj); }
    update(ent, id, patch) { return this._req("PUT", `${ent}/${encodeURIComponent(id)}`, patch); }
    remove(ent, id) { return this._req("DELETE", `${ent}/${encodeURIComponent(id)}`); }
    async limparTudo() { throw new Error("Limpeza em massa desativada no Base44 por segurança."); }
  }

  const store = CFG.backend === "base44" ? new Base44Store(CFG.base44) : new LocalStore("sgja_v1_");

  // Trava contra clique duplo / requisições simultâneas da mesma operação.
  const emAndamento = new Set();
  async function comTrava(chave, fn) {
    if (emAndamento.has(chave)) throw new ErroNegocio("Aguarde, essa operação já está sendo processada.");
    emAndamento.add(chave);
    try { return await fn(); } finally { emAndamento.delete(chave); }
  }

  /* ---------------- Operações (a API usada pelas telas) ---------------- */
  const API = {
    ErroNegocio,
    backend: CFG.backend,

    eventos() { return CFG.eventos.slice(); },
    atividadesMinimas() { return C.atividadesMinimas(CFG.eventos.length, CFG.evento.percentualMinimoAtividades); },
    cargaTotal() { return CFG.eventos.reduce((s, e) => s + e.cargaHoraria, 0); },

    async listarAlunos() {
      const lista = await store.list(ENTIDADES.aluno);
      return lista.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
    },

    async buscarAluno(id) {
      return (await store.list(ENTIDADES.aluno)).find((a) => a.id === id) || null;
    },

    async buscarAlunoPorCPF(cpf) {
      const d = C.soDigitos(cpf);
      return (await store.list(ENTIDADES.aluno)).find((a) => a.cpf === d) || null;
    },

    // POST /alunos — valida tudo de novo (nunca confiar só no front) e bloqueia duplicados.
    async criarAluno(dados) {
      return comTrava("criarAluno", async () => {
        const aluno = {
          nome: C.capitalizarNome(dados.nome),
          email: C.normalizarEmail(dados.email),
          telefone: C.soDigitos(dados.telefone),
          cpf: C.soDigitos(dados.cpf),
          matricula: C.soDigitos(dados.matricula),
          curso: String(dados.curso || "").trim(),
          periodo: String(dados.periodo || "").trim(),
          consentimentoLGPD: dados.consentimentoLGPD === true,
          aceitaWhatsApp: dados.aceitaWhatsApp === true,
          // mantém a ordem da programação
          atividades: CFG.eventos.map((e) => e.id).filter((id) => Array.isArray(dados.atividades) && dados.atividades.includes(id))
        };
        if (!C.validarNome(aluno.nome)) throw new ErroNegocio("Informe nome e sobrenome válidos.", "nome");
        if (!C.validarEmail(aluno.email)) throw new ErroNegocio("E-mail inválido.", "email");
        if (!C.validarTelefone(aluno.telefone)) throw new ErroNegocio("Telefone inválido.", "telefone");
        if (!C.validarCPF(aluno.cpf)) throw new ErroNegocio("CPF inválido.", "cpf");
        if (!C.validarMatricula(aluno.matricula)) throw new ErroNegocio("Matrícula deve ter de 6 a 12 dígitos.", "matricula");
        if (!CFG.cursos.includes(aluno.curso)) throw new ErroNegocio("Selecione um curso da lista.", "curso");
        if (!C.validarAtividades(aluno.atividades, CFG.eventos)) throw new ErroNegocio("Escolha pelo menos uma atividade.", "atividades");
        if (!aluno.consentimentoLGPD) throw new ErroNegocio("É preciso aceitar o termo de uso de dados.", "lgpd");

        const todos = await store.list(ENTIDADES.aluno);
        if (todos.some((a) => a.cpf === aluno.cpf)) throw new ErroNegocio("Este CPF já está inscrito na Jornada.", "cpf");
        if (todos.some((a) => a.email === aluno.email)) throw new ErroNegocio("Este e-mail já está inscrito na Jornada.", "email");
        if (todos.some((a) => a.matricula === aluno.matricula)) throw new ErroNegocio("Esta matrícula já está inscrita.", "matricula");

        const criado = await store.create(ENTIDADES.aluno, aluno);
        const token = await C.gerarTokenIngresso(criado.id, criado.cpf, CFG.segredoAssinatura);
        return store.update(ENTIDADES.aluno, criado.id, { tokenIngresso: token });
      });
    },

    async listarFrequencias() { return store.list(ENTIDADES.frequencia); },

    // POST /frequencias — idempotente: o mesmo aluno não ganha duas presenças na mesma atividade.
    async registrarCheckin(alunoId, eventoId, origem) {
      return comTrava(`checkin:${alunoId}:${eventoId}`, async () => {
        if (!CFG.eventos.some((e) => e.id === eventoId)) throw new ErroNegocio("Atividade inexistente.");
        const aluno = await API.buscarAluno(alunoId);
        if (!aluno) throw new ErroNegocio("Participante não encontrado.");
        const existentes = await store.list(ENTIDADES.frequencia);
        const ja = existentes.find((f) => f.alunoId === alunoId && f.eventoId === eventoId);
        if (ja) return { novo: false, frequencia: ja, aluno };
        const frequencia = await store.create(ENTIDADES.frequencia, {
          alunoId, eventoId, checkIn: true, timestamp: new Date().toISOString(), origem: origem || "painel"
        });
        return { novo: true, frequencia, aluno };
      });
    },

    // Valida o QR Code do ingresso (assinatura confere com o CPF cadastrado).
    async validarIngresso(texto) {
      const t = C.lerTokenIngresso(texto);
      if (!t) throw new ErroNegocio("QR Code não pertence à Jornada.");
      const aluno = await API.buscarAluno(t.alunoId);
      if (!aluno) throw new ErroNegocio("Ingresso de participante não cadastrado.");
      const esperado = await C.gerarTokenIngresso(aluno.id, aluno.cpf, CFG.segredoAssinatura);
      if (esperado !== String(texto).trim()) throw new ErroNegocio("QR Code adulterado ou inválido.");
      return aluno;
    },

    async removerCheckin(alunoId, eventoId) {
      const f = (await store.list(ENTIDADES.frequencia)).find((x) => x.alunoId === alunoId && x.eventoId === eventoId);
      if (f) await store.remove(ENTIDADES.frequencia, f.id);
    },

    // Situação de um aluno (horas, mínimo, aprovado).
    async situacao(alunoId, frequencias) {
      const freqs = frequencias || (await store.list(ENTIDADES.frequencia));
      const { horas, atividades } = C.calcularHoras(freqs, CFG.eventos, alunoId);
      return { ...C.situacaoAluno(atividades.length, CFG.eventos.length, CFG.evento.percentualMinimoAtividades, horas), atividades };
    },

    async listarCertificados() { return store.list(ENTIDADES.certificado); },

    async salvarCertificado(aluno, horas) {
      const codigo = await C.gerarCodigoCertificado(aluno.id, aluno.cpf, horas, CFG.segredoAssinatura);
      const lista = await store.list(ENTIDADES.certificado);
      const existente = lista.find((c) => c.alunoId === aluno.id);
      const dados = { alunoId: aluno.id, nome: aluno.nome, curso: aluno.curso, horas, codigo, emitidoEm: new Date().toISOString() };
      if (existente) return store.update(ENTIDADES.certificado, existente.id, { ...dados, emitidoEm: existente.emitidoEm });
      return store.create(ENTIDADES.certificado, { ...dados, enviadoPorEmail: false });
    },

    async marcarCertificadoEnviado(certId) {
      return store.update(ENTIDADES.certificado, certId, { enviadoPorEmail: true, enviadoEm: new Date().toISOString() });
    },

    async buscarCertificadoPorCodigo(codigo) {
      const c = String(codigo || "").trim().toUpperCase();
      return (await store.list(ENTIDADES.certificado)).find((x) => x.codigo === c) || null;
    },

    async registrarEmail(registro) { return store.create(ENTIDADES.email, registro); },
    async listarEmails() {
      return (await store.list(ENTIDADES.email)).sort((a, b) => b.created_date.localeCompare(a.created_date));
    },

    async limparTudo() { return store.limparTudo(); },

    // Dados fictícios para demonstração do pitch (CPFs válidos gerados pelo algoritmo).
    async popularDemo() {
      const nomes = [
        ["Ana Beatriz Sousa", "Análise e Desenvolvimento de Sistemas"], ["Carlos Eduardo Lima", "Ciência da Computação"],
        ["Fernanda Rocha Alves", "Direito"], ["João Pedro Carvalho", "Análise e Desenvolvimento de Sistemas"],
        ["Mariana Costa Ribeiro", "Enfermagem"], ["Rafael Nunes Barbosa", "Engenharia Civil"],
        ["Larissa Mendes Prado", "Psicologia"], ["Thiago Oliveira Santos", "Sistemas de Informação"],
        ["Juliana Freitas Moura", "Administração"], ["Lucas Almeida Teixeira", "Análise e Desenvolvimento de Sistemas"]
      ];
      const presencas = [6, 6, 5, 4, 6, 3, 5, 2, 6, 4]; // quantas atividades cada um assistiu
      const gerarCPF = (semente) => {
        const base = String(100000000 + semente * 7919).slice(0, 9).split("").map(Number);
        const dv = (arr) => { const s = arr.reduce((acc, n, i) => acc + n * (arr.length + 1 - i), 0); const r = (s * 10) % 11; return r === 10 ? 0 : r; };
        base.push(dv(base)); base.push(dv(base));
        return base.join("");
      };
      for (let i = 0; i < nomes.length; i++) {
        const [nome, curso] = nomes[i];
        const primeiro = nome.split(" ")[0].toLowerCase();
        try {
          const aluno = await API.criarAluno({
            nome, curso, email: `${primeiro}.demo${i}@exemplo.com`, telefone: `8699${String(1000000 + i * 1371).slice(0, 7)}`,
            cpf: gerarCPF(i + 11), matricula: String(20260000 + i * 37), periodo: `${(i % 8) + 1}º`, consentimentoLGPD: true, aceitaWhatsApp: i % 4 !== 3,
            atividades: CFG.eventos.slice(0, Math.min(CFG.eventos.length, presencas[i] + (i % 2))).map((e) => e.id)
          });
          for (let k = 0; k < presencas[i]; k++) await API.registrarCheckin(aluno.id, CFG.eventos[k].id, "demo");
        } catch (e) { if (!(e instanceof ErroNegocio)) throw e; }
      }
    }
  };

  window.SGJA_API = API;
})();
