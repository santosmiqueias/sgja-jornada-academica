/*
 * Camada de dados usada pelas telas (window.SGJA_API). Dois modos, mesmas funções:
 *
 *   backend: "servidor"  -> evento real. Tudo passa pela API (servicos/api-gateway), com login por perfil.
 *                           O navegador nunca recebe a lista completa de inscritos sem login de professor,
 *                           e nenhum segredo ou senha fica no site.
 *   backend: "local"     -> demonstração. As mesmas regras (js/servico.js) rodam no navegador, com os dados
 *                           no localStorage deste aparelho. Serve para apresentar, NÃO para dados reais.
 */
(function () {
  "use strict";
  const C = window.SGJACore;
  const CFG = window.SGJA_CONFIG;
  const { ErroNegocio, criarServico, ENT } = window.SGJAServico;
  const MODO = CFG.backend === "servidor" ? "servidor" : "local";

  const sessao = {
    ler(k) { try { return JSON.parse(sessionStorage.getItem(k) || "null"); } catch (_) { return null; } },
    gravar(k, v) { try { sessionStorage.setItem(k, JSON.stringify(v)); } catch (_) {} },
    apagar(k) { try { sessionStorage.removeItem(k); } catch (_) {} }
  };
  const valida = (s) => s && s.expira > Date.now() ? s : null;
  const pdfBase64 = (doc) => doc.output("datauristring").split(",")[1];
  const lerBase64 = (arquivo) => new Promise((ok, erro) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result).split(",")[1] || "");
    r.onerror = () => erro(new ErroNegocio("Não foi possível ler o arquivo.", "arquivo"));
    r.readAsDataURL(arquivo);
  });
  function salvarBlob(blob, nome) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = nome || "trabalho";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }

  const comum = {
    ErroNegocio,
    backend: MODO,
    eventos() { return CFG.eventos.slice(); },
    diasMinimos() { return Math.max(1, Number(CFG.evento.diasMinimosCertificado) || 1); },
    cargaTotal() { return CFG.evento.cargaHorariaTotal; },
    situacaoDe(alunoId, frequencias) {
      return C.avaliarCertificado(frequencias, CFG.eventos, alunoId, CFG.evento.diasMinimosCertificado, CFG.evento.cargaHorariaTotal);
    },
    sessaoComissao() { return valida(sessao.ler("sgja_sessao_comissao")); },
    sessaoProfessor() { return !!valida(sessao.ler("sgja_sessao_professor")); },
    sairComissao() { sessao.apagar("sgja_sessao_comissao"); },
    sairProfessor() { sessao.apagar("sgja_sessao_professor"); }
  };

  /* ======================= Modo servidor ======================= */
  function criarModoServidor() {
    const BASE = String(CFG.servidor && CFG.servidor.url || "").replace(/\/$/, "");
    if (!/^https:\/\/|^http:\/\/localhost(:\d+)?$|^http:\/\/127\.0\.0\.1(:\d+)?$/.test(BASE)) {
      console.error("config.servidor.url precisa usar HTTPS (ou localhost em testes).");
    }

    async function req(metodo, caminho, corpo, perfil) {
      const headers = { "Content-Type": "application/json" };
      const s = perfil && valida(sessao.ler(`sgja_sessao_${perfil}`));
      if (perfil) {
        if (!s) throw new ErroNegocio("Sua sessão terminou. Entre de novo.", null, 401);
        headers.Authorization = `Bearer ${s.token}`;
      }
      let r;
      try {
        r = await fetch(`${BASE}/api/v1${caminho}`, { method: metodo, headers, body: corpo ? JSON.stringify(corpo) : undefined, credentials: "omit", cache: "no-store" });
      } catch (_) { throw new ErroNegocio("Sem conexão com o servidor. Verifique a internet e tente de novo.", null, 0); }
      const dados = await r.json().catch(() => ({}));
      if (!r.ok) {
        if (r.status === 401 && perfil) sessao.apagar(`sgja_sessao_${perfil}`);
        throw new ErroNegocio(dados.erro || "Não foi possível concluir agora.", dados.campo, r.status);
      }
      return dados;
    }

    return {
      ...comum,
      async contarInscritos() { return (await req("GET", "/publico/resumo")).inscritos; },
      async submeterTrabalho(dados, arquivo) {
        return req("POST", "/publico/submissoes", { ...dados, arquivo: { nome: arquivo.name, base64: await lerBase64(arquivo) } });
      },
      async consultarParticipante(cpf, email) { return req("POST", "/publico/participante", { cpf, email }); },
      async emitirCertificadoParticipante(cpf, email) { return (await req("POST", "/publico/certificado", { cpf, email })).certificado; },
      async enviarCertificadoParticipante(cpf, email, _aluno, _cert, doc) {
        return req("POST", "/publico/certificado/email", { cpf, email, pdfBase64: pdfBase64(doc) });
      },
      async buscarCertificadoPorCodigo(codigo) {
        try { return (await req("GET", `/publico/certificados/${encodeURIComponent(codigo)}`)).certificado; }
        catch (e) { if (e.status === 404) return null; throw e; }
      },

      async cadastrarMembro(d) { return (await req("POST", "/comissao/cadastro", d)).membro; },
      async entrarComissao(email, senha) {
        const r = await req("POST", "/comissao/login", { email, senha });
        sessao.gravar("sgja_sessao_comissao", { token: r.token, id: r.membro.id, nome: r.membro.nome, expira: Date.now() + ((CFG.comissao && CFG.comissao.sessaoMinutos) || 240) * 60000 });
        return r.membro;
      },
      async chamada(eventoId) { return req("GET", `/comissao/chamada?eventoId=${encodeURIComponent(eventoId)}`, null, "comissao"); },
      async checkin(dados) { return req("POST", "/comissao/checkin", dados, "comissao"); },
      async removerCheckin(alunoId, eventoId) { return req("POST", "/comissao/checkin/remover", { alunoId, eventoId }, "comissao"); },

      async entrarProfessor(senha) {
        const r = await req("POST", "/professor/login", { senha });
        sessao.gravar("sgja_sessao_professor", { token: r.token, expira: Date.now() + CFG.painel.sessaoMinutos * 60000 });
      },
      async dadosPainel() { return req("GET", "/professor/dados", null, "professor"); },
      async definirStatusMembro(id, status) { return (await req("PUT", `/professor/membros/${encodeURIComponent(id)}`, { status }, "professor")).membro; },
      async avaliarTrabalho(id, dados) { return (await req("PUT", `/professor/trabalhos/${encodeURIComponent(id)}`, dados, "professor")).trabalho; },
      async baixarArquivoTrabalho(trabalho) {
        const s = valida(sessao.ler("sgja_sessao_professor"));
        if (!s) throw new ErroNegocio("Sua sessão terminou. Entre de novo.", null, 401);
        const r = await fetch(`${BASE}/api/v1/professor/trabalhos/${encodeURIComponent(trabalho.id)}/arquivo`, { headers: { Authorization: `Bearer ${s.token}` }, credentials: "omit", cache: "no-store" });
        if (!r.ok) throw new ErroNegocio("Não foi possível baixar o arquivo.", null, r.status);
        salvarBlob(await r.blob(), trabalho.arquivo && trabalho.arquivo.nome);
      },
      async emitirCertificadoProfessor(alunoId) { return (await req("POST", `/professor/certificados/${encodeURIComponent(alunoId)}`, null, "professor")).certificado; },
      async enviarCertificadoProfessor(aluno, _cert, doc) {
        return req("POST", `/professor/certificados/${encodeURIComponent(aluno.id)}/email`, { pdfBase64: pdfBase64(doc) }, "professor");
      },
      async agendaLembretes() { try { return await req("GET", "/professor/lembretes/agenda", null, "professor"); } catch (_) { return null; } },
      async popularDemo() { return req("POST", "/professor/demo", null, "professor"); },
      async limparTudo() { return req("POST", "/professor/limpar", null, "professor"); }
    };
  }

  /* ======================= Modo local (demonstração) ======================= */
  function criarModoLocal() {
    class LocalStore {
      constructor(prefixo) { this.prefixo = prefixo; this.memoria = {}; }
      _ler(ent) { try { const raw = localStorage.getItem(this.prefixo + ent); return raw ? JSON.parse(raw) : []; } catch (_) { return this.memoria[ent] || []; } }
      _gravar(ent, lista) { this.memoria[ent] = lista; try { localStorage.setItem(this.prefixo + ent, JSON.stringify(lista)); } catch (_) {} }
      async list(ent) { return this._ler(ent).map((x) => ({ ...x })); }
      async create(ent, obj) { const novo = { ...obj, id: C.gerarId(ent.slice(0, 2)), created_date: new Date().toISOString() }; this._gravar(ent, [...this._ler(ent), novo]); return { ...novo }; }
      async update(ent, id, patch) {
        const lista = this._ler(ent); const i = lista.findIndex((x) => x.id === id);
        if (i < 0) throw new ErroNegocio("Registro não encontrado.", null, 404);
        lista[i] = { ...lista[i], ...patch, id: lista[i].id, updated_date: new Date().toISOString() };
        this._gravar(ent, lista); return { ...lista[i] };
      }
      async remove(ent, id) { this._gravar(ent, this._ler(ent).filter((x) => x.id !== id)); }
      async limparTudo() { Object.values(ENT).forEach((e) => this._gravar(e, [])); }
    }
    const S = criarServico({ store: new LocalStore("sgja_v1_"), config: CFG, core: C, segredo: CFG.segredoAssinatura });

    // Arquivos dos trabalhos na demonstração: IndexedDB deste navegador (localStorage é pequeno demais).
    const ARQ = {
      abrir() {
        return new Promise((ok, erro) => {
          const r = indexedDB.open("sgja_arquivos", 1);
          r.onupgradeneeded = () => r.result.createObjectStore("arquivos");
          r.onsuccess = () => ok(r.result);
          r.onerror = () => erro(new ErroNegocio("Este navegador não permite guardar o arquivo.", "arquivo"));
        });
      },
      async guardar(ref, blob) {
        const db = await ARQ.abrir();
        await new Promise((ok, erro) => { const t = db.transaction("arquivos", "readwrite"); t.objectStore("arquivos").put(blob, ref); t.oncomplete = ok; t.onerror = erro; });
      },
      async ler(ref) {
        const db = await ARQ.abrir();
        return new Promise((ok) => { const g = db.transaction("arquivos").objectStore("arquivos").get(ref); g.onsuccess = () => ok(g.result || null); g.onerror = () => ok(null); });
      },
      async apagar(ref) { try { const db = await ARQ.abrir(); db.transaction("arquivos", "readwrite").objectStore("arquivos").delete(ref); } catch (_) {} }
    };
    const extensaoOk = (nome) => CFG.submissao.arquivo.extensoes.includes(String(nome || "").split(".").pop().toLowerCase());

    const membroSessao = () => {
      const s = comum.sessaoComissao();
      if (!s) throw new ErroNegocio("Sua sessão terminou. Entre de novo.", null, 401);
      return s.id;
    };
    const exigirProfessor = () => { if (!comum.sessaoProfessor()) throw new ErroNegocio("Faça login para continuar.", null, 401); };

    // E-mail na demonstração: "simulado" (só registra) ou "emailjs" (envia pelo navegador).
    async function enviarEmail(aluno, cert, doc) {
      const assunto = CFG.email.assunto;
      const mensagem = `Olá, ${aluno.nome.split(" ")[0]}!\n\nObrigado por participar da ${CFG.evento.nome} da ${CFG.evento.sigla} Teresina.\n` +
        `Segue em anexo o seu certificado de ${cert.horas} horas.\n\nCódigo de autenticidade: ${cert.codigo}\n\nComissão Organizadora — ${CFG.evento.instituicao}`;
      const anexo = window.SGJA_PDF.nomeArquivo(aluno);
      let status = "simulado";
      if (CFG.email.modo === "emailjs") {
        const ej = CFG.email.emailjs;
        if (!window.emailjs || !ej.publicKey) throw new ErroNegocio("EmailJS não configurado em js/config.js.");
        await window.emailjs.send(ej.serviceId, ej.templateId, { to_email: aluno.email, to_name: aluno.nome, subject: assunto, message: mensagem, certificado: `data:application/pdf;base64,${pdfBase64(doc)}` }, { publicKey: ej.publicKey });
        status = "enviado";
      }
      await S.registrarEnvio(aluno, cert, assunto, mensagem, anexo, status, CFG.email.modo);
      const [u, d] = aluno.email.split("@");
      return { status, para: `${u.slice(0, 2)}***@${d}` };
    }

    return {
      ...comum,
      contarInscritos: () => S.contarInscritos(),
      async submeterTrabalho(dados, arquivo) {
        if (!arquivo) throw new ErroNegocio("Anexe o arquivo do trabalho.", "arquivo");
        if (!extensaoOk(arquivo.name)) throw new ErroNegocio("Envie o arquivo em PDF, DOC ou DOCX.", "arquivo");
        if (arquivo.size > CFG.submissao.arquivo.maxMB * 1048576) throw new ErroNegocio(`O arquivo pode ter no máximo ${CFG.submissao.arquivo.maxMB} MB.`, "arquivo");
        const ref = C.gerarId("ARQ");
        await ARQ.guardar(ref, arquivo);
        try { return await S.submeterTrabalho(dados, { nome: arquivo.name, tipo: arquivo.type, tamanho: arquivo.size, ref }); }
        catch (e) { await ARQ.apagar(ref); throw e; }
      },
      consultarParticipante: (cpf, email) => S.consultarParticipante(cpf, email),
      emitirCertificadoParticipante: (cpf, email) => S.emitirCertificadoParticipante(cpf, email),
      async enviarCertificadoParticipante(cpf, email, _aluno, _cert, doc) {
        const aluno = await S.identificarParticipante(cpf, email);
        return enviarEmail(aluno, await S.emitirCertificado(aluno.id), doc);
      },
      buscarCertificadoPorCodigo: (codigo) => S.buscarCertificadoPorCodigo(codigo),

      cadastrarMembro: (d) => S.cadastrarMembro(d),
      async entrarComissao(email, senha) {
        const m = await S.autenticarMembro(email, senha);
        sessao.gravar("sgja_sessao_comissao", { id: m.id, nome: m.nome, expira: Date.now() + ((CFG.comissao && CFG.comissao.sessaoMinutos) || 240) * 60000 });
        return m;
      },
      chamada: (eventoId) => S.chamada(membroSessao(), eventoId),
      async checkin(d) {
        const id = membroSessao();
        if (d.qr) return S.checkinPorQR(id, d.qr, d.eventoId);
        if (d.cpf) return S.checkinPorCPF(id, d.cpf, d.eventoId);
        return S.registrarCheckin(id, d.alunoId, d.eventoId, d.origem);
      },
      removerCheckin: (alunoId, eventoId) => S.removerCheckin(membroSessao(), alunoId, eventoId),

      // Na demonstração o PIN é conferido no navegador. Para o evento real, use backend "servidor".
      async entrarProfessor(pin) {
        if ((await C.sha256Hex(String(pin || ""))) !== CFG.painel.pinHash) throw new ErroNegocio("PIN incorreto.", null, 401);
        sessao.gravar("sgja_sessao_professor", { expira: Date.now() + CFG.painel.sessaoMinutos * 60000 });
      },
      async dadosPainel() { exigirProfessor(); return S.dadosPainel(); },
      async definirStatusMembro(id, status) { exigirProfessor(); return S.definirStatusMembro(id, status); },
      async avaliarTrabalho(id, dados) { exigirProfessor(); return S.avaliarTrabalho(id, dados); },
      async baixarArquivoTrabalho(trabalho) {
        exigirProfessor();
        const blob = trabalho.arquivo && await ARQ.ler(trabalho.arquivo.ref);
        if (!blob) throw new ErroNegocio("Arquivo de exemplo: não há arquivo real para baixar nesta demonstração.", null, 404);
        salvarBlob(blob, trabalho.arquivo.nome);
      },
      async emitirCertificadoProfessor(alunoId) { exigirProfessor(); return S.emitirCertificado(alunoId); },
      async enviarCertificadoProfessor(aluno, cert, doc) { exigirProfessor(); return enviarEmail(aluno, cert, doc); },
      async agendaLembretes() { return null; },
      async popularDemo() { return S.popularDemo(); },
      async limparTudo() { exigirProfessor(); return S.limparTudo(); }
    };
  }

  window.SGJA_API = MODO === "servidor" ? criarModoServidor() : criarModoLocal();
})();
