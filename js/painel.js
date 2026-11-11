/* Painel do professor: login por PIN, chamada, QR Code, inscritos e certificados em lote. */
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
    pararCamera();
    location.reload();
  });

  /* ---------------- Estado ---------------- */
  let alunos = [], frequencias = [], certificados = [];
  let atividade = null;
  const ultimos = [];

  async function recarregar() {
    [alunos, frequencias, certificados] = await Promise.all([API.listarAlunos(), API.listarFrequencias(), API.listarCertificados()]);
    desenharChamada(); desenharInscritos(); desenharLembretes(); await desenharCertificados();
  }

  function abrirPainel() {
    $("tela-login").classList.add("d-none");
    $("tela-painel").classList.remove("d-none");
    $("btn-sair").classList.remove("d-none");
    montarSeletor();
    desenharConfig();
    recarregar();
    consultarServidor();
    setInterval(consultarServidor, 60000);
    // Tempo real: outra aba (ex.: inscrição) alterou os dados → atualiza.
    window.addEventListener("storage", (e) => { if (e.key && e.key.startsWith("sgja_v1_")) recarregar(); });
    if (CFG.backend === "base44") setInterval(recarregar, 10000);
  }

  /* ---------------- Check-in ---------------- */
  function montarSeletor() {
    const sel = $("sel-atividade");
    const agora = new Date();
    let sugerida = API.eventos()[0].id;
    API.eventos().forEach((ev) => {
      sel.add(new Option(`${UI.formatarData(ev.data)} · ${ev.turno} — ${ev.titulo} (${ev.cargaHoraria}h)`, ev.id));
      const [ini] = ev.horario.split("–").map((s) => s.trim());
      if (new Date(`${ev.data}T${ini}:00`) <= agora) sugerida = ev.id; // última atividade já iniciada
    });
    sel.value = sugerida;
    atividade = sugerida;
    sel.addEventListener("change", () => { atividade = sel.value; desenharChamada(); });
  }

  const presentesNaAtividade = () => new Set(frequencias.filter((f) => f.eventoId === atividade).map((f) => f.alunoId));

  function filtrarAlunos(texto) {
    const t = texto.trim().toLowerCase();
    const d = C.soDigitos(t);
    if (!t) return alunos;
    return alunos.filter((a) => a.nome.toLowerCase().includes(t) || (d && (a.cpf.includes(d) || a.matricula.includes(d))));
  }

  const inscritoEm = (a, eventoId) => Array.isArray(a.atividades) && a.atividades.includes(eventoId);

  function desenharChamada() {
    const presentes = presentesNaAtividade();
    const filtro = $("filtro-chamada").value;
    const inscritos = alunos.filter((a) => inscritoEm(a, atividade));
    let lista = filtrarAlunos($("busca-chamada").value);
    if (filtro === "inscritos") lista = lista.filter((a) => inscritoEm(a, atividade) || presentes.has(a.id));
    if (filtro === "ausentes") lista = lista.filter((a) => inscritoEm(a, atividade) && !presentes.has(a.id));
    if (filtro === "presentes") lista = lista.filter((a) => presentes.has(a.id));

    const presentesInscritos = inscritos.filter((a) => presentes.has(a.id)).length;
    $("st-presentes").textContent = presentes.size;
    $("st-inscritos").textContent = inscritos.length;
    $("st-pct").textContent = inscritos.length ? `${Math.round((presentesInscritos / inscritos.length) * 100)}%` : "0%";

    $("tb-chamada").innerHTML = lista.length ? lista.map((a) => {
      const p = presentes.has(a.id);
      const extra = inscritoEm(a, atividade) ? "" : ' <span class="badge text-bg-light" title="Não se inscreveu nesta atividade">não inscrito</span>';
      return `<tr class="${p ? "presente" : ""}">
        <td><input class="form-check-input chk-presenca" type="checkbox" data-id="${esc(a.id)}" ${p ? "checked" : ""} aria-label="Presença de ${esc(a.nome)}"></td>
        <td><div class="fw-semibold">${esc(a.nome)}${extra}</div><div class="small text-muted">CPF ${C.mascararCPFParaExibicao(a.cpf)}</div></td>
        <td class="d-none d-md-table-cell small">${esc(a.curso)}</td>
        <td class="d-none d-sm-table-cell small">${esc(a.matricula)}</td></tr>`;
    }).join("") : `<tr><td colspan="4" class="text-center text-muted py-4">${alunos.length ? "Nenhum aluno nesta lista." : "Nenhum inscrito ainda. Use a aba Dados para criar alunos de demonstração."}</td></tr>`;
    $("info-chamada").textContent = `${lista.length} aluno(s) na lista`;
  }

  $("busca-chamada").addEventListener("input", desenharChamada);
  $("filtro-chamada").addEventListener("change", desenharChamada);

  $("tb-chamada").addEventListener("change", async (e) => {
    if (!e.target.classList.contains("chk-presenca")) return;
    const id = e.target.dataset.id;
    e.target.disabled = true;
    try {
      if (e.target.checked) { const r = await API.registrarCheckin(id, atividade, "painel"); registrarUltimo(r.aluno, r.novo); }
      else await API.removerCheckin(id, atividade);
      frequencias = await API.listarFrequencias();
      desenharChamada(); desenharInscritos(); await desenharCertificados();
    } catch (err) {
      e.target.checked = !e.target.checked;
      UI.aviso(err.message || "Erro ao registrar presença.", "erro");
    } finally { e.target.disabled = false; }
  });

  $("btn-marcar-todos").addEventListener("click", async (e) => {
    const presentes = presentesNaAtividade();
    const ids = [...document.querySelectorAll(".chk-presenca")].map((c) => c.dataset.id).filter((id) => !presentes.has(id));
    if (!ids.length) { UI.aviso("Todos os alunos visíveis já estão presentes.", "info"); return; }
    const botao = e.currentTarget;
    if (!(await UI.confirmar(`Registrar presença de ${ids.length} aluno(s) nesta atividade?`, { titulo: "Confirmar presenças", botao: "Registrar presenças" }))) return;
    UI.carregando(botao, true, "Registrando...");
    try {
      for (const id of ids) await API.registrarCheckin(id, atividade, "lote");
      await recarregar();
      UI.aviso(`${ids.length} presença(s) registradas.`, "sucesso");
    } finally { UI.carregando(botao, false); }
  });

  function registrarUltimo(aluno, novo) {
    ultimos.unshift({ nome: aluno.nome, novo, hora: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) });
    ultimos.splice(8);
    $("ultimos").innerHTML = ultimos.map((u) =>
      `<li class="mb-1"><i class="bi ${u.novo ? "bi-check-circle-fill text-success" : "bi-info-circle text-primary"} me-1"></i><strong>${esc(u.nome)}</strong> <span class="text-muted">· ${u.hora}${u.novo ? "" : " · já estava presente"}</span></li>`).join("");
  }

  async function checkinAluno(aluno, origem) {
    const r = await API.registrarCheckin(aluno.id, atividade, origem);
    registrarUltimo(r.aluno, r.novo);
    if (r.novo && !inscritoEm(r.aluno, atividade)) UI.aviso(`${r.aluno.nome} não se inscreveu nesta atividade. Presença registrada mesmo assim.`, "alerta");
    else UI.aviso(r.novo ? `Presença confirmada: ${r.aluno.nome}` : `${r.aluno.nome} já estava presente.`, r.novo ? "sucesso" : "info");
    bipe(r.novo);
    frequencias = await API.listarFrequencias();
    desenharChamada(); desenharInscritos(); await desenharCertificados();
  }

  $("cpf-rapido").addEventListener("input", (e) => (e.target.value = C.mascaraCPF(e.target.value)));
  $("form-cpf-rapido").addEventListener("submit", async (e) => {
    e.preventDefault();
    const cpf = $("cpf-rapido").value;
    if (!C.validarCPF(cpf)) { UI.aviso("CPF inválido.", "erro"); bipe(false); return; }
    const aluno = await API.buscarAlunoPorCPF(cpf);
    if (!aluno) { UI.aviso("CPF não inscrito na Jornada.", "erro"); bipe(false); return; }
    try { await checkinAluno(aluno, "cpf"); $("cpf-rapido").value = ""; } catch (err) { UI.aviso(err.message, "erro"); }
  });

  function bipe(ok) {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.value = ok ? 880 : 220; g.gain.value = 0.08;
      o.connect(g); g.connect(ctx.destination); o.start(); o.stop(ctx.currentTime + (ok ? 0.12 : 0.3));
    } catch (_) { /* sem áudio */ }
  }

  /* ---------------- Leitor de QR Code ---------------- */
  let leitor = null, ultimaLeitura = { texto: "", em: 0 };
  async function pararCamera() {
    if (leitor) { try { await leitor.stop(); leitor.clear(); } catch (_) {} leitor = null; }
    $("btn-camera").innerHTML = '<i class="bi bi-camera me-1"></i>Abrir câmera';
  }
  $("btn-camera").addEventListener("click", async () => {
    if (leitor) { pararCamera(); return; }
    if (!window.Html5Qrcode) { UI.aviso("Leitor de QR Code indisponível neste navegador.", "erro"); return; }
    leitor = new Html5Qrcode("leitor");
    try {
      await leitor.start({ facingMode: "environment" }, { fps: 10, qrbox: { width: 230, height: 230 } }, async (texto) => {
        if (texto === ultimaLeitura.texto && Date.now() - ultimaLeitura.em < 3000) return; // mesma leitura em sequência
        ultimaLeitura = { texto, em: Date.now() };
        try { await checkinAluno(await API.validarIngresso(texto), "qrcode"); }
        catch (err) { UI.aviso(err.message, "erro"); bipe(false); }
      });
      $("btn-camera").innerHTML = '<i class="bi bi-stop-circle me-1"></i>Fechar câmera';
    } catch (err) {
      leitor = null;
      UI.aviso("Não foi possível abrir a câmera. Verifique a permissão ou use o check-in por CPF.", "erro");
    }
  });

  /* ---------------- Inscritos ---------------- */
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
    const cert = await API.salvarCertificado(aluno, situacaoDe(aluno).horas);
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
        const cert = await API.salvarCertificado(aluno, situacaoDe(aluno).horas);
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
    UI.carregando(e.currentTarget, true, "Criando...");
    try { await API.popularDemo(); await recarregar(); UI.aviso("Dados de demonstração criados.", "sucesso"); }
    catch (err) { UI.aviso(err.message, "erro"); }
    finally { UI.carregando(e.currentTarget, false); }
  });

  $("btn-limpar").addEventListener("click", async () => {
    if (!(await UI.confirmar("Isso apaga todos os inscritos, presenças e certificados deste navegador.", { titulo: "Apagar todos os dados", botao: "Apagar tudo", perigo: true, exigirTexto: "APAGAR" }))) return;
    try { await API.limparTudo(); await recarregar(); UI.aviso("Dados apagados.", "sucesso"); }
    catch (err) { UI.aviso(err.message, "erro"); }
  });

  if (sessaoValida()) abrirPainel();
})();
