/*
 * Regras de negócio do S.G.J.A, usadas nos dois lados:
 *   - no navegador (modo "local", demonstração), sobre o localStorage;
 *   - no servidor (modo "servidor"), sobre arquivos ou Base44 — aqui elas são a barreira de segurança.
 *
 * criarServico({ store, config, core, segredo }) devolve as operações.
 * store: { list(ent), create(ent, obj), update(ent, id, patch), remove(ent, id), limparTudo() }
 *
 * Cada operação devolve só os campos que quem chamou pode ver (minimização de dados, LGPD).
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.SGJAServico = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const ENT = { aluno: "Aluno", frequencia: "Frequencia", certificado: "Certificado", email: "EmailEnviado", membro: "MembroComissao" };

  class ErroNegocio extends Error {
    constructor(mensagem, campo, status) { super(mensagem); this.name = "ErroNegocio"; this.campo = campo; this.status = status || 400; }
  }

  function criarServico({ store, config, core, segredo }) {
    const C = core, CFG = config;
    if (!segredo || String(segredo).length < 16) throw new Error("Segredo de assinatura ausente ou curto demais (mínimo 16 caracteres).");

    // Trava contra clique duplo / requisições simultâneas da mesma operação.
    const emAndamento = new Set();
    async function comTrava(chave, fn) {
      if (emAndamento.has(chave)) throw new ErroNegocio("Aguarde, essa operação já está sendo processada.", null, 409);
      emAndamento.add(chave);
      try { return await fn(); } finally { emAndamento.delete(chave); }
    }

    const texto = (v, max) => String(v == null ? "" : v).trim().slice(0, max);

    /* ---------- Projeções: o que cada perfil pode ver ---------- */
    const alunoDono = (a) => a && ({
      id: a.id, nome: a.nome, email: a.email, cpf: a.cpf, curso: a.curso, matricula: a.matricula, periodo: a.periodo,
      atividades: a.atividades || [], tokenIngresso: a.tokenIngresso, aceitaWhatsApp: !!a.aceitaWhatsApp
    });
    const alunoChamada = (a) => a && ({
      id: a.id, nome: a.nome, cpfMascarado: C.mascararCPFParaExibicao(a.cpf), matricula: a.matricula, curso: a.curso, atividades: a.atividades || []
    });
    const membroPublico = (m) => {
      if (!m) return null;
      const { senhaHash, salt, ...resto } = m;
      return resto;
    };
    const certPublico = (c) => c && ({
      codigo: c.codigo, nome: c.nome, curso: c.curso, horas: c.horas, atividades: c.atividades || [], emitidoEm: c.emitidoEm
    });

    async function buscarAluno(id) { return (await store.list(ENT.aluno)).find((a) => a.id === id) || null; }
    async function buscarAlunoPorCPF(cpf) { const d = C.soDigitos(cpf); return (await store.list(ENT.aluno)).find((a) => a.cpf === d) || null; }

    async function situacaoDe(alunoId, freqs) {
      const { horas, atividades } = C.calcularHoras(freqs || (await store.list(ENT.frequencia)), CFG.eventos, alunoId);
      return { ...C.situacaoAluno(atividades.length, CFG.eventos.length, CFG.evento.percentualMinimoAtividades, horas), atividades };
    }

    // Compara sem vazar tempo (evita descobrir o e-mail letra a letra).
    function iguais(a, b) {
      a = String(a); b = String(b);
      let dif = a.length ^ b.length;
      for (let i = 0; i < Math.max(a.length, b.length); i++) dif |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
      return dif === 0;
    }

    // Participante se identifica com CPF + e-mail da inscrição (só o CPF não basta).
    async function identificarParticipante(cpf, email) {
      const a = await buscarAlunoPorCPF(cpf);
      if (!a || !iguais(a.email, C.normalizarEmail(email))) throw new ErroNegocio("CPF ou e-mail não conferem com nenhuma inscrição.", null, 404);
      return a;
    }

    async function membroAtivo(membroId) {
      const m = (await store.list(ENT.membro)).find((x) => x.id === membroId);
      if (!m || m.status !== "ativo") throw new ErroNegocio("Seu acesso ao check-in foi bloqueado ou removido. Fale com a coordenação.", null, 403);
      return m;
    }

    async function registrarCheckin(alunoId, eventoId, origem, membro) {
      return comTrava(`checkin:${alunoId}:${eventoId}`, async () => {
        if (!CFG.eventos.some((e) => e.id === eventoId)) throw new ErroNegocio("Atividade inexistente.");
        const aluno = await buscarAluno(alunoId);
        if (!aluno) throw new ErroNegocio("Participante não encontrado.", null, 404);
        const ja = (await store.list(ENT.frequencia)).find((f) => f.alunoId === alunoId && f.eventoId === eventoId);
        if (ja) return { novo: false, aluno: alunoChamada(aluno) };
        await store.create(ENT.frequencia, {
          alunoId, eventoId, checkIn: true, timestamp: new Date().toISOString(),
          origem: ["lista", "qrcode", "cpf", "lote", "demo"].includes(origem) ? origem : "lista",
          registradoPorId: membro ? membro.id : null, registradoPorNome: membro ? membro.nome : null
        });
        return { novo: true, aluno: alunoChamada(aluno) };
      });
    }

    const S = {
      ErroNegocio,

      /* ---------- Público ---------- */
      async contarInscritos() { return (await store.list(ENT.aluno)).length; },

      async cpfJaInscrito(cpf) { return !!(await buscarAlunoPorCPF(cpf)); },

      // Valida tudo de novo (nunca confiar só na tela) e bloqueia duplicados.
      async criarAluno(dados) {
        dados = dados || {};
        return comTrava("criarAluno", async () => {
          const aluno = {
            nome: C.capitalizarNome(texto(dados.nome, 100)),
            email: C.normalizarEmail(texto(dados.email, 120)),
            telefone: C.soDigitos(texto(dados.telefone, 20)),
            cpf: C.soDigitos(texto(dados.cpf, 20)),
            matricula: C.soDigitos(texto(dados.matricula, 20)),
            curso: texto(dados.curso, 80),
            periodo: texto(dados.periodo, 20),
            consentimentoLGPD: dados.consentimentoLGPD === true,
            aceitaWhatsApp: dados.aceitaWhatsApp === true,
            atividades: CFG.eventos.map((e) => e.id).filter((id) => Array.isArray(dados.atividades) && dados.atividades.includes(id))
          };
          if (!C.validarNome(aluno.nome)) throw new ErroNegocio("Informe nome e sobrenome válidos.", "nome");
          if (!C.validarEmail(aluno.email)) throw new ErroNegocio("E-mail inválido.", "email");
          if (!C.validarTelefone(aluno.telefone)) throw new ErroNegocio("Telefone inválido.", "telefone");
          if (!C.validarCPF(aluno.cpf)) throw new ErroNegocio("CPF inválido.", "cpf");
          if (!C.validarMatricula(aluno.matricula)) throw new ErroNegocio("Matrícula deve ter de 6 a 12 dígitos.", "matricula");
          if (!CFG.cursos.includes(aluno.curso)) throw new ErroNegocio("Selecione um curso da lista.", "curso");
          const periodos = ["", "1º", "2º", "3º", "4º", "5º", "6º", "7º", "8º", "9º", "10º", "Professor", "Convidado"];
          if (!periodos.includes(aluno.periodo)) aluno.periodo = "";
          if (!C.validarAtividades(aluno.atividades, CFG.eventos)) throw new ErroNegocio("Escolha pelo menos uma atividade.", "atividades");
          if (!aluno.consentimentoLGPD) throw new ErroNegocio("É preciso aceitar o termo de uso de dados.", "lgpd");

          const todos = await store.list(ENT.aluno);
          if (todos.some((a) => a.cpf === aluno.cpf)) throw new ErroNegocio("Este CPF já está inscrito na Jornada.", "cpf", 409);
          if (todos.some((a) => a.email === aluno.email)) throw new ErroNegocio("Este e-mail já está inscrito na Jornada.", "email", 409);
          if (todos.some((a) => a.matricula === aluno.matricula)) throw new ErroNegocio("Esta matrícula já está inscrita.", "matricula", 409);

          const criado = await store.create(ENT.aluno, aluno);
          const token = await C.gerarTokenIngresso(criado.id, criado.cpf, segredo);
          return alunoDono(await store.update(ENT.aluno, criado.id, { tokenIngresso: token }));
        });
      },

      async consultarParticipante(cpf, email) {
        const a = await identificarParticipante(cpf, email);
        return { aluno: alunoDono(a), situacao: await situacaoDe(a.id) };
      },

      async emitirCertificadoParticipante(cpf, email) {
        const a = await identificarParticipante(cpf, email);
        return S.emitirCertificado(a.id);
      },

      async buscarCertificadoPorCodigo(codigo) {
        const c = String(codigo || "").trim().toUpperCase();
        if (!/^[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}$/.test(c)) return null;
        return certPublico((await store.list(ENT.certificado)).find((x) => x.codigo === c));
      },

      /* ---------- Comissão organizadora ---------- */
      async cadastrarMembro(dados) {
        dados = dados || {};
        return comTrava("cadastrarMembro", async () => {
          const membro = {
            nome: C.capitalizarNome(texto(dados.nome, 100)),
            email: C.normalizarEmail(texto(dados.email, 120)),
            cpf: C.soDigitos(texto(dados.cpf, 20)),
            telefone: C.soDigitos(texto(dados.telefone, 20))
          };
          if (!C.validarNome(membro.nome)) throw new ErroNegocio("Informe nome e sobrenome válidos.", "m-nome");
          if (!C.validarEmail(membro.email)) throw new ErroNegocio("E-mail inválido.", "m-email");
          if (!C.validarCPF(membro.cpf)) throw new ErroNegocio("CPF inválido.", "m-cpf");
          if (!C.validarTelefone(membro.telefone)) throw new ErroNegocio("Telefone inválido.", "m-telefone");
          if (!C.validarSenha(dados.senha)) throw new ErroNegocio("A senha precisa de pelo menos 8 caracteres, com letras e números.", "m-senha");
          const todos = await store.list(ENT.membro);
          if (todos.some((m) => m.email === membro.email)) throw new ErroNegocio("Já existe cadastro com este e-mail.", "m-email", 409);
          if (todos.some((m) => m.cpf === membro.cpf)) throw new ErroNegocio("Já existe cadastro com este CPF.", "m-cpf", 409);
          const salt = C.gerarSalt();
          const senhaHash = await C.hashSenha(dados.senha, salt);
          return membroPublico(await store.create(ENT.membro, { ...membro, salt, senhaHash, status: "pendente" }));
        });
      },

      async autenticarMembro(email, senha) {
        const m = (await store.list(ENT.membro)).find((x) => x.email === C.normalizarEmail(email));
        // Mesmo cálculo com ou sem cadastro, para não revelar quais e-mails existem.
        const hash = await C.hashSenha(String(senha || "").slice(0, 72), m ? m.salt : "00000000000000000000000000000000");
        if (!m || !iguais(hash, m.senhaHash)) throw new ErroNegocio("E-mail ou senha incorretos.", null, 401);
        if (m.status === "pendente") throw new ErroNegocio("Seu cadastro ainda não foi liberado por um professor.", null, 403);
        if (m.status === "bloqueado") throw new ErroNegocio("Seu acesso ao check-in está bloqueado. Fale com a coordenação.", null, 403);
        return membroPublico(m);
      },

      async membroAtivo(membroId) { return membroPublico(await membroAtivo(membroId)); },

      // Lista da chamada: só o necessário (CPF mascarado, sem e-mail nem telefone).
      async chamada(membroId, eventoId) {
        await membroAtivo(membroId);
        if (!CFG.eventos.some((e) => e.id === eventoId)) throw new ErroNegocio("Atividade inexistente.");
        const alunos = (await store.list(ENT.aluno)).map(alunoChamada).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
        const frequencias = (await store.list(ENT.frequencia)).filter((f) => f.eventoId === eventoId)
          .map((f) => ({ alunoId: f.alunoId, eventoId: f.eventoId, timestamp: f.timestamp, registradoPorNome: f.registradoPorNome || (f.origem === "demo" ? "exemplo" : null) }));
        return { alunos, frequencias };
      },

      async registrarCheckin(membroId, alunoId, eventoId, origem) {
        const m = await membroAtivo(membroId);
        return registrarCheckin(String(alunoId), String(eventoId), origem, m);
      },

      async checkinPorCPF(membroId, cpf, eventoId) {
        const m = await membroAtivo(membroId);
        if (!C.validarCPF(cpf)) throw new ErroNegocio("CPF inválido.");
        const a = await buscarAlunoPorCPF(cpf);
        if (!a) throw new ErroNegocio("CPF não inscrito na Jornada.", null, 404);
        return registrarCheckin(a.id, String(eventoId), "cpf", m);
      },

      // O QR só vale se a assinatura (feita com o segredo do servidor) conferir com o CPF cadastrado.
      async checkinPorQR(membroId, conteudo, eventoId) {
        const m = await membroAtivo(membroId);
        const t = C.lerTokenIngresso(conteudo);
        if (!t) throw new ErroNegocio("QR Code não pertence à Jornada.");
        const a = await buscarAluno(t.alunoId);
        if (!a) throw new ErroNegocio("Ingresso de participante não cadastrado.", null, 404);
        const esperado = await C.gerarTokenIngresso(a.id, a.cpf, segredo);
        if (!iguais(esperado, String(conteudo).trim())) throw new ErroNegocio("QR Code adulterado ou inválido.");
        return registrarCheckin(a.id, String(eventoId), "qrcode", m);
      },

      async removerCheckin(membroId, alunoId, eventoId) {
        await membroAtivo(membroId);
        const f = (await store.list(ENT.frequencia)).find((x) => x.alunoId === alunoId && x.eventoId === eventoId);
        if (f) await store.remove(ENT.frequencia, f.id);
      },

      /* ---------- Professor ---------- */
      async dadosPainel() {
        const [alunos, frequencias, certificados, membros, emails] = await Promise.all([
          store.list(ENT.aluno), store.list(ENT.frequencia), store.list(ENT.certificado), store.list(ENT.membro), store.list(ENT.email)
        ]);
        return {
          alunos: alunos.slice().sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")),
          frequencias,
          certificados,
          membros: membros.map(membroPublico).sort((a, b) => (a.status === "pendente" ? -1 : 0) - (b.status === "pendente" ? -1 : 0) || a.nome.localeCompare(b.nome, "pt-BR")),
          emails: emails.slice().sort((a, b) => String(b.created_date).localeCompare(String(a.created_date)))
        };
      },

      async definirStatusMembro(id, status) {
        if (!["ativo", "bloqueado", "pendente"].includes(status)) throw new ErroNegocio("Situação inválida.");
        const patch = { status };
        if (status === "ativo") patch.liberadoEm = new Date().toISOString();
        return membroPublico(await store.update(ENT.membro, String(id), patch));
      },

      // Horas e atividades são calculadas aqui, a partir das presenças (nunca vêm de quem pede).
      async emitirCertificado(alunoId) {
        const a = await buscarAluno(alunoId);
        if (!a) throw new ErroNegocio("Participante não encontrado.", null, 404);
        const sit = await situacaoDe(a.id);
        if (!sit.aprovado) throw new ErroNegocio(`Certificado ainda não liberado: faltam ${sit.faltam} atividade(s).`, null, 403);
        const codigo = await C.gerarCodigoCertificado(a.id, a.cpf, sit.horas, segredo);
        const existente = (await store.list(ENT.certificado)).find((c) => c.alunoId === a.id);
        const dados = { alunoId: a.id, nome: a.nome, curso: a.curso, horas: sit.horas, atividades: sit.atividades, codigo };
        if (existente) return store.update(ENT.certificado, existente.id, dados);
        return store.create(ENT.certificado, { ...dados, emitidoEm: new Date().toISOString(), enviadoPorEmail: false });
      },

      async alunoParaEmail(alunoId) {
        const a = await buscarAluno(alunoId);
        if (!a) throw new ErroNegocio("Participante não encontrado.", null, 404);
        return a;
      },
      identificarParticipante,

      async registrarEnvio(aluno, cert, assunto, mensagem, anexo, status, modo) {
        await store.create(ENT.email, { para: aluno.email, nome: aluno.nome, assunto, mensagem, anexo, codigo: cert.codigo, modo, status });
        if (status !== "falhou") await store.update(ENT.certificado, cert.id, { enviadoPorEmail: true, enviadoEm: new Date().toISOString() });
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
        const presencas = [6, 6, 5, 4, 6, 3, 5, 2, 6, 4];
        const gerarCPF = (semente) => {
          const base = String(100000000 + semente * 7919).slice(0, 9).split("").map(Number);
          const dv = (arr) => { const s = arr.reduce((acc, n, i) => acc + n * (arr.length + 1 - i), 0); const r = (s * 10) % 11; return r === 10 ? 0 : r; };
          base.push(dv(base)); base.push(dv(base));
          return base.join("");
        };
        for (let i = 0; i < nomes.length; i++) {
          const [nome, curso] = nomes[i];
          try {
            const aluno = await S.criarAluno({
              nome, curso, email: `${nome.split(" ")[0].toLowerCase()}.demo${i}@exemplo.com`, telefone: `8699${String(1000000 + i * 1371).slice(0, 7)}`,
              cpf: gerarCPF(i + 11), matricula: String(20260000 + i * 37), periodo: `${(i % 8) + 1}º`, consentimentoLGPD: true, aceitaWhatsApp: i % 4 !== 3,
              atividades: CFG.eventos.slice(0, Math.min(CFG.eventos.length, presencas[i] + (i % 2))).map((e) => e.id)
            });
            for (let k = 0; k < presencas[i]; k++) await registrarCheckin(aluno.id, CFG.eventos[k].id, "demo", null);
          } catch (e) { if (!(e instanceof ErroNegocio)) throw e; }
        }
        const membros = [
          { nome: "Paula Martins Lima", email: "comissao@exemplo.com", cpf: "39053344705", telefone: "86999991111", senha: "jornada2026", status: "ativo" },
          { nome: "Bruno Rocha Alves", email: "bruno.comissao@exemplo.com", cpf: "15350946056", telefone: "86999992222", senha: "jornada2026", status: "pendente" }
        ];
        for (const m of membros) {
          try {
            const criado = await S.cadastrarMembro(m);
            if (m.status === "ativo") await S.definirStatusMembro(criado.id, "ativo");
          } catch (e) { if (!(e instanceof ErroNegocio)) throw e; }
        }
      }
    };
    return S;
  }

  return { criarServico, ErroNegocio, ENT };
});
