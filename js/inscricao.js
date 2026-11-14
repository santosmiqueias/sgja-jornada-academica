/* Tela de inscrição: máscaras, validação campo a campo e envio protegido. */
(function () {
  "use strict";
  const C = window.SGJACore, API = window.SGJA_API, UI = window.SGJA_UI, CFG = window.SGJA_CONFIG;
  const form = document.getElementById("form-inscricao");
  const btn = document.getElementById("btn-enviar");
  const $ = (id) => document.getElementById(id);

  const selectCurso = $("curso");
  CFG.cursos.forEach((c) => selectCurso.add(new Option(c, c)));

  // Lista de atividades para o aluno escolher.
  $("lista-atividades").innerHTML = API.eventos().map((ev) => `
    <div class="col-md-6">
      <label class="opcao-atividade">
        <input class="form-check-input chk-atividade" type="checkbox" value="${C.escaparHTML(ev.id)}">
        <span>
          <span class="fw-semibold d-block">${C.escaparHTML(ev.titulo)}</span>
          <span class="small text-muted">${UI.formatarData(ev.data)} · ${C.escaparHTML(ev.horario)} · ${ev.cargaHoraria}h</span>
        </span>
      </label>
    </div>`).join("");
  const atividadesMarcadas = () => [...document.querySelectorAll(".chk-atividade:checked")].map((c) => c.value);

  function atualizarResumo() {
    const ids = atividadesMarcadas();
    const horas = API.eventos().filter((e) => ids.includes(e.id)).reduce((s, e) => s + e.cargaHoraria, 0);
    const r = $("resumo-atividades");
    if (!ids.length) { r.innerHTML = '<span class="text-muted">Nenhuma atividade escolhida.</span>'; }
    else {
      r.innerHTML = `<i class="bi bi-check-circle text-success me-1" aria-hidden="true"></i>${ids.length} atividade(s) · ${horas}h. Participando de pelo menos ${API.diasMinimos()} dia do evento, você recebe o certificado de ${CFG.evento.cargaHorariaTotal} horas.`;
    }
    $("btn-todas").textContent = ids.length === API.eventos().length ? "Desmarcar todas" : "Marcar todas";
    if (ids.length) $("atividades").classList.remove("is-invalid");
  }
  $("lista-atividades").addEventListener("change", atualizarResumo);
  $("btn-todas").addEventListener("click", () => {
    const todas = atividadesMarcadas().length === API.eventos().length;
    document.querySelectorAll(".chk-atividade").forEach((c) => (c.checked = !todas));
    atualizarResumo();
  });
  atualizarResumo();

  // Máscaras aplicadas enquanto digita (letras são descartadas na hora).
  const mascaras = { cpf: C.mascaraCPF, telefone: C.mascaraTelefone, matricula: C.mascaraMatricula };
  Object.entries(mascaras).forEach(([id, fn]) => {
    $(id).addEventListener("input", (e) => { e.target.value = fn(e.target.value); });
  });
  // Nome: bloqueia números e símbolos enquanto digita.
  $("nome").addEventListener("input", (e) => {
    const limpo = e.target.value.replace(/[^A-Za-zÀ-ÖØ-öø-ÿ' -]/g, "");
    if (limpo !== e.target.value) e.target.value = limpo;
  });

  const regras = {
    nome: (v) => C.validarNome(v),
    email: (v) => C.validarEmail(v),
    telefone: (v) => C.validarTelefone(v),
    cpf: (v) => C.validarCPF(v),
    matricula: (v) => C.validarMatricula(v),
    curso: (v) => CFG.cursos.includes(v)
  };

  function validarCampo(id, mostrar) {
    const el = $(id);
    const ok = regras[id](el.value);
    if (mostrar || el.classList.contains("is-invalid") || el.classList.contains("is-valid")) {
      el.classList.toggle("is-invalid", !ok);
      el.classList.toggle("is-valid", ok);
    }
    el.setAttribute("aria-invalid", String(!ok));
    return ok;
  }

  Object.keys(regras).forEach((id) => {
    const el = $(id);
    el.addEventListener("blur", () => { if (el.value) validarCampo(id, true); });
    el.addEventListener("input", () => validarCampo(id, false));
    el.addEventListener("change", () => validarCampo(id, true));
  });

  // Aviso antecipado de CPF já inscrito (ao sair do campo).
  $("cpf").addEventListener("blur", async () => {
    if (!C.validarCPF($("cpf").value)) { $("erro-cpf").textContent = "CPF inválido. Confira os números."; return; }
    try {
      if (await API.cpfJaInscrito($("cpf").value)) {
        $("erro-cpf").innerHTML = 'Este CPF já está inscrito. <a href="certificado.html">Recuperar meu ingresso</a>.';
        $("cpf").classList.add("is-invalid"); $("cpf").classList.remove("is-valid");
      }
    } catch (_) { /* verificação final acontece no envio */ }
  });

  function marcarErro(campo, mensagem) {
    if (campo === "atividades") {
      $("atividades").classList.add("is-invalid");
      if (mensagem) $("erro-atividades").textContent = mensagem;
      $("atividades").scrollIntoView({ block: "center" });
      return;
    }
    const el = $(campo === "lgpd" ? "lgpd" : campo);
    if (!el) return;
    el.classList.add("is-invalid"); el.classList.remove("is-valid");
    const fb = el.parentElement.querySelector(".invalid-feedback");
    if (fb && mensagem) fb.textContent = mensagem;
    el.focus();
  }

  $("lgpd").addEventListener("change", (e) => e.target.classList.toggle("is-invalid", !e.target.checked));

  let enviando = false;
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (enviando) return; // clique duplo
    if ($("site").value) return; // robô preencheu o campo-armadilha

    const invalidos = Object.keys(regras).filter((id) => !validarCampo(id, true));
    const lgpdOk = $("lgpd").checked;
    const atividades = atividadesMarcadas();
    $("lgpd").classList.toggle("is-invalid", !lgpdOk);
    $("atividades").classList.toggle("is-invalid", !atividades.length);
    if (invalidos.length || !lgpdOk || !atividades.length) {
      UI.aviso("Confira os campos destacados em vermelho.", "erro");
      if (invalidos.length) $(invalidos[0]).focus();
      else if (!atividades.length) document.querySelector(".chk-atividade").focus();
      else $("lgpd").focus();
      return;
    }

    enviando = true;
    UI.carregando(btn, true, "Salvando inscrição...");
    try {
      const aluno = await API.criarAluno({
        nome: $("nome").value, email: $("email").value, telefone: $("telefone").value, cpf: $("cpf").value,
        matricula: $("matricula").value, curso: $("curso").value, periodo: $("periodo").value, consentimentoLGPD: lgpdOk,
        aceitaWhatsApp: $("whatsapp").checked, atividades
      });
      mostrarIngresso(aluno);
      UI.aviso("Inscrição realizada com sucesso!", "sucesso");
    } catch (err) {
      if (err instanceof API.ErroNegocio) { marcarErro(err.campo, err.message); UI.aviso(err.message, "erro"); }
      else { console.error(err); UI.aviso("Não foi possível salvar agora. Tente de novo em instantes.", "erro"); }
    } finally {
      enviando = false;
      UI.carregando(btn, false);
    }
  });

  function mostrarIngresso(aluno) {
    const qr = UI.qrDataURL(aluno.tokenIngresso, 400);
    $("qr-ingresso").src = qr;
    $("btn-baixar-qr").href = qr;
    $("ing-nome").textContent = aluno.nome;
    $("ing-curso").textContent = aluno.curso;
    $("ing-cpf").textContent = C.mascararCPFParaExibicao(aluno.cpf);
    $("ing-matricula").textContent = aluno.matricula;
    const lista = $("ing-atividades");
    lista.innerHTML = "";
    API.eventos().filter((e) => aluno.atividades.includes(e.id)).forEach((e) => {
      const li = document.createElement("li");
      li.textContent = `${UI.formatarData(e.data).slice(0, 5)} ${e.horario.split("–")[0].trim()} · ${e.titulo}`;
      lista.appendChild(li);
    });
    $("cartao-form").classList.add("d-none");
    $("cartao-sucesso").classList.remove("d-none");
    // O 2º clique de um clique duplo não pode acionar os botões do ingresso, que aparecem no mesmo lugar.
    $("cartao-sucesso").style.pointerEvents = "none";
    setTimeout(() => { $("cartao-sucesso").style.pointerEvents = ""; }, 800);
    $("cartao-sucesso").focus();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
})();
