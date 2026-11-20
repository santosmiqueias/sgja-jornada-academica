/* Painel da organização: Check-in por QR Code e Chamada (presença registrada como "Organização"). */
(function () {
  "use strict";
  const C = window.SGJACore, API = window.SGJA_API, UI = window.SGJA_UI, CFG = window.SGJA_CONFIG;
  const $ = (id) => document.getElementById(id);
  const esc = C.escaparHTML;
  if (!$("aba-checkin")) return;

  // Atividades nas duas listas (a de hoje primeiro selecionada, se houver)
  const hoje = new Date().toISOString().slice(0, 10);
  const opcoes = CFG.eventos.map((e) => `<option value="${esc(e.id)}">${esc(e.titulo)} · ${UI.formatarData(e.data)} ${esc(String(e.horario).split(/[–-]/)[0].trim())}</option>`).join("");
  ["ck-atividade", "ch-atividade"].forEach((id) => { $(id).innerHTML = opcoes; const ev = CFG.eventos.find((e) => e.data === hoje); if (ev) $(id).value = ev.id; });

  let dados = { alunos: [], frequencias: [] };
  const fmtDia = (iso) => { const d = new Date(iso); return isNaN(d) ? "—" : d.toLocaleDateString("pt-BR"); };
  const fmtHora = (iso) => { const d = new Date(iso); return isNaN(d) ? "—" : d.toLocaleTimeString("pt-BR"); };

  async function carregar(eventoId) {
    try { dados = await API.chamadaOrg(eventoId); }
    catch (err) { if (err.status === 401) { API.sairProfessor(); location.reload(); return; } UI.aviso(err.message || "Não foi possível carregar a chamada.", "erro"); }
  }

  /* ---------------- Check-in por QR Code ---------------- */
  async function atualizarCheckin() {
    await carregar($("ck-atividade").value);
    const porId = Object.fromEntries(dados.alunos.map((a) => [a.id, a]));
    const lista = dados.frequencias.slice().sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)));
    $("ck-total").textContent = lista.length;
    $("ck-contador").textContent = `${lista.length} presença(s) nesta atividade`;
    $("ck-lista").innerHTML = lista.length ? lista.map((f) => {
      const a = porId[f.alunoId] || { nome: "—" };
      return `<tr><td class="fw-semibold">${esc(a.nome)}</td><td>${fmtDia(f.timestamp)}</td><td>${fmtHora(f.timestamp)}</td>
        <td><span class="badge badge-ok">Presente</span></td><td class="text-muted">${esc(f.registradoPorNome || "—")}</td></tr>`;
    }).join("") : `<tr><td colspan="5" class="text-center text-muted py-4">Nenhuma presença nesta atividade ainda.</td></tr>`;
  }

  function bipe(ok) {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.value = ok ? 880 : 220; g.gain.value = 0.08;
      o.connect(g); g.connect(ctx.destination); o.start(); o.stop(ctx.currentTime + (ok ? 0.12 : 0.3));
    } catch (_) { /* sem áudio */ }
  }

  async function registrar(d) {
    const r = await API.checkinOrg({ ...d, eventoId: $("ck-atividade").value });
    UI.aviso(r.novo ? `Presença confirmada: ${r.aluno.nome}` : `${r.aluno.nome} já estava presente.`, r.novo ? "sucesso" : "info");
    bipe(r.novo);
    await atualizarCheckin();
    return r;
  }

  $("ck-cpf").addEventListener("input", (e) => { e.target.value = C.mascaraCPF(e.target.value); e.target.classList.remove("is-invalid"); });
  $("ck-form-cpf").addEventListener("submit", async (e) => {
    e.preventDefault();
    const cpf = $("ck-cpf").value;
    if (!C.validarCPF(cpf)) { $("ck-cpf").classList.add("is-invalid"); UI.aviso("CPF inválido.", "erro"); bipe(false); $("ck-cpf").focus(); return; }
    UI.carregando($("ck-registrar"), true, "Registrando...");
    try { await registrar({ cpf }); $("ck-cpf").value = ""; }
    catch (err) { UI.aviso(err.message || "Não foi possível registrar.", "erro"); bipe(false); }
    finally { UI.carregando($("ck-registrar"), false); $("ck-cpf").focus(); }
  });

  // Câmera: fecha sozinha depois de registrar uma leitura
  let leitor = null, ocupado = false;
  async function fecharCamera() {
    if (leitor) { try { await leitor.stop(); leitor.clear(); } catch (_) {} leitor = null; }
    $("ck-camera").innerHTML = '<i class="bi bi-camera me-1" aria-hidden="true"></i>Ler QR Code com a câmera';
  }
  $("ck-camera").addEventListener("click", async () => {
    if (leitor) { fecharCamera(); return; }
    if (!window.Html5Qrcode) { UI.aviso("Leitor de QR Code indisponível neste navegador. Use o CPF.", "erro"); return; }
    leitor = new Html5Qrcode("ck-leitor");
    try {
      await leitor.start({ facingMode: "environment" }, { fps: 10, qrbox: { width: 230, height: 230 } }, async (texto) => {
        if (ocupado) return;
        ocupado = true;
        try { await registrar({ qr: texto }); await fecharCamera(); }
        catch (err) { UI.aviso(err.message || "QR Code inválido.", "erro"); bipe(false); }
        finally { setTimeout(() => { ocupado = false; }, 1500); }
      });
      $("ck-camera").innerHTML = '<i class="bi bi-stop-circle me-1" aria-hidden="true"></i>Fechar câmera';
    } catch (_) {
      leitor = null;
      UI.aviso("Não foi possível abrir a câmera. Verifique a permissão ou use o CPF.", "erro");
    }
  });
  $("ck-atividade").addEventListener("change", atualizarCheckin);

  /* ---------------- Chamada ---------------- */
  async function atualizarChamada() {
    await carregar($("ch-atividade").value);
    desenharChamada();
  }
  function desenharChamada() {
    const presentes = Object.fromEntries(dados.frequencias.map((f) => [f.alunoId, f]));
    const termo = $("ch-busca").value.trim().toLowerCase();
    const dig = C.soDigitos(termo);
    const lista = dados.alunos.filter((a) => !termo || a.nome.toLowerCase().includes(termo) || (dig && String(a.cpfMascarado).replace(/\D/g, "").includes(dig)));
    $("ch-lista").innerHTML = lista.length ? lista.map((a) => {
      const f = presentes[a.id];
      return `<tr class="${f ? "presente" : ""}"><td><input class="form-check-input" type="checkbox" data-aluno="${esc(a.id)}" ${f ? "checked" : ""} aria-label="Presença de ${esc(a.nome)}"></td>
        <td class="fw-semibold">${esc(a.nome)}</td><td class="d-none d-md-table-cell small">${esc(a.curso) || "—"}</td><td class="small">${esc(a.cpfMascarado)}</td>
        <td class="d-none d-lg-table-cell small text-muted">${f ? esc(f.registradoPorNome || "—") : ""}</td></tr>`;
    }).join("") : `<tr><td colspan="5" class="text-center text-muted py-4">Ninguém encontrado.</td></tr>`;
  }
  $("ch-lista").addEventListener("change", async (e) => {
    const cb = e.target.closest("[data-aluno]");
    if (!cb) return;
    cb.disabled = true;
    try {
      if (cb.checked) await API.checkinOrg({ alunoId: cb.dataset.aluno, eventoId: $("ch-atividade").value, origem: "lista" });
      else await API.removerCheckinOrg(cb.dataset.aluno, $("ch-atividade").value);
      await atualizarChamada();
    } catch (err) { cb.checked = !cb.checked; cb.disabled = false; UI.aviso(err.message || "Não foi possível salvar.", "erro"); }
  });
  $("ch-atividade").addEventListener("change", atualizarChamada);
  $("ch-busca").addEventListener("input", desenharChamada);

  // Carrega quando a área é aberta; a câmera fecha ao sair do check-in
  document.querySelector('[data-bs-target="#aba-checkin"]').addEventListener("shown.bs.tab", atualizarCheckin);
  document.querySelector('[data-bs-target="#aba-chamada"]').addEventListener("shown.bs.tab", atualizarChamada);
  document.querySelectorAll(".painel-lateral [data-bs-toggle=pill]").forEach((b) => b.addEventListener("shown.bs.tab", () => {
    if (b.getAttribute("data-bs-target") !== "#aba-checkin") fecharCamera();
  }));
})();
