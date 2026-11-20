/* Organização: login, submissões e banca, participantes, certificados, lembretes, comissão e dados.
   O check-in fica em checkin.html, com acesso individual da comissão. */
(function () {
  "use strict";
  const C = window.SGJACore, API = window.SGJA_API, UI = window.SGJA_UI, CFG = window.SGJA_CONFIG;
  const $ = (id) => document.getElementById(id);
  const esc = C.escaparHTML;

  /* ---------------- Autenticação ---------------- */
  const CHAVE_TENTATIVAS = "sgja_tentativas";
  function lerTentativas() {
    try { return JSON.parse(sessionStorage.getItem(CHAVE_TENTATIVAS) || '{"n":0,"ate":0}'); } catch (_) { return { n: 0, ate: 0 }; }
  }

  if (API.backend === "servidor") {
    document.querySelector('label[for="pin"]').textContent = "Senha da organização";
    $("pin").removeAttribute("inputmode"); $("pin").removeAttribute("maxlength");
    const dica = $("pin").parentElement.querySelector(".form-text"); if (dica) dica.remove();
  }

  $("form-login").addEventListener("submit", async (e) => {
    e.preventDefault();
    const t = lerTentativas();
    if (t.ate > Date.now()) { $("erro-login").textContent = `Muitas tentativas. Aguarde ${Math.ceil((t.ate - Date.now()) / 1000)}s.`; return; }
    UI.carregando($("btn-entrar"), true, "Entrando...");
    try {
      await API.entrarProfessor($("pin").value);
      try { sessionStorage.removeItem(CHAVE_TENTATIVAS); } catch (_) {}
      $("pin").value = ""; $("erro-login").textContent = "";
      abrirPainel();
    } catch (err) {
      if (err.status === 401) {
        t.n += 1;
        if (t.n >= 5) { t.ate = Date.now() + 60000; t.n = 0; }
        try { sessionStorage.setItem(CHAVE_TENTATIVAS, JSON.stringify(t)); } catch (_) {}
      }
      $("erro-login").textContent = t.ate > Date.now() ? "Acesso bloqueado por 60 segundos." : (err.message || "Não foi possível entrar.");
      $("pin").select();
    } finally { UI.carregando($("btn-entrar"), false); }
  });

  $("btn-sair").addEventListener("click", () => { API.sairProfessor(); location.reload(); });
  if ($("btn-sair-topo")) $("btn-sair-topo").addEventListener("click", () => { API.sairProfessor(); location.reload(); });

  /* ---------------- Estado ---------------- */
  let alunos = [], frequencias = [], certificados = [], membros = [], trabalhos = [];

  let emails = [];
  async function recarregar() {
    try {
      const d = await API.dadosPainel();
      ({ alunos, frequencias, certificados, membros, emails } = d);
      trabalhos = d.trabalhos || [];
      desenharTrabalhos(); desenharInscritos(); desenharLembretes(); desenharComissao(); desenharCertificados(); desenharVisao();
    } catch (err) {
      if (err.status === 401) { API.sairProfessor(); location.reload(); return; }
      UI.aviso(err.message || "Não foi possível carregar os dados.", "erro");
    }
  }

  /* ---------------- Visão geral ---------------- */
  function irPara(aba) {
    const b = document.querySelector(`.painel-lateral [data-bs-target="#${aba}"]`);
    if (b) { bootstrap.Tab.getOrCreateInstance(b).show(); window.scrollTo({ top: 0, behavior: "smooth" }); }
  }
  document.addEventListener("click", (e) => { const a = e.target.closest && e.target.closest("[data-ir]"); if (a) { e.preventDefault(); irPara(a.dataset.ir); } });
  // No celular, a barra lateral recolhe ao escolher uma área
  // Os itens ficam em listas separadas (Início, Evento, Administração): o Bootstrap só desmarca dentro da mesma
  // lista, então aqui só o item escolhido fica destacado.
  const linksLaterais = [...document.querySelectorAll(".painel-lateral [data-bs-toggle=pill]")];
  linksLaterais.forEach((b) => b.addEventListener("shown.bs.tab", () => {
    linksLaterais.forEach((x) => { const ativo = x === b; x.classList.toggle("active", ativo); x.setAttribute("aria-selected", String(ativo)); });
    const alvo = b.getAttribute("data-bs-target").slice(1);
    // Título do topo conforme a área
    const TOPO = {
      "aba-visao": ["grid-1x2", "Olá, organização!", "Você gerencia inscrições, avaliação dos trabalhos, participantes, comissão e certificados."],
      "aba-submissoes": ["clipboard-check", "Inscrições", "Em Submissões, abra cada trabalho (dados, resumo e arquivo), aprove ou negue, e marque quem apresentou. Use o filtro por área para ver só os trabalhos de um curso."],
      "aba-checkin": ["qr-code-scan", "Check-in por QR Code", "Escolha a atividade e leia o QR Code do ingresso. Nome, dia, horário e status ficam registrados."],
      "aba-chamada": ["calendar-check", "Chamada", "Marque a presença por atividade, pela lista de nomes."],
      "aba-lembretes": ["whatsapp", "Lembretes", "Lembretes por WhatsApp antes de cada apresentação."],
      "aba-certificados": ["award", "Certificados", "Emissão, envio por e-mail e conferência."],
      "aba-comissao": ["person-gear", "Usuários e perfis", "Libere ou bloqueie o acesso da comissão ao check-in."],
      "aba-config": ["gear", "Configurações e dados", "Configuração atual e dados de demonstração."]
    }[alvo];
    if (TOPO) { $("topo-icone").className = `bi bi-${TOPO[0]}`; $("topo-titulo").textContent = TOPO[1]; $("topo-sub").textContent = TOPO[2]; }
    document.querySelectorAll(".painel-conteudo > .tab-content > .tab-pane").forEach((pane) => { if (pane.id !== alvo) pane.classList.remove("active", "show"); });
    window.scrollTo({ top: 0 });
  }));

  function desenharVisao() {
    const apresentados = trabalhos.filter((t) => t.apresentado).length;
    const emAnalise = trabalhos.filter((t) => t.status === "em_analise").length;
    const aprovSemApres = trabalhos.filter((t) => t.status === "aprovado" && !t.apresentado).length;
    const ouvintes = alunos.filter((a) => a.inscricao === "participante").length;
    const pendentes = membros.filter((m) => m.status === "pendente").length;
    const lib = CFG.evento.certificadosAPartirDe;
    const [ano, mes, dia] = String(lib || "").split("-");
    const dataLib = lib ? `${dia}/${mes}/${ano}` : "";
    const faltam = lib ? Math.ceil((new Date(`${lib}T00:00:00${CFG.evento.fusoHorario || "-03:00"}`) - Date.now()) / 864e5) : 0;
    $("vg-submissoes").textContent = trabalhos.length;
    $("vg-submissoes-sub").textContent = `${apresentados} já apresentaram`;
    $("vg-participantes").textContent = ouvintes;
    $("vg-participantes-sub").textContent = `${alunos.length} inscrições no total`;
    $("vg-presencas").textContent = frequencias.length;
    $("vg-presencas-sub").textContent = `${CFG.eventos.length} atividade(s) na programação`;
    $("vg-certificados").textContent = certificados.length;
    $("vg-certificados-sub").textContent = lib ? `Liberação em ${dataLib}` : "Liberados";
    const itens = [];
    if (emAnalise) itens.push(["mic", `<strong>${emAnalise}</strong> submissão(ões) aguardando a avaliação da banca.`, "aba-submissoes", "Avaliar"]);
    if (aprovSemApres) itens.push(["easel", `<strong>${aprovSemApres}</strong> trabalho(s) aprovado(s) ainda sem a marcação “Apresentou”.`, "aba-submissoes", "Ver submissões"]);
    if (pendentes) itens.push(["person-exclamation", `<strong>${pendentes}</strong> membro(s) da comissão aguardando liberação de acesso.`, "aba-comissao", "Liberar"]);
    if (lib && faltam > 0) itens.push(["award", `Certificados liberados em <strong>${dataLib}</strong> — faltam <strong>${faltam}</strong> dia(s).`, "aba-certificados", "Certificados"]);
    $("vg-atencao").innerHTML = itens.length
      ? itens.map(([ic, txt, aba, rot]) => `<li><span class="atencao-icone"><i class="bi bi-${ic}" aria-hidden="true"></i></span><span class="flex-grow-1">${txt}</span><a href="#" data-ir="${aba}" class="atencao-link">${rot} <i class="bi bi-arrow-right" aria-hidden="true"></i></a></li>`).join("")
      : `<li><span class="atencao-icone"><i class="bi bi-check2-circle" aria-hidden="true"></i></span><span>Nada pendente por enquanto.</span></li>`;
  }

  function abrirPainel() {
    $("tela-login").classList.add("d-none");
    $("tela-painel").classList.remove("d-none");
    document.body.classList.add("modo-painel");
    desenharConfig();
    recarregar();
    consultarServidor();
    setInterval(consultarServidor, 60000);
    // Tempo real: outra aba (ex.: inscrição) alterou os dados → atualiza.
    window.addEventListener("storage", (e) => { if (e.key && e.key.startsWith("sgja_v1_")) recarregar(); });
    if (API.backend === "servidor") setInterval(recarregar, 20000);
  }

  function filtrarAlunos(texto) {
    const t = texto.trim().toLowerCase();
    const d = C.soDigitos(t);
    if (!t) return alunos;
    return alunos.filter((a) => a.nome.toLowerCase().includes(t) || (d && (a.cpf.includes(d) || a.matricula.includes(d))));
  }

  /* ---------------- Inscritos ---------------- */

  function situacaoDe(aluno) {
    return API.situacaoDe(aluno.id, frequencias);
  }

  const telefoneBr = (t) => C.mascaraTelefone(String(t || "")) || "—";
  const textoPresenca = (s) => `${s.feitas} ${s.feitas === 1 ? "sessão" : "sessões"} · ${CFG.eventos.length ? Math.round((s.feitas / CFG.eventos.length) * 100) : 0}%`;
  const seloSituacao = (s) => `<span class="selo-situacao ${s.aprovado ? "ok" : ""}">${s.aprovado ? `Apto · ${s.horasCertificado || s.horas} h` : "Presença pendente"}</span>`;
  const btnAcao = (acao, id, icone, texto, extra) => `<button type="button" class="btn-acao ${extra || ""}" data-acao="${acao}" data-id="${esc(id)}"><i class="bi bi-${icone}" aria-hidden="true"></i>${texto}</button>`;
  const ehOuvinte = (a) => a.inscricao === "participante";

  function desenharInscritos() {
    const ouvintes = alunos.filter(ehOuvinte);
    $("cont-participantes").textContent = ouvintes.length;
    const t = $("busca-inscritos").value.trim().toLowerCase(), d = C.soDigitos(t);
    const lista = !t ? ouvintes : ouvintes.filter((a) => a.nome.toLowerCase().includes(t) || String(a.email || "").toLowerCase().includes(t) || (d.length >= 3 && String(a.cpf).includes(d)));
    const vazio = t ? "Nada encontrado com esta busca." : "Nenhum participante inscrito ainda.";
    const tipo = (a) => a.publico === "externo" ? ` <span class="badge text-bg-light border fw-normal" title="${esc(a.instituicao || "Público externo")}">Externo</span>` : "";
    $("tb-inscritos").innerHTML = lista.length ? lista.map((a) => {
      const s = situacaoDe(a);
      return `<tr>
        <td><div class="trab-autor">${esc(a.nome)}${tipo(a)}</div><div class="small text-muted text-truncate" title="${esc(a.email)}">${esc(a.email)}</div></td>
        <td class="small"><div class="text-nowrap">${esc(telefoneBr(a.telefone))}</div><div class="text-muted text-nowrap">CPF ${C.mascararCPFParaExibicao(a.cpf)}</div></td>
        <td class="small"><div>${textoPresenca(s)}</div><div class="mt-2">${seloSituacao(s)}</div></td>
        <td>${btnAcao("editar-inscrito", a.id, "pencil", "Editar", "w-100")}</td></tr>`;
    }).join("") : `<tr><td colspan="4" class="text-center text-muted py-4">${vazio}</td></tr>`;
    $("lista-inscritos").innerHTML = lista.length ? lista.map((a) => {
      const s = situacaoDe(a);
      return `<li><div class="trab-autor">${esc(a.nome)}${tipo(a)}</div><div class="small text-muted text-break">${esc(a.email)}</div>
        <div class="small">${esc(telefoneBr(a.telefone))} · CPF ${C.mascararCPFParaExibicao(a.cpf)}</div>
        <div class="d-flex flex-wrap align-items-center gap-2 pt-1"><span class="small text-muted">${textoPresenca(s)}</span>${seloSituacao(s)}${btnAcao("editar-inscrito", a.id, "pencil", "Editar")}</div></li>`;
    }).join("") : `<li class="text-muted">${vazio}</li>`;
  }
  $("busca-inscritos").addEventListener("input", desenharInscritos);

  // Edição de um inscrito (dados de contato; CPF e matrícula ficam travados)
  const modalInscrito = new bootstrap.Modal($("modal-inscrito"));
  CFG.cursos.forEach((c) => $("ei-curso").add(new Option(c, c)));
  let inscritoEditando = null;
  function preencherInstituicao(campo, dica, a) {
    const externo = a.publico === "externo";
    $(campo).value = externo ? (a.instituicao || "") : CFG.evento.instituicao;
    $(campo).readOnly = !externo;
    $(dica).textContent = externo ? "" : "Preenchido automaticamente: inscrição como aluno da instituição.";
  }
  function abrirInscrito(a) {
    inscritoEditando = a;
    $("ei-nome").value = a.nome; $("ei-email").value = a.email || ""; $("ei-telefone").value = C.mascaraTelefone(String(a.telefone || ""));
    $("ei-curso").value = CFG.cursos.includes(a.curso) ? a.curso : "";
    preencherInstituicao("ei-instituicao", "ei-instituicao-dica", a);
    $("form-inscrito").querySelectorAll(".is-invalid").forEach((x) => x.classList.remove("is-invalid"));
    modalInscrito.show();
  }
  ["ei-telefone", "ed-telefone"].forEach((id) => $(id).addEventListener("input", (e) => { e.target.value = C.mascaraTelefone(e.target.value); }));
  $("form-inscrito").addEventListener("submit", async (e) => {
    e.preventDefault();
    const a = inscritoEditando; if (!a) return;
    const dados = { nome: $("ei-nome").value, email: $("ei-email").value, telefone: $("ei-telefone").value, curso: $("ei-curso").value };
    if (a.publico === "externo") dados.instituicao = $("ei-instituicao").value;
    UI.carregando($("ei-salvar"), true, "Salvando...");
    try {
      await API.atualizarInscrito(a.id, dados);
      modalInscrito.hide(); await recarregar(); UI.aviso("Inscrição atualizada.", "sucesso");
    } catch (err) {
      const campo = err.campo || (err.dados && err.dados.campo); if (campo && $(campo)) { $(campo).classList.add("is-invalid"); $(campo).focus(); }
      UI.aviso(err.message || "Não foi possível salvar.", "erro");
    } finally { UI.carregando($("ei-salvar"), false); }
  });
  const acoesInscritos = (e) => {
    const b = e.target.closest('[data-acao="editar-inscrito"]'); if (!b) return;
    const a = alunos.find((x) => x.id === b.dataset.id); if (a) abrirInscrito(a);
  };
  $("tb-inscritos").addEventListener("click", acoesInscritos);
  $("lista-inscritos").addEventListener("click", acoesInscritos);

  $("btn-csv").addEventListener("click", () => {
    const cab = ["Nome", "Email", "Telefone", "CPF", "Matricula", "Curso", "Periodo", "Horas", "Situacao", "InscritoEm"];
    const celula = (v) => {
      let s = String(v == null ? "" : v);
      if (/^[=+\-@]/.test(s)) s = "'" + s; // evita injeção de fórmula no Excel
      return `"${s.replace(/"/g, '""')}"`;
    };
    const linhas = alunos.map((a) => {
      const s = situacaoDe(a);
      return [a.nome, a.email, a.telefone, a.cpf, a.matricula, a.curso, a.periodo, s.horas, s.aprovado ? "Apto" : "Pendente", a.created_date].map(celula).join(";");
    });
    const blob = new Blob(["﻿" + [cab.join(";"), ...linhas].join("\r\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = `inscritos-jornada-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click(); URL.revokeObjectURL(a.href);
  });

  /* ---------------- Certificados ---------------- */
  function desenharCertificados() {
    const aptos = alunos.filter((a) => situacaoDe(a).aprovado);
    const enviados = new Set(certificados.filter((c) => c.enviadoPorEmail).map((c) => c.alunoId));
    $("st-aprovados").textContent = aptos.length;
    $("st-pendentes").textContent = alunos.length - aptos.length;
    $("st-enviados").textContent = enviados.size;
    $("st-minimo").textContent = `${API.diasMinimos()} dia`;
    $("modo-email").textContent = API.backend === "servidor" ? "servidor (SMTP)" : ({ simulado: "simulado (demonstração)", emailjs: "EmailJS" }[CFG.email.modo] || CFG.email.modo);

    $("tb-aptos").innerHTML = aptos.length ? aptos.map((a) => `<tr>
        <td class="fw-semibold small">${esc(a.nome)}</td><td class="small">${situacaoDe(a).feitas} atividade(s) · ${situacaoDe(a).dias} dia(s)</td>
        <td>${enviados.has(a.id) ? '<span class="badge badge-ok">Enviado</span>' : '<span class="badge badge-pend">Pendente</span>'}</td>
        <td class="text-end"><button class="btn btn-sm btn-outline-primary btn-pdf" data-id="${esc(a.id)}" aria-label="Baixar certificado de ${esc(a.nome)}"><i class="bi bi-file-earmark-pdf"></i></button></td></tr>`).join("")
      : `<tr><td colspan="4" class="text-center text-muted py-4">Ninguém atingiu a carga mínima ainda.</td></tr>`;

    $("caixa-saida").innerHTML = emails.length ? emails.slice(0, 30).map((m) => `<li class="list-group-item px-0">
        <div class="d-flex justify-content-between"><strong>${esc(m.nome)}</strong><span class="text-muted">${UI.formatarDataHora(m.created_date)}</span></div>
        <div class="text-muted">${esc(m.para)} · <i class="bi bi-paperclip"></i>${esc(m.anexo)}</div>
        <span class="badge ${m.status === "enviado" ? "badge-ok" : "text-bg-light"}">${esc(m.status)}</span></li>`).join("")
      : `<li class="list-group-item px-0 text-muted">Nenhum e-mail enviado.</li>`;
  }

  $("tb-aptos").addEventListener("click", async (e) => {
    const b = e.target.closest(".btn-pdf");
    if (!b) return;
    const aluno = alunos.find((a) => a.id === b.dataset.id);
    try {
      const cert = await API.emitirCertificadoProfessor(aluno.id);
      SGJA_PDF.gerar(aluno, cert).save(SGJA_PDF.nomeArquivo(aluno));
    } catch (err) { UI.aviso(err.message, "erro"); }
  });

  $("btn-lote").addEventListener("click", async (e) => {
    const btn = e.currentTarget;
    const jaEnviados = new Set(certificados.filter((c) => c.enviadoPorEmail).map((c) => c.alunoId));
    const fila = alunos.filter((a) => situacaoDe(a).aprovado && !jaEnviados.has(a.id));
    if (!fila.length) { UI.aviso("Nenhum certificado pendente de envio.", "info"); return; }
    if (!(await UI.confirmar(`Gerar e enviar ${fila.length} certificado(s) por e-mail? Quem já recebeu não recebe de novo.`, { titulo: "Enviar certificados", botao: "Gerar e enviar" }))) return;
    UI.carregando(btn, true, "Enviando...");
    const barra = $("progresso-lote"); barra.classList.remove("d-none");
    let ok = 0, falhas = 0;
    for (let i = 0; i < fila.length; i++) {
      const aluno = fila[i];
      $("status-lote").textContent = `Processando ${i + 1} de ${fila.length}: ${aluno.nome}`;
      try {
        const cert = await API.emitirCertificadoProfessor(aluno.id);
        await API.enviarCertificadoProfessor(aluno, cert, SGJA_PDF.gerar(aluno, cert));
        ok++;
      } catch (err) { console.error(err); falhas++; }
      barra.firstElementChild.style.width = `${Math.round(((i + 1) / fila.length) * 100)}%`;
    }
    $("status-lote").textContent = `Concluído: ${ok} enviado(s)${falhas ? `, ${falhas} falha(s) — tente novamente para reenviar só os que faltaram` : ""}.`;
    UI.carregando(btn, false);
    await recarregar();
    UI.aviso(`${ok} certificado(s) enviados.`, falhas ? "alerta" : "sucesso");
  });

  /* ---------------- Lembretes WhatsApp ---------------- */
  const WA = CFG.whatsapp || { antecedenciaMinutos: 30 };
  const hhmm = (d) => d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Fortaleza" });
  const ddmm = (d) => d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Fortaleza" });
  let agendaServidor = null;

  async function consultarServidor() {
    agendaServidor = await API.agendaLembretes();
    desenharLembretes();
  }

  function desenharLembretes() {
    const com = alunos.filter((a) => a.aceitaWhatsApp).length;
    $("st-whats").textContent = com;
    $("st-sem-whats").textContent = alunos.length - com;
    $("st-antecedencia").textContent = `${WA.antecedenciaMinutos} min`;
    $("st-servidor").innerHTML = agendaServidor
      ? `<span class="text-success"><i class="bi bi-circle-fill small"></i> Online</span> <span class="small text-muted">(${esc(agendaServidor.provedor)})</span>`
      : '<span class="text-secondary"><i class="bi bi-circle small"></i> Offline</span>';
    const agora = Date.now();
    $("tb-lembretes").innerHTML = API.eventos().map((ev) => {
      const ini = C.inicioEvento(ev, CFG.evento.fusoHorario);
      const envio = new Date(ini.getTime() - WA.antecedenciaMinutos * 60000);
      const srv = agendaServidor && agendaServidor.atividades.find((x) => x.id === ev.id);
      let situacao;
      if (srv && srv.enviados) situacao = `<span class="badge badge-ok">${srv.enviados} enviado(s)</span>${srv.falhas ? ` <span class="badge text-bg-danger">${srv.falhas} falha(s)</span>` : ""}`;
      else if (agora >= ini.getTime()) situacao = '<span class="badge text-bg-light">Encerrado</span>';
      else if (agora >= envio.getTime()) situacao = '<span class="badge badge-pend">Enviando agora</span>';
      else situacao = `<span class="badge text-bg-light">Agendado · ${alunos.filter((a) => C.recebeLembrete(a, ev.id)).length} aluno(s)</span>`;
      return `<tr><td class="small fw-semibold">${esc(ev.titulo)}</td><td class="small text-nowrap">${ddmm(ini)} ${hhmm(ini)}</td>
        <td class="small text-nowrap"><i class="bi bi-whatsapp text-success me-1" aria-hidden="true"></i>${hhmm(envio)}</td><td>${situacao}</td></tr>`;
    }).join("");
    const exemplo = alunos.find((a) => C.recebeLembrete(a, API.eventos()[0].id)) || { nome: "Maria da Silva" };
    $("previa-whats").textContent = C.mensagemLembrete(exemplo, API.eventos()[0], CFG.evento.nome, WA.antecedenciaMinutos);
  }


  /* ---------------- Submissões e banca ---------------- */
  const SUB = CFG.submissao;
  const STATUS = { em_analise: ["Em análise", "badge-pend"], aprovado: ["Aprovado", "badge-ok"], reprovado: ["Não aprovado", "text-bg-danger"] };
  const nomePessoa = (id) => { const a = alunos.find((x) => x.id === id); return a ? a.nome : "—"; };
  const sessaoTexto = (t) => {
    const ev = t.sessao && CFG.eventos.find((e) => e.id === t.sessao);
    return ev ? `${UI.formatarData(ev.data).slice(0, 5)} · ${ev.turno}${t.horarioApresentacao ? ` · ${t.horarioApresentacao}` : ""}` : "";
  };
  const modalTrab = new bootstrap.Modal($("modal-trabalho"));
  let emEdicao = null;
  CFG.eventos.filter((e) => /Apresenta/i.test(e.titulo)).forEach((e) =>
    $("mt-sessao").add(new Option(`${UI.formatarData(e.data)} · ${e.turno} · ${e.horario}`, e.id)));

  // Seletor Submissões / Participantes (mesma área "Inscrições")
  document.querySelectorAll('input[name="sub-insc"]').forEach((r) => r.addEventListener("change", () => {
    const trab = $("sub-trabalhos").checked;
    $("painel-trabalhos").hidden = !trab; $("painel-participantes").hidden = trab;
  }));

  // Selects de edição
  SUB.vinculos.forEach((v) => $("ed-vinculo").add(new Option(v.nome, v.id)));
  CFG.cursos.forEach((c) => $("ed-curso").add(new Option(c, c)));
  function travarModalidadeEdicao() {
    const v = SUB.vinculos.find((x) => x.id === $("ed-vinculo").value);
    [...$("ed-modalidade").options].forEach((o) => { o.disabled = !!(v && v.modalidade && o.value !== v.modalidade); });
    if (v && v.modalidade) $("ed-modalidade").value = v.modalidade;
  }
  $("ed-vinculo").addEventListener("change", travarModalidadeEdicao);
  const contarResumo = () => { $("ed-contador").textContent = `(${C.contarSemEspacos($("ed-resumo").value).toLocaleString("pt-BR")} / ${SUB.maxCaracteresResumo.toLocaleString("pt-BR")} sem espaços)`; };
  $("ed-resumo").addEventListener("input", contarResumo);

  const aluno = (id) => alunos.find((x) => x.id === id);
  const naArea = (t, area) => !area || t.curso === area;
  function opcoesFiltro(sel, itens, rotuloTodos, total) {
    const atual = sel.value;
    sel.innerHTML = `<option value="">${rotuloTodos} (${total})</option>` + itens.map(([v, r, n]) => `<option value="${esc(v)}">${esc(r)} (${n})</option>`).join("");
    if ([...sel.options].some((o) => o.value === atual)) sel.value = atual;
  }

  // Aprovar / Negar, ou a decisão já tomada com "Desfazer"; motivo da negação logo abaixo.
  const SELO_AVALIACAO = { em_analise: ["Aguardando avaliação", "clock", "pend"], aprovado: ["Aprovado", "check-circle", "ok"], reprovado: ["Negado", "x-circle", "neg"] };
  function seloAvaliacao(t) {
    const [r, i, c] = SELO_AVALIACAO[t.status] || SELO_AVALIACAO.em_analise;
    return `<span class="selo-avaliacao ${c}"><i class="bi bi-${i}" aria-hidden="true"></i>${r}</span>`;
  }
  function htmlAvaliacao(t, centro) {
    const decidido = t.status === "aprovado" || t.status === "reprovado";
    const nome = esc(nomePessoa(t.representanteId));
    const topo = decidido
      ? `<div class="d-flex flex-wrap align-items-center gap-2 ${centro ? "justify-content-center" : ""}">${seloAvaliacao(t)}<button type="button" class="btn-desfazer" data-acao="desfazer" data-id="${esc(t.id)}" aria-label="Desfazer avaliação de ${nome}"><i class="bi bi-arrow-counterclockwise" aria-hidden="true"></i>Desfazer</button></div>`
      : `<div class="avaliar-grade"><button type="button" class="btn-aprovar" data-acao="aprovar" data-id="${esc(t.id)}" aria-label="Aprovar submissão de ${nome}"><i class="bi bi-hand-thumbs-up" aria-hidden="true"></i>Aprovar</button><button type="button" class="btn-negar" data-acao="negar" data-id="${esc(t.id)}" aria-label="Negar submissão de ${nome}"><i class="bi bi-hand-thumbs-down" aria-hidden="true"></i>Negar</button></div>`;
    const motivo = t.status === "reprovado" && t.parecer ? `<p class="motivo-negacao"><strong>Motivo:</strong> ${esc(t.parecer)}</p>` : "";
    return topo + motivo;
  }
  function btnApresentou(t) {
    const bloqueado = t.status !== "aprovado" && !t.apresentado;
    return `<button type="button" class="btn-acao ${t.apresentado ? "apresentou" : ""}" data-acao="apresentou" data-id="${esc(t.id)}" aria-pressed="${!!t.apresentado}" ${bloqueado ? 'disabled title="Aprove o trabalho antes de marcar a apresentação."' : ""}><i class="bi bi-${t.apresentado ? "check-lg" : "easel"}" aria-hidden="true"></i>${t.apresentado ? "Apresentou" : "Marcar apresentação"}</button>`;
  }
  function infoTrabalho(t) {
    const rep = aluno(t.representanteId) || { nome: "—", email: "" };
    const s = rep.id ? situacaoDe(rep) : { feitas: 0, aprovado: false, horas: 0 };
    const cert = rep.id && certificados.some((c) => c.alunoId === rep.id);
    const coautores = Math.max(0, (t.autoresIds || []).length - 1);
    const arquivo = `<span class="trab-arquivo"><i class="bi bi-file-earmark-text" aria-hidden="true"></i>${t.arquivo ? "Arquivo enviado" : "Sem arquivo"}${coautores ? ` · ${coautores} coautor(es)` : ""}</span>`;
    return { rep, s, cert, arquivo, formato: SUB.modalidades[t.modalidade] || t.modalidade };
  }

  function desenharTrabalhos() {
    const pend = trabalhos.filter((t) => t.status === "em_analise").length;
    $("badge-analise").textContent = pend;
    $("badge-analise").classList.toggle("d-none", !pend);
    $("cont-trabalhos").textContent = trabalhos.length;
    const cursos = [...new Set(trabalhos.map((t) => t.curso))].sort((x, y) => x.localeCompare(y, "pt-BR"));
    opcoesFiltro($("filtro-area"), cursos.map((c) => [c, c, trabalhos.filter((t) => t.curso === c).length]), "Todas as áreas", trabalhos.length);
    const area = $("filtro-area").value;
    const daArea = trabalhos.filter((t) => naArea(t, area));
    opcoesFiltro($("filtro-trabalhos"), Object.entries(SELO_AVALIACAO).map(([k, [r]]) => [k, r === "Aguardando avaliação" ? "Aguardando" : r, daArea.filter((t) => t.status === k).length]), "Todas", daArea.length);
    const filtro = $("filtro-trabalhos").value;
    $("limpar-filtros").hidden = !(area || filtro);
    const termo = $("busca-trabalhos").value.trim().toLowerCase(), dig = C.soDigitos(termo);
    const lista = daArea.filter((t) => {
      if (filtro && t.status !== filtro) return false;
      if (!termo) return true;
      const pessoas = (t.autoresIds || []).map(aluno).filter(Boolean);
      return t.titulo.toLowerCase().includes(termo) || t.protocolo.toLowerCase().includes(termo) || String(t.curso).toLowerCase().includes(termo)
        || pessoas.some((p) => p.nome.toLowerCase().includes(termo) || String(p.email).toLowerCase().includes(termo) || (dig.length >= 3 && (String(p.cpf).includes(dig) || String(p.matricula || "").includes(dig))));
    });
    const vazio = termo || area || filtro ? "Nada encontrado com esta busca ou filtro." : "Nenhum trabalho submetido ainda.";
    $("tb-trabalhos").innerHTML = lista.length ? lista.map((t) => {
      const { rep, s, cert, arquivo, formato } = infoTrabalho(t);
      return `<tr>
        <td><button type="button" class="trab-titulo-link" data-acao="ver" data-id="${esc(t.id)}" title="${esc(t.titulo)}">${esc(t.titulo)}</button>
          <div class="trab-autor mt-1">${esc(rep.nome)}</div><div class="small text-muted text-break">${esc(rep.email)}</div>${arquivo}</td>
        <td class="small"><div class="fw-semibold">${esc(t.curso)}</div><div class="text-muted">${esc(t.vinculoNome)}</div><div class="text-muted">${esc(formato)}</div>${t.sessao ? `<div class="text-muted"><i class="bi bi-calendar-event me-1" aria-hidden="true"></i>${esc(sessaoTexto(t))}</div>` : ""}</td>
        <td class="small"><div>${textoPresenca(s)}</div><div class="mt-2">${cert ? '<span class="selo-situacao ok">Certificado emitido</span>' : seloSituacao(s)}</div></td>
        <td><div class="avaliacao-celula">${htmlAvaliacao(t, true)}</div>
          <div class="acoes-pilha">${btnAcao("ver", t.id, "eye", "Ver trabalho", "destaque")}${btnApresentou(t)}${btnAcao("editar", t.id, "pencil", "Editar")}</div></td></tr>`;
    }).join("") : `<tr><td colspan="4" class="text-center text-muted py-4">${vazio}</td></tr>`;
    $("lista-trabalhos").innerHTML = lista.length ? lista.map((t) => {
      const { rep, s, cert, arquivo, formato } = infoTrabalho(t);
      return `<li><button type="button" class="trab-titulo-link" data-acao="ver" data-id="${esc(t.id)}">${esc(t.titulo)}</button>
        <div class="small"><strong>${esc(rep.nome)}</strong><span class="d-block text-muted text-break">${esc(rep.email)}</span></div>
        <div class="small text-muted">${[t.curso, t.vinculoNome, formato].filter(Boolean).map(esc).join(" · ")}</div>
        <div class="small text-muted">${arquivo} · ${textoPresenca(s)}</div>
        <div class="avaliacao-cartao">${htmlAvaliacao(t)}</div>
        <div class="d-flex flex-wrap align-items-center gap-2">${btnAcao("ver", t.id, "eye", "Ver trabalho", "destaque")}${btnApresentou(t)}${cert ? '<span class="selo-situacao ok">Certificado emitido</span>' : seloSituacao(s)}${btnAcao("editar", t.id, "pencil", "Editar")}</div></li>`;
    }).join("") : `<li class="text-muted">${vazio}</li>`;
    if (emEdicao && $("modal-trabalho").classList.contains("show")) {
      const atual = trabalhos.find((x) => x.id === emEdicao.id);
      if (atual) { emEdicao = atual; $("mt-avaliar").innerHTML = htmlAvaliacao(atual); }
    }
  }
  $("busca-trabalhos").addEventListener("input", desenharTrabalhos);
  $("filtro-trabalhos").addEventListener("change", desenharTrabalhos);
  $("filtro-area").addEventListener("change", desenharTrabalhos);
  $("limpar-filtros").addEventListener("click", () => { $("filtro-area").value = ""; $("filtro-trabalhos").value = ""; desenharTrabalhos(); });

  async function salvarRapido(b, t, dados, msg) {
    b.disabled = true;
    try { await API.avaliarTrabalho(t.id, dados); await recarregar(); UI.aviso(msg, "sucesso"); return true; }
    catch (err) { UI.aviso(err.message, "erro"); b.disabled = false; return false; }
  }

  // Negar com motivo opcional
  const modalNegar = new bootstrap.Modal($("modal-negar"));
  let negando = null;
  $("ng-motivo").addEventListener("input", () => { $("ng-contador").textContent = `${$("ng-motivo").value.length}/500`; });
  $("ng-confirmar").addEventListener("click", async (e) => {
    if (!negando) return;
    const t = negando, b = e.currentTarget;
    UI.carregando(b, true, "Salvando...");
    const ok = await salvarRapido(b, t, { status: "reprovado", sessao: "", parecer: $("ng-motivo").value.trim() }, `${nomePessoa(t.representanteId)}: submissão negada.${t.apresentado ? " A marcação de apresentação foi retirada." : ""}`);
    UI.carregando(b, false); b.disabled = false;
    if (ok) { negando = null; modalNegar.hide(); }
  });

  async function acaoTrabalho(e) {
    const b = e.target.closest("[data-acao][data-id]");
    if (!b) return;
    const t = trabalhos.find((x) => x.id === b.dataset.id);
    if (!t) return;
    const nome = nomePessoa(t.representanteId);
    switch (b.dataset.acao) {
      case "aprovar": return salvarRapido(b, t, { status: "aprovado" }, `${nome}: submissão aprovada.`);
      case "negar":
        negando = t;
        $("ng-descricao").textContent = `“${t.titulo}”, de ${nome}.`;
        $("ng-motivo").value = ""; $("ng-contador").textContent = "0/500";
        modalNegar.show();
        return;
      case "desfazer": return salvarRapido(b, t, { status: "em_analise" }, `${nome}: avaliação desfeita, voltou para “Aguardando”.`);
      case "apresentou": return salvarRapido(b, t, { apresentado: !t.apresentado }, t.apresentado ? `${nome}: apresentação desmarcada.` : `${nome}: apresentação registrada.`);
      case "ver": return abrirTrabalho(t, false);
      case "editar": return abrirTrabalho(t, true);
    }
  }
  ["tb-trabalhos", "lista-trabalhos", "mt-avaliar"].forEach((id) => $(id).addEventListener("click", acaoTrabalho));

  const iniciais = (nome) => { const p = String(nome || "").trim().split(/\s+/).filter(Boolean); return p.length ? (p[0][0] + (p.length > 1 ? p[p.length - 1][0] : "")).toUpperCase() : "?"; };
  function dado(icone, rotulo, valor, largo) {
    return `<div class="mt-dado ${largo ? "largo" : ""}"><i class="bi bi-${icone}" aria-hidden="true"></i><div class="min-w-0"><dt>${esc(rotulo)}:</dt><dd>${valor}</dd></div></div>`;
  }

  function abrirTrabalho(t, editar) {
    emEdicao = t;
    const rep = aluno(t.representanteId) || { nome: "—", email: "" };
    const formato = SUB.modalidades[t.modalidade] || t.modalidade;
    $("mt-titulo").textContent = t.titulo;
    $("mt-chips").innerHTML = [formato, t.vinculoNome, t.curso].filter(Boolean).map((x) => `<span>${esc(x)}</span>`).join("") + (t.sessao ? `<span><i class="bi bi-calendar-event me-1" aria-hidden="true"></i>${esc(sessaoTexto(t))}</span>` : "");
    $("mt-arquivo-box").hidden = !t.arquivo; $("mt-sem-arquivo").hidden = !!t.arquivo;
    if (t.arquivo) { $("mt-arquivo-nome").textContent = t.arquivo.nome; $("mt-arquivo-tam").textContent = `${Math.max(1, Math.round(t.arquivo.tamanho / 1024)).toLocaleString("pt-BR")} KB`; }
    $("mt-resumo").textContent = t.resumo || "Sem resumo.";
    const coautores = (t.autoresIds || []).filter((id) => id !== t.representanteId).map(aluno).filter(Boolean);
    const orient = t.orientadores || (t.orientador ? [t.orientador] : []);
    $("mt-autoria").innerHTML = `<div class="mt-apresentador"><span class="mt-avatar" aria-hidden="true">${esc(iniciais(rep.nome))}</span><span class="min-w-0"><span class="mt-rotulo">Apresentador:</span><strong>${esc(rep.nome)}</strong></span></div>
      <p class="mt-rotulo d-flex justify-content-between mt-3 mb-2"><span>Coautores:</span><span class="mt-contagem">${coautores.length}</span></p>
      ${coautores.length ? `<ol class="mt-coautores">${coautores.map((c, n) => `<li><span>${n + 1}</span>${esc(c.nome)}</li>`).join("")}</ol>` : '<p class="small text-muted mb-0">Nenhum (trabalho individual).</p>'}
      ${orient.length ? `<p class="mt-rotulo mt-3 mb-1">${orient.length > 1 ? "Orientadores" : "Orientador"}:</p><p class="mb-0">${orient.map(esc).join("<br>")}</p>` : ""}`;
    const externo = rep.publico === "externo";
    const tel = C.soDigitos(rep.telefone || "");
    $("mt-contato").innerHTML =
      dado("patch-check", "Inscrição", externo ? "Público externo" : "Aluno da instituição") +
      dado("building", "Instituição", esc(externo ? (rep.instituicao || "—") : CFG.evento.instituicao)) +
      (!externo && rep.matricula ? dado("hash", "Matrícula", esc(rep.matricula)) : "") +
      dado("calendar3", "Inscrito em", esc(UI.formatarDataHora(t.created_date))) +
      dado("envelope", "E-mail", rep.email ? `<a href="mailto:${esc(rep.email)}" class="text-break">${esc(rep.email)}</a>` : "—", true) +
      (tel ? dado("telephone", "Telefone", `<a href="tel:+55${tel}" class="text-nowrap">${esc(telefoneBr(tel))}</a>`) : "") +
      (rep.cpf ? dado("shield-check", "CPF", C.mascararCPFParaExibicao(rep.cpf)) : "");
    $("mt-protocolo").textContent = `Protocolo ${t.protocolo}`;
    $("mt-avaliar").innerHTML = htmlAvaliacao(t);
    // Edição
    $("ed-nome").value = rep.nome === "—" ? "" : rep.nome; $("ed-email").value = rep.email || ""; $("ed-telefone").value = C.mascaraTelefone(String(rep.telefone || ""));
    preencherInstituicao("ed-instituicao", "ed-instituicao-dica", rep);
    $("ed-titulo").value = t.titulo; $("ed-vinculo").value = t.vinculo; $("ed-curso").value = t.curso;
    $("ed-modalidade").value = t.modalidade; travarModalidadeEdicao();
    $("ed-orientadores").value = (t.orientadores || []).join("\n"); $("ed-resumo").value = t.resumo; contarResumo();
    $("mt-status").value = t.status;
    $("mt-sessao").value = t.sessao || "";
    $("mt-horario").value = t.horarioApresentacao || "";
    $("mt-apresentado").checked = !!t.apresentado;
    $("mt-parecer").value = t.parecer || "";
    modoEdicao(editar);
    modalTrab.show();
  }
  function modoEdicao(on) {
    $("mt-edicao").hidden = !on; $("mt-ver").hidden = on;
    $("mt-rodape-avaliacao").hidden = on; $("mt-editar").hidden = on; $("mt-salvar").hidden = !on;
    $("mt-fechar").textContent = on ? "Cancelar" : "Fechar";
  }
  $("mt-editar").addEventListener("click", () => { modoEdicao(true); $("ed-titulo").focus(); });

  $("mt-arquivo").addEventListener("click", async (e) => {
    const b = e.currentTarget;
    UI.carregando(b, true, "Baixando...");
    try { await API.baixarArquivoTrabalho(emEdicao); }
    catch (err) { UI.aviso(err.message, err.status === 404 ? "info" : "erro"); }
    finally { UI.carregando(b, false); }
  });

  $("mt-salvar").addEventListener("click", async (e) => {
    const b = e.currentTarget;
    const t = emEdicao;
    const status = $("mt-status").value;
    if ($("mt-sessao").value && status !== "aprovado") { UI.aviso("Só trabalhos aprovados recebem sessão de apresentação.", "alerta"); return; }
    if ($("mt-apresentado").checked && status !== "aprovado") { UI.aviso("Só trabalhos aprovados podem ser marcados como apresentados.", "alerta"); return; }
    const dados = {
      status, parecer: $("mt-parecer").value, sessao: $("mt-sessao").value || "", horarioApresentacao: $("mt-horario").value, apresentado: $("mt-apresentado").checked,
      titulo: $("ed-titulo").value, vinculo: $("ed-vinculo").value, modalidade: $("ed-modalidade").value, curso: $("ed-curso").value,
      orientadores: $("ed-orientadores").value.split("\n").map((x) => x.trim()).filter(Boolean), resumo: $("ed-resumo").value
    };
    const rep = aluno(t.representanteId);
    let contato = null;
    if (rep) {
      contato = { nome: $("ed-nome").value, email: $("ed-email").value, telefone: $("ed-telefone").value };
      if (rep.publico === "externo") contato.instituicao = $("ed-instituicao").value;
      const mudou = contato.nome.trim() !== rep.nome || contato.email.trim().toLowerCase() !== String(rep.email || "").toLowerCase()
        || C.soDigitos(contato.telefone) !== C.soDigitos(rep.telefone || "") || (contato.instituicao !== undefined && contato.instituicao.trim() !== (rep.instituicao || ""));
      if (!mudou) contato = null;
    }
    UI.carregando(b, true, "Salvando...");
    try {
      if (contato) await API.atualizarInscrito(rep.id, contato);
      await API.avaliarTrabalho(t.id, dados);
      modalTrab.hide();
      await recarregar();
      UI.aviso("Inscrição atualizada.", "sucesso");
    } catch (err) {
      const campo = err.campo || (err.dados && err.dados.campo), mapa = { "ei-nome": "ed-nome", "ei-email": "ed-email", "ei-telefone": "ed-telefone", "ei-instituicao": "ed-instituicao" };
      const alvo = $(mapa[campo] || ("ed-" + String(campo || "").replace(/^ed-/, "")));
      if (campo && alvo) { alvo.classList.add("is-invalid"); alvo.focus(); setTimeout(() => alvo.classList.remove("is-invalid"), 4000); }
      UI.aviso(err.message, "erro");
    } finally { UI.carregando(b, false); }
  });

  /* ---------------- Comissão organizadora ---------------- */
  const ROTULO_STATUS = { pendente: ["Aguardando liberação", "badge-pend"], ativo: ["Com acesso", "badge-ok"], bloqueado: ["Bloqueado", "text-bg-danger"] };

  function desenharComissao() {
    const conta = (st) => membros.filter((m) => m.status === st).length;
    const pend = conta("pendente");
    $("st-membros-pendentes").textContent = pend;
    $("st-membros-ativos").textContent = conta("ativo");
    $("st-membros-bloqueados").textContent = conta("bloqueado");
    $("badge-pendentes").textContent = pend;
    $("badge-pendentes").classList.toggle("d-none", !pend);
    const feitos = (id) => frequencias.filter((f) => f.registradoPorId === id).length;
    $("tb-comissao").innerHTML = membros.length ? membros.map((m) => {
      const [rotulo, cor] = ROTULO_STATUS[m.status] || [m.status, "text-bg-light"];
      const acao = m.status === "ativo"
        ? `<button class="btn btn-sm btn-outline-danger btn-membro" data-id="${esc(m.id)}" data-status="bloqueado">Bloquear</button>`
        : `<button class="btn btn-sm btn-primary btn-membro" data-id="${esc(m.id)}" data-status="ativo">${m.status === "pendente" ? "Liberar acesso" : "Reativar"}</button>`;
      return `<tr><td class="fw-semibold small">${esc(m.nome)}</td><td class="small">${esc(m.email)}</td>
        <td class="small d-none d-md-table-cell">${C.mascararCPFParaExibicao(m.cpf)}</td>
        <td><span class="badge ${cor}">${rotulo}</span></td><td class="small d-none d-md-table-cell">${feitos(m.id)}</td>
        <td class="text-end">${acao}</td></tr>`;
    }).join("") : `<tr><td colspan="6" class="text-center text-muted py-4">Nenhum membro cadastrado. Peça à comissão para criar o cadastro na página Check-in.</td></tr>`;
  }

  $("tb-comissao").addEventListener("click", async (e) => {
    const b = e.target.closest(".btn-membro");
    if (!b) return;
    const m = membros.find((x) => x.id === b.dataset.id);
    const status = b.dataset.status;
    if (status === "bloqueado" && !(await UI.confirmar(`${m.nome} não poderá mais registrar check-in até ser reativado.`, { titulo: "Bloquear acesso", botao: "Bloquear", perigo: true }))) return;
    try {
      await API.definirStatusMembro(m.id, status);
      await recarregar();
      UI.aviso(status === "ativo" ? `Acesso liberado para ${m.nome}.` : `Acesso de ${m.nome} bloqueado.`, "sucesso");
    } catch (err) { UI.aviso(err.message, "erro"); }
  });

  /* ---------------- Dados ---------------- */
  function desenharConfig() {
    const total = API.cargaTotal();
    const itens = [
      ["Banco de dados", API.backend === "servidor" ? "Servidor (com login)" : "Navegador (demonstração)"],
      ["Atividades", `${CFG.eventos.length} atividades · ${total}h`],
      ["Regra do certificado", `participar de pelo menos ${API.diasMinimos()} dia → certificado de ${CFG.evento.cargaHorariaTotal}h`],
      ["E-mail", CFG.email.modo],
      ["Sessão do painel", `${CFG.painel.sessaoMinutos} min`]
    ];
    $("dl-config").innerHTML = itens.map(([k, v]) => `<dt class="col-5">${esc(k)}</dt><dd class="col-7">${esc(v)}</dd>`).join("");
  }

  $("btn-demo").addEventListener("click", async (e) => {
    const botao = e.currentTarget; // guardar antes do await: depois dele, currentTarget vira null
    UI.carregando(botao, true, "Criando...");
    try { await API.popularDemo(); await recarregar(); UI.aviso("Dados de demonstração criados.", "sucesso"); }
    catch (err) { UI.aviso(err.message, "erro"); }
    finally { UI.carregando(botao, false); }
  });

  $("btn-limpar").addEventListener("click", async () => {
    if (!(await UI.confirmar("Isso apaga todos os inscritos, presenças, certificados e cadastros da comissão deste navegador.", { titulo: "Apagar todos os dados", botao: "Apagar tudo", perigo: true, exigirTexto: "APAGAR" }))) return;
    try { await API.limparTudo(); await recarregar(); UI.aviso("Dados apagados.", "sucesso"); }
    catch (err) { UI.aviso(err.message, "erro"); }
  });

  if (API.sessaoProfessor()) abrirPainel();
})();
