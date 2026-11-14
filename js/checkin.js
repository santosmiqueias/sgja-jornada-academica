/* Check-in da comissão organizadora: cadastro, login individual e registro de presença. */
(function () {
  "use strict";
  const C = window.SGJACore, API = window.SGJA_API, UI = window.SGJA_UI, CFG = window.SGJA_CONFIG;
  const $ = (id) => document.getElementById(id);
  const esc = C.escaparHTML;

  /* ---------------- Sessão individual ---------------- */
  const CHAVE_TENTATIVAS = "sgja_tentativas_comissao";
  let membro = null; // { id, nome } de quem está usando

  const ler = (k, padrao) => { try { return JSON.parse(sessionStorage.getItem(k) || "null") || padrao; } catch (_) { return padrao; } };
  const gravar = (k, v) => { try { sessionStorage.setItem(k, JSON.stringify(v)); } catch (_) {} };
  const apagar = (k) => { try { sessionStorage.removeItem(k); } catch (_) {} };

  function sair(mensagem) {
    API.sairComissao();
    pararCamera();
    membro = null;
    $("tela-checkin").classList.add("d-none");
    $("tela-acesso").classList.remove("d-none");
    $("btn-sair").classList.add("d-none");
    $("subtitulo").textContent = "Área da comissão organizadora";
    $("tb-chamada").innerHTML = "";
    if (mensagem) $("erro-entrar").textContent = mensagem;
  }

  // Sessão expirada ou acesso bloqueado pelo professor: o servidor recusa (401/403) e a página desconecta.
  function tratarErro(err) {
    if (err && (err.status === 401 || err.status === 403)) { sair(err.message); return; }
    if (membro) UI.aviso((err && err.message) || "Erro ao registrar presença.", "erro");
  }

  $("form-entrar").addEventListener("submit", async (e) => {
    e.preventDefault();
    const t = ler(CHAVE_TENTATIVAS, { n: 0, ate: 0 });
    if (t.ate > Date.now()) { $("erro-entrar").textContent = `Muitas tentativas. Aguarde ${Math.ceil((t.ate - Date.now()) / 1000)}s.`; return; }
    UI.carregando($("btn-entrar"), true, "Entrando...");
    try {
      const m = await API.entrarComissao($("e-email").value, $("e-senha").value);
      apagar(CHAVE_TENTATIVAS);
      $("e-senha").value = ""; $("erro-entrar").textContent = "";
      abrir({ id: m.id, nome: m.nome });
    } catch (err) {
      if (!(err instanceof API.ErroNegocio)) { console.error(err); $("erro-entrar").textContent = "Não foi possível entrar agora."; return; }
      if (err.status === 401) {
        t.n += 1;
        if (t.n >= 5) { t.ate = Date.now() + 60000; t.n = 0; }
        gravar(CHAVE_TENTATIVAS, t);
      }
      $("erro-entrar").textContent = t.ate > Date.now() ? "Muitas tentativas. Acesso bloqueado por 60 segundos." : err.message;
    } finally { UI.carregando($("btn-entrar"), false); }
  });

  /* ---------------- Cadastro ---------------- */
  $("m-cpf").addEventListener("input", (e) => (e.target.value = C.mascaraCPF(e.target.value)));
  $("m-telefone").addEventListener("input", (e) => (e.target.value = C.mascaraTelefone(e.target.value)));

  $("form-cadastro").addEventListener("submit", async (e) => {
    e.preventDefault();
    const campos = {
      "m-nome": C.validarNome($("m-nome").value), "m-email": C.validarEmail($("m-email").value),
      "m-cpf": C.validarCPF($("m-cpf").value), "m-telefone": C.validarTelefone($("m-telefone").value),
      "m-senha": C.validarSenha($("m-senha").value), "m-senha2": $("m-senha2").value === $("m-senha").value && !!$("m-senha2").value
    };
    Object.entries(campos).forEach(([id, ok]) => $(id).classList.toggle("is-invalid", !ok));
    const primeiro = Object.keys(campos).find((id) => !campos[id]);
    if (primeiro) { $(primeiro).focus(); return; }
    UI.carregando($("btn-cadastrar"), true, "Enviando...");
    try {
      await API.cadastrarMembro({ nome: $("m-nome").value, email: $("m-email").value, cpf: $("m-cpf").value, telefone: $("m-telefone").value, senha: $("m-senha").value });
      $("form-cadastro").classList.add("d-none");
      $("cadastro-ok").classList.remove("d-none");
    } catch (err) {
      if (err instanceof API.ErroNegocio && err.campo && $(err.campo)) {
        $(err.campo).classList.add("is-invalid");
        $(err.campo).parentElement.querySelector(".invalid-feedback").textContent = err.message;
        $(err.campo).focus();
      }
      UI.aviso(err instanceof API.ErroNegocio ? err.message : "Não foi possível enviar o cadastro agora.", "erro");
    } finally { UI.carregando($("btn-cadastrar"), false); }
  });

  $("btn-sair").addEventListener("click", () => sair());

  /* ---------------- Estado da chamada ---------------- */
  let alunos = [], frequencias = [];
  let atividade = null;
  const ultimos = [];

  async function recarregar() {
    if (!membro) return;
    try {
      const r = await API.chamada(atividade);
      alunos = r.alunos; frequencias = r.frequencias;
      desenharChamada();
    } catch (err) { tratarErro(err); }
  }

  function abrir(m) {
    membro = m;
    $("tela-acesso").classList.add("d-none");
    $("tela-checkin").classList.remove("d-none");
    $("btn-sair").classList.remove("d-none");
    $("subtitulo").textContent = `Comissão organizadora · ${m.nome}`;
    if (!$("sel-atividade").options.length) montarSeletor();
    recarregar();
  }

  window.addEventListener("storage", (e) => { if (membro && e.key && e.key.startsWith("sgja_v1_")) recarregar(); });
  if (API.backend === "servidor") setInterval(() => { if (membro) recarregar(); }, 15000);

  function montarSeletor() {
    const sel = $("sel-atividade");
    const agora = new Date();
    let sugerida = API.eventos()[0].id;
    API.eventos().forEach((ev) => {
      sel.add(new Option(`${UI.formatarData(ev.data)} · ${ev.horario} — ${ev.titulo}`, ev.id));
      if (C.inicioEvento(ev, CFG.evento.fusoHorario) <= agora) sugerida = ev.id; // última atividade já iniciada
    });
    sel.value = sugerida;
    atividade = sugerida;
    sel.addEventListener("change", () => { atividade = sel.value; recarregar(); });
  }

  const freqDaAtividade = () => new Map(frequencias.filter((f) => f.eventoId === atividade).map((f) => [f.alunoId, f]));
  const inscritoEm = (a, eventoId) => Array.isArray(a.atividades) && a.atividades.includes(eventoId);

  function filtrarAlunos(texto) {
    const t = texto.trim().toLowerCase();
    const d = C.soDigitos(t);
    if (!t) return alunos;
    return alunos.filter((a) => a.nome.toLowerCase().includes(t) || (d && a.matricula.includes(d)));
  }

  function desenharChamada() {
    const presentes = freqDaAtividade();
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
      const f = presentes.get(a.id);
      const extra = inscritoEm(a, atividade) ? ' <span class="badge badge-ok" title="Apresenta trabalho nesta sessão">apresenta</span>' : "";
      const por = f ? esc(f.registradoPorNome || "—") : "";
      return `<tr class="${f ? "presente" : ""}">
        <td><input class="form-check-input chk-presenca" type="checkbox" data-id="${esc(a.id)}" ${f ? "checked" : ""} aria-label="Presença de ${esc(a.nome)}"></td>
        <td><div class="fw-semibold">${esc(a.nome)}${extra}</div><div class="small text-muted">CPF ${esc(a.cpfMascarado)}</div></td>
        <td class="d-none d-md-table-cell small">${esc(a.curso)}</td>
        <td class="d-none d-sm-table-cell small">${esc(a.matricula)}</td>
        <td class="d-none d-lg-table-cell small text-muted">${por}</td></tr>`;
    }).join("") : `<tr><td colspan="5" class="text-center text-muted py-4">${alunos.length ? "Nenhum aluno nesta lista." : "Nenhum inscrito ainda."}</td></tr>`;
    $("info-chamada").textContent = `${lista.length} aluno(s) na lista`;
  }

  $("busca-chamada").addEventListener("input", desenharChamada);
  $("filtro-chamada").addEventListener("change", desenharChamada);

  $("tb-chamada").addEventListener("change", async (e) => {
    if (!e.target.classList.contains("chk-presenca")) return;
    const caixa = e.target, id = caixa.dataset.id;
    caixa.disabled = true;
    try {
      if (caixa.checked) { const r = await API.checkin({ alunoId: id, eventoId: atividade, origem: "lista" }); registrarUltimo(r.aluno, r.novo); }
      else await API.removerCheckin(id, atividade);
      await recarregar();
    } catch (err) {
      caixa.checked = !caixa.checked;
      tratarErro(err);
    } finally { caixa.disabled = false; }
  });

  $("btn-marcar-todos").addEventListener("click", async (e) => {
    const botao = e.currentTarget;
    const presentes = freqDaAtividade();
    const ids = [...document.querySelectorAll(".chk-presenca")].map((c) => c.dataset.id).filter((id) => !presentes.has(id));
    if (!ids.length) { UI.aviso("Todos os alunos visíveis já estão presentes.", "info"); return; }
    if (!(await UI.confirmar(`Registrar presença de ${ids.length} aluno(s) nesta atividade?`, { titulo: "Confirmar presenças", botao: "Registrar presenças" }))) return;
    UI.carregando(botao, true, "Registrando...");
    try {
      for (const id of ids) await API.checkin({ alunoId: id, eventoId: atividade, origem: "lote" });
      await recarregar();
      UI.aviso(`${ids.length} presença(s) registradas.`, "sucesso");
    } catch (err) { tratarErro(err); }
    finally { UI.carregando(botao, false); }
  });

  function registrarUltimo(aluno, novo) {
    ultimos.unshift({ nome: aluno.nome, novo, hora: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) });
    ultimos.splice(8);
    $("ultimos").innerHTML = ultimos.map((u) =>
      `<li class="mb-1"><i class="bi ${u.novo ? "bi-check-circle-fill text-success" : "bi-info-circle text-primary"} me-1"></i><strong>${esc(u.nome)}</strong> <span class="text-muted">· ${u.hora}${u.novo ? "" : " · já estava presente"}</span></li>`).join("");
  }

  async function confirmar(dados) {
    const r = await API.checkin({ ...dados, eventoId: atividade });
    registrarUltimo(r.aluno, r.novo);
    UI.aviso(r.novo ? `Presença confirmada: ${r.aluno.nome}` : `${r.aluno.nome} já estava presente.`, r.novo ? "sucesso" : "info");
    bipe(r.novo);
    await recarregar();
  }

  $("cpf-rapido").addEventListener("input", (e) => (e.target.value = C.mascaraCPF(e.target.value)));
  $("form-cpf-rapido").addEventListener("submit", async (e) => {
    e.preventDefault();
    const cpf = $("cpf-rapido").value;
    if (!C.validarCPF(cpf)) { UI.aviso("CPF inválido.", "erro"); bipe(false); return; }
    try { await confirmar({ cpf }); $("cpf-rapido").value = ""; } catch (err) { tratarErro(err); bipe(false); }
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
    if (!window.Html5Qrcode) { UI.aviso("Leitor de QR Code indisponível neste navegador. Use o check-in por CPF.", "erro"); return; }
    leitor = new Html5Qrcode("leitor");
    try {
      await leitor.start({ facingMode: "environment" }, { fps: 10, qrbox: { width: 230, height: 230 } }, async (texto) => {
        if (texto === ultimaLeitura.texto && Date.now() - ultimaLeitura.em < 3000) return; // mesma leitura em sequência
        ultimaLeitura = { texto, em: Date.now() };
        try { await confirmar({ qr: texto }); }
        catch (err) { tratarErro(err); bipe(false); }
      });
      $("btn-camera").innerHTML = '<i class="bi bi-stop-circle me-1"></i>Fechar câmera';
    } catch (err) {
      leitor = null;
      UI.aviso("Não foi possível abrir a câmera. Verifique a permissão ou use o check-in por CPF.", "erro");
    }
  });

  /* ---------------- Retomar sessão aberta ---------------- */
  const aberta = API.sessaoComissao();
  if (aberta) abrir({ id: aberta.id, nome: aberta.nome });
})();
