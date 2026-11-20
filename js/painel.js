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

  function desenharInscritos() {
    const lista = filtrarAlunos($("busca-inscritos").value);
    $("tb-inscritos").innerHTML = lista.length ? lista.map((a) => {
      const s = situacaoDe(a);
      const tipo = (a.inscricao === "participante" ? ' <span class="badge text-bg-light border fw-normal" title="Inscrito para assistir, sem trabalho">Participante</span>' : "")
        + (a.publico === "externo" ? ` <span class="badge text-bg-light border fw-normal" title="${esc(a.instituicao || "Público externo")}">Externo</span>` : "");
      return `<tr><td class="fw-semibold">${esc(a.nome)}${tipo}</td><td class="small">${esc(a.curso) || "—"}</td><td class="small">${C.mascararCPFParaExibicao(a.cpf)}</td>
        <td class="small">${esc(a.matricula) || (a.publico === "externo" ? esc(a.instituicao) : "") || "—"}</td>
        <td class="small" title="${esc((a.atividades || []).join(", "))}">${(a.atividades || []).length} de ${CFG.eventos.length}</td><td class="small">${s.feitas} · ${s.dias} dia(s)</td>
        <td><span class="badge ${s.aprovado ? "badge-ok" : "badge-pend"}">${s.aprovado ? "Apto" : "Sem presença"}</span></td>
        <td>${a.aceitaWhatsApp ? '<i class="bi bi-check-lg text-success" aria-label="Autorizou"></i>' : '<span class="text-muted" aria-label="Não autorizou">—</span>'}</td></tr>`;
    }).join("") : `<tr><td colspan="8" class="text-center text-muted py-4">Nenhum inscrito.</td></tr>`;
  }
  $("busca-inscritos").addEventListener("input", desenharInscritos);

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
  function opcoesFiltro(sel, itens, rotuloTodos) {
    const atual = sel.value;
    sel.innerHTML = `<option value="">${rotuloTodos} (${trabalhos.length})</option>` + itens.map(([v, r, n]) => `<option value="${esc(v)}">${esc(r)} (${n})</option>`).join("");
    if ([...sel.options].some((o) => o.value === atual)) sel.value = atual;
  }

  function desenharTrabalhos() {
    const conta = (st) => trabalhos.filter((t) => t.status === st).length;
    $("badge-analise").textContent = conta("em_analise");
    $("badge-analise").classList.toggle("d-none", !conta("em_analise"));
    $("cont-trabalhos").textContent = trabalhos.length;
    $("cont-participantes").textContent = alunos.length;
    const cursos = [...new Set(trabalhos.map((t) => t.curso))].sort((x, y) => x.localeCompare(y, "pt-BR"));
    opcoesFiltro($("filtro-area"), cursos.map((c) => [c, c, trabalhos.filter((t) => t.curso === c).length]), "Todas as áreas");
    opcoesFiltro($("filtro-trabalhos"), Object.entries(STATUS).map(([k, [r]]) => [k, r, conta(k)]), "Todas");
    const area = $("filtro-area").value, filtro = $("filtro-trabalhos").value;
    const termo = $("busca-trabalhos").value.trim().toLowerCase(), dig = C.soDigitos(termo);
    const lista = trabalhos.filter((t) => {
      if (area && t.curso !== area) return false;
      if (filtro && t.status !== filtro) return false;
      if (!termo) return true;
      const pessoas = (t.autoresIds || []).map(aluno).filter(Boolean);
      return t.titulo.toLowerCase().includes(termo) || t.protocolo.toLowerCase().includes(termo) || String(t.curso).toLowerCase().includes(termo)
        || pessoas.some((p) => p.nome.toLowerCase().includes(termo) || String(p.email).toLowerCase().includes(termo) || (dig.length >= 3 && (String(p.cpf).includes(dig) || String(p.matricula || "").includes(dig))));
    });
    $("tb-trabalhos").innerHTML = lista.length ? lista.map((t) => {
      const rep = aluno(t.representanteId) || { nome: "—", email: "" };
      const [rotulo, cor] = STATUS[t.status] || [t.status, "text-bg-light"];
      const s = rep.id ? situacaoDe(rep) : { feitas: 0, dias: 0 };
      const pct = CFG.eventos.length ? Math.round((s.feitas / CFG.eventos.length) * 100) : 0;
      const cert = rep.id && certificados.some((c) => c.alunoId === rep.id);
      const pres = cert ? '<span class="badge badge-ok">Certificado emitido</span>' : s.feitas ? `<span class="badge badge-ok">Presente · ${s.dias} dia(s)</span>` : '<span class="badge selo-cinza">Presença pendente</span>';
      const aprovado = t.status === "aprovado";
      return `<tr>
        <td class="col-trab"><div class="trab-titulo">${esc(t.titulo)}</div><div class="trab-autor">${esc(rep.nome)}${t.autoresIds.length > 1 ? ` <span class="text-muted fw-normal">+ ${t.autoresIds.length - 1}</span>` : ""}</div><div class="small text-muted">${esc(rep.email)} · ${esc(t.protocolo)}</div></td>
        <td class="small"><div class="fw-semibold">${esc(t.curso)}</div><div class="text-muted">${esc(t.vinculoNome)}</div><div class="text-muted">${esc(SUB.modalidades[t.modalidade] || t.modalidade)}</div>${t.sessao ? `<div class="text-muted"><i class="bi bi-calendar-event me-1" aria-hidden="true"></i>${esc(sessaoTexto(t))}</div>` : ""}</td>
        <td class="small"><div>${s.feitas} sessão(ões) · ${pct}%</div>${pres}</td>
        <td class="col-acoes">
          <div class="mb-2"><span class="badge ${cor}">${rotulo}</span>${t.apresentado ? ' <span class="badge badge-ok">Apresentou</span>' : ""}</div>
          <div class="acoes-trab">
            <button class="btn btn-sm ${t.status === "aprovado" ? "btn-success" : "btn-outline-success"}" data-acao="aprovar" data-id="${esc(t.id)}" aria-pressed="${t.status === "aprovado"}"><i class="bi bi-hand-thumbs-up me-1" aria-hidden="true"></i>Aprovar</button>
            <button class="btn btn-sm ${t.status === "reprovado" ? "btn-danger" : "btn-outline-danger"}" data-acao="negar" data-id="${esc(t.id)}" aria-pressed="${t.status === "reprovado"}"><i class="bi bi-hand-thumbs-down me-1" aria-hidden="true"></i>Negar</button>
            <button class="btn btn-sm btn-primary acao-larga" data-acao="ver" data-id="${esc(t.id)}"><i class="bi bi-eye me-1" aria-hidden="true"></i>Ver trabalho</button>
            <button class="btn btn-sm ${t.apresentado ? "btn-success" : "btn-outline-primary"} acao-larga" data-acao="apresentou" data-id="${esc(t.id)}" ${aprovado ? "" : 'disabled title="Disponível depois de aprovar"'}><i class="bi bi-easel me-1" aria-hidden="true"></i>${t.apresentado ? "Apresentado ✓" : "Marcar apresentação"}</button>
            <button class="btn btn-sm btn-outline-secondary acao-larga" data-acao="editar" data-id="${esc(t.id)}"><i class="bi bi-pencil me-1" aria-hidden="true"></i>Editar</button>
          </div>
        </td></tr>`;
    }).join("") : `<tr><td colspan="4" class="text-center text-muted py-4">${trabalhos.length ? "Nenhum trabalho com esse filtro." : "Nenhum trabalho submetido ainda."}</td></tr>`;
  }
  $("busca-trabalhos").addEventListener("input", desenharTrabalhos);
  $("filtro-trabalhos").addEventListener("change", desenharTrabalhos);
  $("filtro-area").addEventListener("change", desenharTrabalhos);

  async function salvarRapido(b, t, dados, msg) {
    b.disabled = true;
    try { await API.avaliarTrabalho(t.id, dados); await recarregar(); UI.aviso(msg, "sucesso"); }
    catch (err) { UI.aviso(err.message, "erro"); b.disabled = false; }
  }

  $("tb-trabalhos").addEventListener("click", async (e) => {
    const b = e.target.closest("[data-acao]");
    if (!b) return;
    const t = trabalhos.find((x) => x.id === b.dataset.id);
    if (!t) return;
    const acao = b.dataset.acao;
    if (acao === "aprovar") return salvarRapido(b, t, { status: t.status === "aprovado" ? "em_analise" : "aprovado" }, t.status === "aprovado" ? "Trabalho voltou para análise." : "Trabalho aprovado.");
    if (acao === "negar") {
      if (t.status === "reprovado") return salvarRapido(b, t, { status: "em_analise" }, "Trabalho voltou para análise.");
      if (!(await UI.confirmar(`Negar o trabalho “${t.titulo}”? O participante verá a situação “Não aprovado”.`, { titulo: "Negar trabalho", botao: "Negar", perigo: true }))) return;
      return salvarRapido(b, t, { status: "reprovado", sessao: "" }, "Trabalho negado.");
    }
    if (acao === "apresentou") return salvarRapido(b, t, { apresentado: !t.apresentado }, t.apresentado ? "Marcação de apresentação removida." : "Apresentação marcada.");
    abrirTrabalho(t, acao === "editar");
  });

  function abrirTrabalho(t, editar) {
    emEdicao = t;
    $("mt-protocolo").textContent = `${t.protocolo} · enviado em ${UI.formatarDataHora(t.created_date)}`;
    $("mt-titulo").textContent = t.titulo;
    const linha = (k, v) => `<dt class="col-sm-4">${esc(k)}</dt><dd class="col-sm-8">${v}</dd>`;
    $("mt-dados").innerHTML =
      linha("Vínculo", esc(t.vinculoNome)) + linha("Formato", esc(SUB.modalidades[t.modalidade] || t.modalidade)) + linha("Curso", esc(t.curso)) +
      (() => { const o = t.orientadores || (t.orientador ? [t.orientador] : []); return o.length ? linha(o.length > 1 ? "Orientadores" : "Orientador", o.map(esc).join("<br>")) : ""; })() +
      linha("Participantes", (t.autoresIds || []).map((id) => { const a = aluno(id); return a ? `${esc(a.nome)} <span class="text-muted">· ${esc(a.email)}</span>${id === t.representanteId ? " <span class=\"badge text-bg-light\">representante</span>" : ""}` : "—"; }).join("<br>")) +
      linha("Arquivo", t.arquivo ? `${esc(t.arquivo.nome)} <span class="text-muted">· ${Math.max(1, Math.round(t.arquivo.tamanho / 1024))} KB</span>` : "—");
    $("mt-resumo").textContent = t.resumo;
    $("mt-status").value = t.status;
    $("mt-sessao").value = t.sessao || "";
    $("mt-horario").value = t.horarioApresentacao || "";
    $("mt-apresentado").checked = !!t.apresentado;
    $("mt-parecer").value = t.parecer || "";
    $("ed-titulo").value = t.titulo; $("ed-vinculo").value = t.vinculo; $("ed-curso").value = t.curso;
    $("ed-modalidade").value = t.modalidade; travarModalidadeEdicao();
    $("ed-orientadores").value = (t.orientadores || []).join("\n"); $("ed-resumo").value = t.resumo; contarResumo();
    modoEdicao(editar);
    modalTrab.show();
  }
  function modoEdicao(on) {
    $("mt-edicao").hidden = !on;
    $("mt-dados").hidden = on; $("mt-resumo").hidden = on; $("mt-resumo").previousElementSibling.hidden = on;
    $("mt-editar").hidden = on;
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
    const status = $("mt-status").value;
    if ($("mt-sessao").value && status !== "aprovado") { UI.aviso("Só trabalhos aprovados recebem sessão de apresentação.", "alerta"); return; }
    if ($("mt-apresentado").checked && status !== "aprovado") { UI.aviso("Só trabalhos aprovados podem ser marcados como apresentados.", "alerta"); return; }
    const dados = { status, parecer: $("mt-parecer").value, sessao: $("mt-sessao").value || "", horarioApresentacao: $("mt-horario").value, apresentado: $("mt-apresentado").checked };
    if (!$("mt-edicao").hidden) Object.assign(dados, {
      titulo: $("ed-titulo").value, vinculo: $("ed-vinculo").value, modalidade: $("ed-modalidade").value, curso: $("ed-curso").value,
      orientadores: $("ed-orientadores").value.split("\n").map((x) => x.trim()).filter(Boolean), resumo: $("ed-resumo").value
    });
    UI.carregando(b, true, "Salvando...");
    try {
      await API.avaliarTrabalho(emEdicao.id, dados);
      modalTrab.hide();
      await recarregar();
      UI.aviso("Trabalho salvo.", "sucesso");
    } catch (err) { UI.aviso(err.message, "erro"); }
    finally { UI.carregando(b, false); }
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
