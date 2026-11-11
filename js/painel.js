/* Painel do professor: login por PIN, inscritos, certificados, lembretes, comissão organizadora e dados.
   O check-in fica em checkin.html, com acesso individual da comissão. */
(function () {
  "use strict";
  const C = window.SGJACore, API = window.SGJA_API, UI = window.SGJA_UI, CFG = window.SGJA_CONFIG;
  const $ = (id) => document.getElementById(id);
  const esc = C.escaparHTML;

  /* ---------------- Autenticação ---------------- */
  const CHAVE_SESSAO = "sgja_sessao_painel";
  const CHAVE_TENTATIVAS = "sgja_tentativas";

  function lerSessao() {
    try { return JSON.parse(sessionStorage.getItem(CHAVE_SESSAO) || "null"); } catch (_) { return null; }
  }
  function sessaoValida() { const s = lerSessao(); return s && s.expira > Date.now(); }
  function lerTentativas() {
    try { return JSON.parse(sessionStorage.getItem(CHAVE_TENTATIVAS) || '{"n":0,"ate":0}'); } catch (_) { return { n: 0, ate: 0 }; }
  }

  $("form-login").addEventListener("submit", async (e) => {
    e.preventDefault();
    const t = lerTentativas();
    if (t.ate > Date.now()) { $("erro-login").textContent = `Muitas tentativas. Aguarde ${Math.ceil((t.ate - Date.now()) / 1000)}s.`; return; }
    const hash = await C.sha256Hex($("pin").value);
    if (hash === CFG.painel.pinHash) {
      try {
        sessionStorage.setItem(CHAVE_SESSAO, JSON.stringify({ expira: Date.now() + CFG.painel.sessaoMinutos * 60000 }));
        sessionStorage.removeItem(CHAVE_TENTATIVAS);
      } catch (_) { /* sem storage: sessão vale só nesta aba aberta */ }
      $("pin").value = ""; $("erro-login").textContent = "";
      abrirPainel();
    } else {
      t.n += 1;
      if (t.n >= 5) { t.ate = Date.now() + 60000; t.n = 0; }
      try { sessionStorage.setItem(CHAVE_TENTATIVAS, JSON.stringify(t)); } catch (_) {}
      $("erro-login").textContent = t.ate > Date.now() ? "PIN incorreto. Acesso bloqueado por 60 segundos." : "PIN incorreto.";
      $("pin").select();
    }
  });

  $("btn-sair").addEventListener("click", () => {
    try { sessionStorage.removeItem(CHAVE_SESSAO); } catch (_) {}
    location.reload();
  });

  /* ---------------- Estado ---------------- */
  let alunos = [], frequencias = [], certificados = [], membros = [];

  async function recarregar() {
    [alunos, frequencias, certificados, membros] = await Promise.all([API.listarAlunos(), API.listarFrequencias(), API.listarCertificados(), API.listarMembros()]);
    desenharInscritos(); desenharLembretes(); desenharComissao(); await desenharCertificados();
  }

  function abrirPainel() {
    $("tela-login").classList.add("d-none");
    $("tela-painel").classList.remove("d-none");
    $("btn-sair").classList.remove("d-none");
    desenharConfig();
    recarregar();
    consultarServidor();
    setInterval(consultarServidor, 60000);
    // Tempo real: outra aba (ex.: inscrição) alterou os dados → atualiza.
    window.addEventListener("storage", (e) => { if (e.key && e.key.startsWith("sgja_v1_")) recarregar(); });
    if (CFG.backend === "base44") setInterval(recarregar, 10000);
  }

  function filtrarAlunos(texto) {
    const t = texto.trim().toLowerCase();
    const d = C.soDigitos(t);
    if (!t) return alunos;
    return alunos.filter((a) => a.nome.toLowerCase().includes(t) || (d && (a.cpf.includes(d) || a.matricula.includes(d))));
  }

  /* ---------------- Inscritos ---------------- */
  const atividadesDe = (aluno) => C.calcularHoras(frequencias, CFG.eventos, aluno.id).atividades;

  function situacaoDe(aluno) {
    const { horas, atividades } = C.calcularHoras(frequencias, CFG.eventos, aluno.id);
    return C.situacaoAluno(atividades.length, CFG.eventos.length, CFG.evento.percentualMinimoAtividades, horas);
  }

  function desenharInscritos() {
    const lista = filtrarAlunos($("busca-inscritos").value);
    $("tb-inscritos").innerHTML = lista.length ? lista.map((a) => {
      const s = situacaoDe(a);
      return `<tr><td class="fw-semibold">${esc(a.nome)}</td><td class="small">${esc(a.curso)}</td><td class="small">${C.mascararCPFParaExibicao(a.cpf)}</td>
        <td class="small">${esc(a.matricula)}</td>
        <td class="small" title="${esc((a.atividades || []).join(", "))}">${(a.atividades || []).length} de ${CFG.eventos.length}</td><td class="small">${s.feitas} · ${s.horas}h</td>
        <td><span class="badge ${s.aprovado ? "badge-ok" : "badge-pend"}">${s.aprovado ? "Apto" : `Falta(m) ${s.faltam} atividade(s)`}</span></td>
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
  async function desenharCertificados() {
    const aptos = alunos.filter((a) => situacaoDe(a).aprovado);
    const enviados = new Set(certificados.filter((c) => c.enviadoPorEmail).map((c) => c.alunoId));
    $("st-aprovados").textContent = aptos.length;
    $("st-pendentes").textContent = alunos.length - aptos.length;
    $("st-enviados").textContent = enviados.size;
    $("st-minimo").textContent = `${API.atividadesMinimas()} de ${CFG.eventos.length}`;
    $("modo-email").textContent = { simulado: "simulado (demonstração)", microsservico: "microsserviço Node", emailjs: "EmailJS" }[CFG.email.modo];

    $("tb-aptos").innerHTML = aptos.length ? aptos.map((a) => `<tr>
        <td class="fw-semibold small">${esc(a.nome)}</td><td class="small">${situacaoDe(a).feitas} de ${CFG.eventos.length} · ${situacaoDe(a).horas}h</td>
        <td>${enviados.has(a.id) ? '<span class="badge badge-ok">Enviado</span>' : '<span class="badge badge-pend">Pendente</span>'}</td>
        <td class="text-end"><button class="btn btn-sm btn-outline-primary btn-pdf" data-id="${esc(a.id)}" aria-label="Baixar certificado de ${esc(a.nome)}"><i class="bi bi-file-earmark-pdf"></i></button></td></tr>`).join("")
      : `<tr><td colspan="4" class="text-center text-muted py-4">Ninguém atingiu a carga mínima ainda.</td></tr>`;

    const emails = await API.listarEmails();
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
    const cert = await API.salvarCertificado(aluno, situacaoDe(aluno).horas, atividadesDe(aluno));
    SGJA_PDF.gerar(aluno, cert).save(SGJA_PDF.nomeArquivo(aluno));
    certificados = await API.listarCertificados();
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
        const cert = await API.salvarCertificado(aluno, situacaoDe(aluno).horas, atividadesDe(aluno));
        await SGJA_EMAIL.enviar(aluno, cert, SGJA_PDF.gerar(aluno, cert));
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
    if (!WA.servidorUrl) return;
    try {
      const r = await fetch(`${WA.servidorUrl.replace(/\/$/, "")}/api/v1/lembretes/agenda`, { signal: AbortSignal.timeout(3000) });
      agendaServidor = r.ok ? await r.json() : null;
    } catch (_) { agendaServidor = null; }
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

  $("btn-exportar-whats").addEventListener("click", () => {
    const lista = alunos.filter((a) => a.aceitaWhatsApp).map((a) => ({ id: a.id, nome: a.nome, telefone: a.telefone, aceitaWhatsApp: true, atividades: a.atividades || [] }));
    if (!lista.length) { UI.aviso("Nenhum inscrito autorizou WhatsApp ainda.", "info"); return; }
    const blob = new Blob([JSON.stringify(lista, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = "inscritos.json"; a.click(); URL.revokeObjectURL(a.href);
    UI.aviso(`${lista.length} inscrito(s) exportados.`, "sucesso");
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
      membros = await API.listarMembros();
      desenharComissao();
      UI.aviso(status === "ativo" ? `Acesso liberado para ${m.nome}.` : `Acesso de ${m.nome} bloqueado.`, "sucesso");
    } catch (err) { UI.aviso(err.message, "erro"); }
  });

  /* ---------------- Dados ---------------- */
  function desenharConfig() {
    const total = API.cargaTotal();
    const itens = [
      ["Banco de dados", CFG.backend === "base44" ? "Base44 (nuvem)" : "Navegador (demonstração)"],
      ["Atividades", `${CFG.eventos.length} atividades · ${total}h`],
      ["Regra do certificado", `check-in em ${CFG.evento.percentualMinimoAtividades}% das atividades = ${API.atividadesMinimas()} de ${CFG.eventos.length}`],
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

  if (sessaoValida()) abrirPainel();
})();
