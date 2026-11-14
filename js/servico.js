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

  const ENT = { aluno: "Aluno", frequencia: "Frequencia", certificado: "Certificado", email: "EmailEnviado", membro: "MembroComissao", trabalho: "Trabalho" };

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
      codigo: c.codigo, nome: c.nome, curso: c.curso, horas: c.horas, atividades: c.atividades || [], trabalhos: c.trabalhos || [], emitidoEm: c.emitidoEm
    });

    const SUB = CFG.submissao;
    const nomeModalidade = (m) => (SUB.modalidades && SUB.modalidades[m]) || m;
    const trabalhoParticipante = (t) => t && ({
      protocolo: t.protocolo, titulo: t.titulo, modalidade: t.modalidade, modalidadeNome: nomeModalidade(t.modalidade),
      vinculo: t.vinculoNome, status: t.status, parecer: t.status !== "em_analise" ? (t.parecer || "") : "",
      sessao: t.sessao || null, horarioApresentacao: t.horarioApresentacao || "", apresentado: !!t.apresentado
    });
    const normalizarTitulo = (v) => String(v || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    async function trabalhosDe(pessoaId) {
      return (await store.list(ENT.trabalho)).filter((t) => (t.autoresIds || []).includes(pessoaId));
    }

    async function buscarAluno(id) { return (await store.list(ENT.aluno)).find((a) => a.id === id) || null; }
    async function buscarAlunoPorCPF(cpf) { const d = C.soDigitos(cpf); return (await store.list(ENT.aluno)).find((a) => a.cpf === d) || null; }

    async function situacaoDe(alunoId, freqs) {
      return C.avaliarCertificado(freqs || (await store.list(ENT.frequencia)), CFG.eventos, alunoId, CFG.evento.diasMinimosCertificado, CFG.evento.cargaHorariaTotal);
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

      /*
       * Submissão de trabalho (edital, itens 1 e 2): um representante envia o trabalho com os dados
       * de todos os participantes. arquivo = { nome, tipo, tamanho, ref } já gravado por quem chamou.
       */
      async submeterTrabalho(dados, arquivo) {
        dados = dados || {};
        return comTrava("submeterTrabalho", async () => {
          if (SUB.bloquearForaDoPeriodo) {
            const hoje = new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10); // horário de Teresina
            if (hoje < SUB.inicio || hoje > SUB.fim) throw new ErroNegocio("Fora do período de submissão de trabalhos (16 a 30/11/2026).", null, 403);
          }
          const titulo = texto(dados.titulo, 200).replace(/\s+/g, " ");
          const vinculo = SUB.vinculos.find((v) => v.id === dados.vinculo);
          const curso = texto(dados.curso, 80);
          // Orientadores: pelo menos 1 (obrigatório). Aceita títulos como "Prof.", "Profª", "Dr.", "Drª".
          const semTitulo = (n) => n.replace(/^(prof(ª|a|essora|essor)?\.?\s+)?(dr(ª|a)?\.?\s+|me\.?\s+|ma\.?\s+|esp\.?\s+)?/i, "");
          const listaOri = Array.isArray(dados.orientadores) ? dados.orientadores : (dados.orientador ? [dados.orientador] : []);
          const orientadores = listaOri.map((n) => C.normalizarNome(texto(n, 100))).filter(Boolean);
          const resumo = String(dados.resumo == null ? "" : dados.resumo).replace(/\r\n/g, "\n").trim();
          if (titulo.length < 5) throw new ErroNegocio("Informe o título do trabalho.", "titulo");
          if (!vinculo) throw new ErroNegocio("Selecione o vínculo do trabalho.", "vinculo");
          const modalidade = vinculo.modalidade || dados.modalidade;
          if (!SUB.modalidades[modalidade]) throw new ErroNegocio("Escolha o formato de apresentação.", "modalidade");
          if (!CFG.cursos.includes(curso)) throw new ErroNegocio("Selecione o curso.", "curso");
          const maxOri = SUB.maxOrientadores || 5;
          if (!orientadores.length) throw new ErroNegocio("Informe o professor orientador.", "orientadores");
          if (orientadores.length > maxOri) throw new ErroNegocio(`No máximo ${maxOri} orientadores.`, "orientadores");
          if (orientadores.some((n) => !C.validarNome(semTitulo(n)))) throw new ErroNegocio("Informe nome e sobrenome de cada orientador.", "orientadores");
          if (new Set(orientadores.map((n) => n.toLowerCase())).size !== orientadores.length) throw new ErroNegocio("O mesmo orientador foi informado mais de uma vez.", "orientadores");
          if (resumo.length < SUB.minCaracteresResumo) throw new ErroNegocio(`O resumo precisa de pelo menos ${SUB.minCaracteresResumo} caracteres.`, "resumo");
          if (resumo.length > SUB.maxCaracteresResumo) throw new ErroNegocio(`O resumo pode ter no máximo ${SUB.maxCaracteresResumo} caracteres.`, "resumo");
          if (!arquivo || !arquivo.ref) throw new ErroNegocio("Anexe o arquivo do trabalho.", "arquivo");
          const ext = String(arquivo.nome || "").split(".").pop().toLowerCase();
          if (!SUB.arquivo.extensoes.includes(ext)) throw new ErroNegocio("Envie o arquivo em PDF, DOC ou DOCX.", "arquivo");
          if (!(arquivo.tamanho > 0) || arquivo.tamanho > SUB.arquivo.maxMB * 1048576) throw new ErroNegocio(`O arquivo pode ter no máximo ${SUB.arquivo.maxMB} MB.`, "arquivo");
          if (dados.consentimentoLGPD !== true) throw new ErroNegocio("É preciso aceitar o termo de uso de dados.", "lgpd");

          // Representante + demais participantes
          const r = dados.representante || {};
          const rep = {
            nome: C.capitalizarNome(texto(r.nome, 100)), email: C.normalizarEmail(texto(r.email, 120)), telefone: C.soDigitos(texto(r.telefone, 20)),
            cpf: C.soDigitos(texto(r.cpf, 20)), matricula: C.soDigitos(texto(r.matricula, 20))
          };
          if (!C.validarNome(rep.nome)) throw new ErroNegocio("Informe nome e sobrenome do representante.", "r-nome");
          if (!C.validarEmail(rep.email)) throw new ErroNegocio("E-mail do representante inválido.", "r-email");
          if (!C.validarTelefone(rep.telefone)) throw new ErroNegocio("Telefone do representante inválido.", "r-telefone");
          if (!C.validarCPF(rep.cpf)) throw new ErroNegocio("CPF do representante inválido.", "r-cpf");
          if (rep.matricula && !C.validarMatricula(rep.matricula)) throw new ErroNegocio("Matrícula deve ter de 6 a 12 dígitos.", "r-matricula");
          const outros = (Array.isArray(dados.participantes) ? dados.participantes : []).slice(0, SUB.maxParticipantes).map((p, i) => ({
            i, nome: C.capitalizarNome(texto(p && p.nome, 100)), email: C.normalizarEmail(texto(p && p.email, 120)), cpf: C.soDigitos(texto(p && p.cpf, 20))
          }));
          if (outros.length + 1 > SUB.maxParticipantes) throw new ErroNegocio(`No máximo ${SUB.maxParticipantes} participantes por trabalho.`, "participantes");
          for (const p of outros) {
            if (!C.validarNome(p.nome)) throw new ErroNegocio(`Participante ${p.i + 2}: informe nome e sobrenome.`, `p-nome-${p.i}`);
            if (!C.validarCPF(p.cpf)) throw new ErroNegocio(`Participante ${p.i + 2}: CPF inválido.`, `p-cpf-${p.i}`);
            if (!C.validarEmail(p.email)) throw new ErroNegocio(`Participante ${p.i + 2}: e-mail inválido.`, `p-email-${p.i}`);
          }
          const cpfs = [rep.cpf, ...outros.map((p) => p.cpf)];
          if (new Set(cpfs).size !== cpfs.length) throw new ErroNegocio("O mesmo CPF aparece mais de uma vez entre os participantes.", "participantes");
          const emails = [rep.email, ...outros.map((p) => p.email)];
          if (new Set(emails).size !== emails.length) throw new ErroNegocio("O mesmo e-mail aparece mais de uma vez entre os participantes.", "participantes");

          // Cada participante é um cadastro próprio (para consultar e baixar o próprio certificado).
          // Quem já está cadastrado é reaproveitado sem alterar seus dados.
          const pessoas = await store.list(ENT.aluno);
          const planos = [{ ...rep, campo: "r", representante: true }, ...outros.map((p) => ({ ...p, campo: `p-email-${p.i}` }))];
          for (const pl of planos) {
            pl.existente = pessoas.find((a) => a.cpf === pl.cpf) || null;
            if (!pl.existente && pessoas.some((a) => a.email === pl.email)) {
              throw new ErroNegocio(`O e-mail ${pl.email} já está cadastrado com outro CPF.`, pl.representante ? "r-email" : pl.campo, 409);
            }
          }
          const titulos = new Set((await store.list(ENT.trabalho)).filter((t) => planos.some((pl) => pl.existente && (t.autoresIds || []).includes(pl.existente.id))).map((t) => normalizarTitulo(t.titulo)));
          if (titulos.has(normalizarTitulo(titulo))) throw new ErroNegocio("Este trabalho já foi submetido por um dos participantes.", "titulo", 409);

          const ids = [];
          let representante = null;
          for (const pl of planos) {
            let pessoa = pl.existente;
            if (!pessoa) {
              pessoa = await store.create(ENT.aluno, {
                nome: pl.nome, email: pl.email, cpf: pl.cpf, telefone: pl.representante ? pl.telefone : "", matricula: pl.representante ? pl.matricula : "",
                curso, periodo: "", consentimentoLGPD: true, aceitaWhatsApp: pl.representante && dados.aceitaWhatsApp === true, atividades: []
              });
              pessoa = await store.update(ENT.aluno, pessoa.id, { tokenIngresso: await C.gerarTokenIngresso(pessoa.id, pessoa.cpf, segredo) });
            }
            ids.push(pessoa.id);
            if (pl.representante) representante = pessoa;
          }
          const protocolo = `TR-${C.gerarId("").slice(-6)}`;
          const t = await store.create(ENT.trabalho, {
            protocolo, titulo, vinculo: vinculo.id, vinculoNome: vinculo.nome, modalidade, curso, orientadores, resumo,
            arquivo: { nome: texto(arquivo.nome, 120), tipo: texto(arquivo.tipo, 100), tamanho: arquivo.tamanho, ref: arquivo.ref },
            representanteId: representante.id, autoresIds: ids, status: "em_analise", parecer: "", sessao: null, horarioApresentacao: "", apresentado: false
          });
          return { trabalho: trabalhoParticipante(t), representante: alunoDono(representante), participantes: ids.length };
        });
      },

      async consultarParticipante(cpf, email) {
        const a = await identificarParticipante(cpf, email);
        return { aluno: alunoDono(a), situacao: await situacaoDe(a.id), trabalhos: (await trabalhosDe(a.id)).map(trabalhoParticipante) };
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
        const [alunos, frequencias, certificados, membros, emails, trabalhos] = await Promise.all([
          store.list(ENT.aluno), store.list(ENT.frequencia), store.list(ENT.certificado), store.list(ENT.membro), store.list(ENT.email), store.list(ENT.trabalho)
        ]);
        return {
          alunos: alunos.slice().sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")),
          frequencias,
          certificados,
          membros: membros.map(membroPublico).sort((a, b) => (a.status === "pendente" ? -1 : 0) - (b.status === "pendente" ? -1 : 0) || a.nome.localeCompare(b.nome, "pt-BR")),
          emails: emails.slice().sort((a, b) => String(b.created_date).localeCompare(String(a.created_date))),
          trabalhos: trabalhos.slice().sort((a, b) => String(b.created_date).localeCompare(String(a.created_date)))
        };
      },

      // Banca/organização: parecer, sessão e horário da apresentação, confirmação de que apresentou.
      async avaliarTrabalho(id, dados) {
        dados = dados || {};
        const t = (await store.list(ENT.trabalho)).find((x) => x.id === String(id));
        if (!t) throw new ErroNegocio("Trabalho não encontrado.", null, 404);
        const patch = {};
        if (dados.status !== undefined) {
          if (!["em_analise", "aprovado", "reprovado"].includes(dados.status)) throw new ErroNegocio("Situação inválida.");
          patch.status = dados.status;
        }
        if (dados.parecer !== undefined) patch.parecer = texto(dados.parecer, 1000);
        if (dados.sessao !== undefined) {
          if (dados.sessao && !CFG.eventos.some((e) => e.id === dados.sessao)) throw new ErroNegocio("Sessão inexistente.");
          patch.sessao = dados.sessao || null;
        }
        if (dados.horarioApresentacao !== undefined) patch.horarioApresentacao = texto(dados.horarioApresentacao, 20);
        if (dados.apresentado !== undefined) patch.apresentado = dados.apresentado === true;
        const novo = await store.update(ENT.trabalho, t.id, patch);
        // Lembrete de WhatsApp: a sessão da apresentação entra nas atividades dos participantes
        // (só enquanto o trabalho estiver aprovado).
        if (novo.sessao !== t.sessao || novo.status !== t.status) {
          for (const pid of t.autoresIds || []) {
            const p = await buscarAluno(pid);
            if (!p) continue;
            const atividades = (p.atividades || []).filter((e) => e !== t.sessao && e !== novo.sessao);
            if (novo.sessao && novo.status === "aprovado") atividades.push(novo.sessao);
            await store.update(ENT.aluno, p.id, { atividades: CFG.eventos.map((e) => e.id).filter((e) => atividades.includes(e)) });
          }
        }
        return novo;
      },

      async arquivoDoTrabalho(id) {
        const t = (await store.list(ENT.trabalho)).find((x) => x.id === String(id));
        if (!t || !t.arquivo) throw new ErroNegocio("Arquivo não encontrado.", null, 404);
        return t.arquivo;
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
        if (!sit.aprovado) throw new ErroNegocio("Certificado ainda não liberado: é preciso participar de pelo menos 1 dia do evento.", null, 403);
        // O certificado é da carga total do evento (20h), conforme a coordenação.
        const codigo = await C.gerarCodigoCertificado(a.id, a.cpf, sit.horasCertificado, segredo);
        const existente = (await store.list(ENT.certificado)).find((c) => c.alunoId === a.id);
        const trabalhos = (await trabalhosDe(a.id)).filter((t) => t.apresentado).map((t) => ({ titulo: t.titulo, modalidade: nomeModalidade(t.modalidade) }));
        const dados = { alunoId: a.id, nome: a.nome, curso: a.curso, horas: sit.horasCertificado, atividades: sit.atividades, trabalhos, codigo };
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
          "Ana Beatriz Sousa", "Carlos Eduardo Lima", "Fernanda Rocha Alves", "João Pedro Carvalho", "Mariana Costa Ribeiro",
          "Rafael Nunes Barbosa", "Larissa Mendes Prado", "Thiago Oliveira Santos", "Juliana Freitas Moura", "Lucas Almeida Teixeira"
        ];
        const gerarCPF = (semente) => {
          const base = String(100000000 + semente * 7919).slice(0, 9).split("").map(Number);
          const dv = (arr) => { const s = arr.reduce((acc, n, i) => acc + n * (arr.length + 1 - i), 0); const r = (s * 10) % 11; return r === 10 ? 0 : r; };
          base.push(dv(base)); base.push(dv(base));
          return base.join("");
        };
        const pessoa = (i) => ({ nome: nomes[i], cpf: gerarCPF(i + 11), email: `${nomes[i].split(" ")[0].toLowerCase()}.demo${i}@exemplo.com`, telefone: `8699${String(1000000 + i * 1371).slice(0, 7)}`, matricula: String(20260000 + i * 37) });
        const resumo = (tema) => `Introdução: ${tema} é um desafio presente no dia a dia da comunidade atendida pelo projeto. Objetivos: levar orientação prática ao público e medir o impacto da ação. ` +
          `Método: oficinas e encontros presenciais, com questionário antes e depois das atividades. Principais resultados: aumento do conhecimento dos participantes e boa adesão às atividades. ` +
          `Considerações finais: a ação aproximou a universidade da comunidade e pode ser ampliada no próximo semestre.`;
        const trabalhos = [
          { titulo: "Educação financeira para jovens da comunidade", vinculo: "APIEXT1", curso: "Administração", autores: [0, 8], status: "aprovado", sessao: "EV02", apresentado: true },
          { titulo: "Primeiros socorros nas escolas públicas de Teresina", vinculo: "APIEXT2", curso: "Enfermagem", autores: [4, 6], status: "aprovado", sessao: "EV03" },
          { titulo: "Aplicativo de agendamento para a clínica-escola", vinculo: "TCC", modalidade: "oral", curso: "Análise e Desenvolvimento de Sistemas", autores: [1, 9, 3], status: "em_analise", orientadores: ["Prof. Me. Ricardo Alves Sousa", "Profª. Ana Paula Lima"] },
          { titulo: "Direitos do consumidor no comércio digital", vinculo: "APIEXT3", curso: "Direito", autores: [2], status: "reprovado", parecer: "O resumo não apresenta método e resultados. Reenvie no próximo edital." },
          { titulo: "Reaproveitamento de resíduos da construção civil", vinculo: "PIC", modalidade: "banner", curso: "Engenharia Civil", autores: [5, 7], status: "aprovado", sessao: "EV04", apresentado: true }
        ];
        const presencas = { 0: ["EV01", "EV02"], 8: ["EV02"], 4: ["EV03"], 6: ["EV03"], 1: ["EV01"], 5: ["EV04", "EV05"], 7: ["EV04"], 3: ["EV02"], 9: ["EV05"] };
        for (const t of trabalhos) {
          try {
            const [rep, ...outros] = t.autores.map(pessoa);
            const r = await S.submeterTrabalho({
              titulo: t.titulo, vinculo: t.vinculo, modalidade: t.modalidade, curso: t.curso, resumo: resumo(t.titulo.toLowerCase()),
              orientadores: t.orientadores || ["Profª. Drª. Helena Martins Costa"],
              representante: rep, participantes: outros, consentimentoLGPD: true, aceitaWhatsApp: true
            }, { nome: "trabalho-exemplo.pdf", tipo: "application/pdf", tamanho: 2048, ref: "exemplo" });
            const salvo = (await store.list(ENT.trabalho)).find((x) => x.protocolo === r.trabalho.protocolo);
            await S.avaliarTrabalho(salvo.id, { status: t.status, parecer: t.parecer || (t.status === "aprovado" ? "Trabalho aprovado pela banca." : ""), sessao: t.sessao, horarioApresentacao: t.sessao ? "Ordem definida no dia" : "", apresentado: !!t.apresentado });
          } catch (e) { if (!(e instanceof ErroNegocio)) throw e; }
        }
        const todos = await store.list(ENT.aluno);
        for (const [i, sessoes] of Object.entries(presencas)) {
          const a = todos.find((x) => x.cpf === gerarCPF(Number(i) + 11));
          if (a) for (const ev of sessoes) await registrarCheckin(a.id, ev, "demo", null);
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
