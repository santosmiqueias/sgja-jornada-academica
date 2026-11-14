/* Submissão de trabalhos (edital, itens 1 e 2): trabalho, arquivo, representante e participantes. */
(function () {
  "use strict";
  const C = window.SGJACore, API = window.SGJA_API, UI = window.SGJA_UI, CFG = window.SGJA_CONFIG;
  const SUB = CFG.submissao;
  const $ = (id) => document.getElementById(id);
  const esc = C.escaparHTML;

  // Edital para visualizar e baixar
  $("link-edital-ver").href = SUB.edital;
  $("link-edital-baixar").href = SUB.edital;

  // Listas
  SUB.vinculos.forEach((v) => $("vinculo").add(new Option(v.nome, v.id)));
  CFG.cursos.forEach((c) => $("curso").add(new Option(c, c)));

  // Formato obrigatório conforme o vínculo (APIExt I, III, V: banner; II, IV, VI: oral)
  function atualizarModalidade() {
    const v = SUB.vinculos.find((x) => x.id === $("vinculo").value);
    const radios = document.querySelectorAll('input[name="modalidade"]');
    if (v && v.modalidade) {
      radios.forEach((r) => { r.checked = r.value === v.modalidade; r.disabled = r.value !== v.modalidade; });
      $("dica-modalidade").textContent = `Para ${v.nome}, o formato é obrigatório: ${SUB.modalidades[v.modalidade]}.`;
    } else {
      radios.forEach((r) => { r.disabled = false; });
      $("dica-modalidade").textContent = v ? "Escolha o formato que prefere." : "";
    }
    $("modalidade").classList.remove("is-invalid");
  }
  $("vinculo").addEventListener("change", atualizarModalidade);
  document.querySelectorAll('input[name="modalidade"]').forEach((r) => r.addEventListener("change", () => $("modalidade").classList.remove("is-invalid")));

  // Contador do resumo
  function contar() {
    const n = $("resumo").value.trim().length;
    const el = $("contador-resumo");
    el.textContent = `${n} / ${SUB.maxCaracteresResumo}`;
    el.classList.toggle("text-danger", n > SUB.maxCaracteresResumo);
    return n;
  }
  $("resumo").addEventListener("input", () => { contar(); if ($("resumo").classList.contains("is-invalid")) validar("resumo"); });
  contar();

  // Arquivo: tipo e tamanho
  const extensao = (nome) => String(nome || "").split(".").pop().toLowerCase();
  const tamanhoTexto = (b) => (b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
  $("arquivo").addEventListener("change", () => {
    const f = $("arquivo").files[0];
    $("info-arquivo").textContent = f ? `${f.name} · ${tamanhoTexto(f.size)}` : "PDF, DOC ou DOCX, até 10 MB.";
    validar("arquivo");
  });

  // Máscaras do representante
  $("r-cpf").addEventListener("input", (e) => (e.target.value = C.mascaraCPF(e.target.value)));
  $("r-telefone").addEventListener("input", (e) => (e.target.value = C.mascaraTelefone(e.target.value)));
  $("r-matricula").addEventListener("input", (e) => (e.target.value = C.mascaraMatricula(e.target.value)));
  $("r-nome").addEventListener("input", (e) => { const l = e.target.value.replace(/[^A-Za-zÀ-ÖØ-öø-ÿ' -]/g, ""); if (l !== e.target.value) e.target.value = l; });

  // Orientadores (obrigatório pelo menos 1; disciplinas com mais de um professor adicionam outros)
  const MAX_ORIENTADORES = SUB.maxOrientadores || 5;
  const soLetras = (e) => { const l = e.target.value.replace(/[^A-Za-zÀ-ÖØ-öø-ÿ'. -]/g, ""); if (l !== e.target.value) e.target.value = l; };
  const nomeOrientadorOk = (v) => C.validarNome(String(v).replace(/^(prof(ª|a|essora|essor)?\.?\s+)?(dr(ª|a)?\.?\s+|me\.?\s+|ma\.?\s+|esp\.?\s+)?/i, ""));
  let seqOri = 1;
  function ligarOrientador(input) {
    input.addEventListener("input", (e) => { soLetras(e); if (input.classList.contains("is-invalid") && nomeOrientadorOk(input.value)) input.classList.remove("is-invalid"); });
    input.addEventListener("blur", () => { if (input.value) input.classList.toggle("is-invalid", !nomeOrientadorOk(input.value)); });
  }
  ligarOrientador($("orientador-0"));
  $("btn-add-orientador").addEventListener("click", () => {
    if (document.querySelectorAll(".orientador").length >= MAX_ORIENTADORES) { UI.aviso(`No máximo ${MAX_ORIENTADORES} orientadores.`, "alerta"); return; }
    const n = seqOri++;
    const el = document.createElement("div");
    el.className = "orientador input-group has-validation";
    el.innerHTML = `<input type="text" class="form-control o-nome" id="orientador-${n}" maxlength="100" autocomplete="off" aria-label="Outro professor orientador">
      <button type="button" class="btn btn-outline-danger" aria-label="Remover orientador"><i class="bi bi-x-lg" aria-hidden="true"></i></button>
      <div class="invalid-feedback">Informe nome e sobrenome do orientador.</div>`;
    el.querySelector("button").addEventListener("click", () => el.remove());
    ligarOrientador(el.querySelector("input"));
    $("lista-orientadores").appendChild(el);
    el.querySelector("input").focus();
  });
  function lerOrientadores() {
    let ok = true;
    const nomes = [...document.querySelectorAll(".o-nome")].map((i, idx) => {
      const vazio = !i.value.trim();
      if (vazio && idx > 0) { i.classList.remove("is-invalid"); return ""; } // extra em branco é ignorado
      const valido = nomeOrientadorOk(i.value);
      i.classList.toggle("is-invalid", !valido);
      if (!valido) ok = false;
      return i.value.trim();
    }).filter(Boolean);
    return { ok: ok && nomes.length > 0, nomes };
  }

  // Demais participantes
  let seq = 0;
  function adicionarParticipante() {
    const total = document.querySelectorAll(".participante").length;
    if (total + 1 >= SUB.maxParticipantes) { UI.aviso(`No máximo ${SUB.maxParticipantes} participantes por trabalho (contando o representante).`, "alerta"); return; }
    const n = seq++;
    const el = document.createElement("div");
    el.className = "participante card p-3";
    el.innerHTML = `
      <div class="d-flex justify-content-between align-items-center mb-2">
        <strong class="small titulo-participante"></strong>
        <button type="button" class="btn btn-sm btn-outline-danger btn-remover" aria-label="Remover participante"><i class="bi bi-x-lg" aria-hidden="true"></i></button>
      </div>
      <div class="row g-2">
        <div class="col-md-5"><label class="form-label small" for="p-nome-${n}">Nome completo</label><input class="form-control p-nome" id="p-nome-${n}" maxlength="100" autocomplete="off"><div class="invalid-feedback">Nome e sobrenome.</div></div>
        <div class="col-md-3"><label class="form-label small" for="p-cpf-${n}">CPF</label><input class="form-control p-cpf" id="p-cpf-${n}" inputmode="numeric" autocomplete="off"><div class="invalid-feedback">CPF inválido.</div></div>
        <div class="col-md-4"><label class="form-label small" for="p-email-${n}">E-mail</label><input type="email" class="form-control p-email" id="p-email-${n}" maxlength="120" autocomplete="off"><div class="invalid-feedback">E-mail inválido.</div></div>
      </div>`;
    el.querySelector(".p-cpf").addEventListener("input", (e) => (e.target.value = C.mascaraCPF(e.target.value)));
    el.querySelector(".p-nome").addEventListener("input", (e) => { const l = e.target.value.replace(/[^A-Za-zÀ-ÖØ-öø-ÿ' -]/g, ""); if (l !== e.target.value) e.target.value = l; });
    el.querySelector(".btn-remover").addEventListener("click", () => { el.remove(); numerar(); });
    $("lista-participantes").appendChild(el);
    numerar();
    el.querySelector(".p-nome").focus();
  }
  function numerar() {
    document.querySelectorAll(".participante").forEach((p, i) => { p.querySelector(".titulo-participante").textContent = `Participante ${i + 2}`; });
  }
  $("btn-add-participante").addEventListener("click", adicionarParticipante);

  // Validação na tela (o servidor valida tudo de novo)
  const regras = {
    titulo: () => $("titulo").value.trim().length >= 5,
    vinculo: () => SUB.vinculos.some((v) => v.id === $("vinculo").value),
    curso: () => CFG.cursos.includes($("curso").value),
    resumo: () => { const n = contar(); return n >= SUB.minCaracteresResumo && n <= SUB.maxCaracteresResumo; },
    arquivo: () => { const f = $("arquivo").files[0]; return !!f && SUB.arquivo.extensoes.includes(extensao(f.name)) && f.size > 0 && f.size <= SUB.arquivo.maxMB * 1048576; },
    "r-nome": () => C.validarNome($("r-nome").value),
    "r-email": () => C.validarEmail($("r-email").value),
    "r-telefone": () => C.validarTelefone($("r-telefone").value),
    "r-cpf": () => C.validarCPF($("r-cpf").value),
    "r-matricula": () => !$("r-matricula").value || C.validarMatricula($("r-matricula").value)
  };
  function validar(id) {
    const ok = regras[id]();
    $(id).classList.toggle("is-invalid", !ok);
    return ok;
  }
  Object.keys(regras).forEach((id) => {
    // Erro some enquanto a pessoa corrige (no "input"), e não no próximo clique: assim o formulário
    // não muda de altura no meio de um clique em outro campo.
    $(id).addEventListener("input", () => { if ($(id).classList.contains("is-invalid") && regras[id]()) $(id).classList.remove("is-invalid"); });
    $(id).addEventListener("blur", () => { if ($(id).value) validar(id); });
    $(id).addEventListener("change", () => { if ($(id).classList.contains("is-invalid")) validar(id); });
  });
  $("lgpd").addEventListener("change", (e) => e.target.classList.toggle("is-invalid", !e.target.checked));

  function lerParticipantes() {
    let ok = true;
    const lista = [...document.querySelectorAll(".participante")].map((p) => {
      const nome = p.querySelector(".p-nome"), cpf = p.querySelector(".p-cpf"), email = p.querySelector(".p-email");
      [[nome, C.validarNome(nome.value)], [cpf, C.validarCPF(cpf.value)], [email, C.validarEmail(email.value)]].forEach(([el, v]) => { el.classList.toggle("is-invalid", !v); if (!v) ok = false; });
      return { nome: nome.value, cpf: cpf.value, email: email.value };
    });
    return { ok, lista };
  }

  function mostrarErroServidor(err) {
    const msgParticipantes = $("erro-participantes");
    msgParticipantes.hidden = true;
    if (err.campo && /^p-(nome|cpf|email)-(\d+)$/.test(err.campo)) {
      const [, tipo, idx] = err.campo.match(/^p-(nome|cpf|email)-(\d+)$/);
      const p = document.querySelectorAll(".participante")[Number(idx)];
      const el = p && p.querySelector(`.p-${tipo}`);
      if (el) { el.classList.add("is-invalid"); el.focus(); }
    } else if (err.campo === "participantes") {
      msgParticipantes.textContent = err.message; msgParticipantes.hidden = false;
    } else if (err.campo === "orientadores") {
      document.querySelectorAll(".o-nome").forEach((i) => { if (!i.value.trim() || !nomeOrientadorOk(i.value)) i.classList.add("is-invalid"); });
      $("orientador-0").focus();
    } else if (err.campo === "modalidade") {
      $("modalidade").classList.add("is-invalid");
    } else if (err.campo && $(err.campo)) {
      $(err.campo).classList.add("is-invalid");
      const fb = $(err.campo).parentElement.querySelector(".invalid-feedback");
      if (fb) fb.textContent = err.message;
      $(err.campo).focus();
    }
    UI.aviso(err.message || "Não foi possível enviar agora.", "erro");
  }

  let enviando = false;
  $("form-submissao").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (enviando || $("site").value) return;
    const invalidos = Object.keys(regras).filter((id) => !validar(id));
    const modalidade = (document.querySelector('input[name="modalidade"]:checked') || {}).value;
    $("modalidade").classList.toggle("is-invalid", !modalidade);
    const part = lerParticipantes();
    const ori = lerOrientadores();
    const lgpd = $("lgpd").checked;
    $("lgpd").classList.toggle("is-invalid", !lgpd);
    if (invalidos.length || !modalidade || !part.ok || !ori.ok || !lgpd) {
      UI.aviso("Confira os campos destacados em vermelho.", "erro");
      const primeiro = document.querySelector("#form-submissao .is-invalid");
      if (primeiro) primeiro.focus();
      return;
    }
    enviando = true;
    UI.carregando($("btn-enviar"), true, "Enviando trabalho...");
    try {
      const r = await API.submeterTrabalho({
        titulo: $("titulo").value, vinculo: $("vinculo").value, modalidade, curso: $("curso").value,
        orientadores: ori.nomes, resumo: $("resumo").value,
        representante: { nome: $("r-nome").value, email: $("r-email").value, telefone: $("r-telefone").value, cpf: $("r-cpf").value, matricula: $("r-matricula").value },
        participantes: part.lista, consentimentoLGPD: lgpd, aceitaWhatsApp: $("whatsapp").checked
      }, $("arquivo").files[0]);
      mostrarSucesso(r);
      UI.aviso("Trabalho enviado para a banca!", "sucesso");
    } catch (err) {
      if (err instanceof API.ErroNegocio) mostrarErroServidor(err);
      else { console.error(err); UI.aviso("Não foi possível enviar agora. Tente de novo em instantes.", "erro"); }
    } finally {
      enviando = false;
      UI.carregando($("btn-enviar"), false);
    }
  });

  function mostrarSucesso(r) {
    $("suc-protocolo").textContent = r.trabalho.protocolo;
    $("suc-titulo").textContent = r.trabalho.titulo;
    const qr = UI.qrDataURL(r.representante.tokenIngresso, 400);
    $("qr-ingresso").src = qr; $("btn-baixar-qr").href = qr;
    $("ing-nome").textContent = r.representante.nome;
    $("ing-cpf").textContent = C.mascararCPFParaExibicao(r.representante.cpf);
    $("cartao-form").classList.add("d-none");
    $("cartao-edital").classList.add("d-none");
    const card = $("cartao-sucesso");
    card.classList.remove("d-none");
    card.style.pointerEvents = "none"; // o 2º clique de um clique duplo não aciona os botões
    setTimeout(() => { card.style.pointerEvents = ""; }, 800);
    card.focus();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
})();
