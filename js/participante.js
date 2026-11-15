/* Inscrição: abas Submissão / Participante e a inscrição de participante (nome, CPF, e-mail e telefone, ou conta Google). */
(function () {
  "use strict";
  const C = window.SGJACore, API = window.SGJA_API, UI = window.SGJA_UI, CFG = window.SGJA_CONFIG;
  const $ = (id) => document.getElementById(id);
  let googlePronto = false; // o botão do Google só é desenhado depois que o script do Google carrega

  /* ---------------- Abas (o endereço guarda a escolha: #submissao ou #participante) ---------------- */
  const abas = { submissao: $("tab-submissao"), participante: $("tab-participante") };
  function abrirAba(nome) {
    const b = abas[nome];
    if (b) bootstrap.Tab.getOrCreateInstance(b).show();
  }
  Object.entries(abas).forEach(([nome, b]) => b.addEventListener("shown.bs.tab", () => {
    try { history.replaceState(null, "", `#${nome}`); } catch (_) {}
    if (nome === "participante") desenharBotaoGoogle();
  }));
  const inicial = location.hash.replace("#", "");
  if (abas[inicial]) abrirAba(inicial);
  window.addEventListener("hashchange", () => { const h = location.hash.replace("#", ""); if (abas[h]) abrirAba(h); });

  /* ---------------- Formulário ---------------- */
  ["p-cpf", "pg-cpf"].forEach((id) => $(id).addEventListener("input", (e) => (e.target.value = C.mascaraCPF(e.target.value))));
  ["p-telefone", "pg-telefone"].forEach((id) => $(id).addEventListener("input", (e) => (e.target.value = C.mascaraTelefone(e.target.value))));
  // O erro some enquanto a pessoa corrige (sem mexer no layout no meio de um clique).
  document.querySelectorAll("#painel-participante input").forEach((el) => el.addEventListener(el.type === "checkbox" ? "change" : "input", () => el.classList.remove("is-invalid")));

  function validar(prefixo, comEmail) {
    const campos = {
      [`${prefixo}-nome`]: C.validarNome($(`${prefixo}-nome`).value),
      [`${prefixo}-cpf`]: C.validarCPF($(`${prefixo}-cpf`).value),
      [`${prefixo}-telefone`]: C.validarTelefone($(`${prefixo}-telefone`).value),
      [`${prefixo}-lgpd`]: $(`${prefixo}-lgpd`).checked
    };
    if (comEmail) campos[`${prefixo}-email`] = C.validarEmail($(`${prefixo}-email`).value);
    Object.entries(campos).forEach(([id, ok]) => $(id).classList.toggle("is-invalid", !ok));
    const ordem = [`${prefixo}-nome`, `${prefixo}-cpf`, `${prefixo}-telefone`, `${prefixo}-email`, `${prefixo}-lgpd`];
    const primeiro = ordem.find((id) => id in campos && !campos[id]);
    if (primeiro) { $(primeiro).focus(); return false; }
    return true;
  }

  // Erro do servidor no campo certo (o servidor usa p-nome, p-cpf...; no formulário do Google os campos são pg-*).
  function mostrarErro(err, prefixo) {
    if (err instanceof API.ErroNegocio && err.campo && /^p-/.test(err.campo)) {
      const el = $(err.campo.replace(/^p-/, `${prefixo}-`));
      if (el) {
        el.classList.add("is-invalid");
        const fb = el.parentElement.querySelector(".invalid-feedback");
        if (fb) fb.textContent = err.message;
        el.focus();
      }
    }
    UI.aviso(err instanceof API.ErroNegocio ? err.message : "Não foi possível concluir a inscrição agora.", "erro");
  }

  function mostrarIngresso(r) {
    const a = r.aluno;
    $("part-ok-titulo").textContent = r.jaInscrito ? "Você já está inscrito(a)!" : "Inscrição confirmada!";
    $("part-ok-texto").textContent = r.jaInscrito ? "Encontramos sua inscrição. Este é o seu ingresso." : "Guarde o QR Code abaixo: ele é o seu ingresso.";
    const qr = UI.qrDataURL(a.tokenIngresso, 400);
    $("qr-participante").src = qr; $("btn-baixar-qr-participante").href = qr;
    $("part-nome").textContent = a.nome;
    $("part-cpf").textContent = C.mascararCPFParaExibicao(a.cpf);
    $("cartao-participante").classList.add("d-none");
    const card = $("cartao-participante-ok");
    card.classList.remove("d-none");
    card.style.pointerEvents = "none"; // o 2º clique de um clique duplo não aciona o botão de baixar
    setTimeout(() => { card.style.pointerEvents = ""; }, 800);
    card.focus();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  $("form-participante").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!validar("p", true)) return;
    UI.carregando($("btn-participante"), true, "Enviando...");
    try {
      const r = await API.inscreverParticipante({ nome: $("p-nome").value, cpf: $("p-cpf").value, email: $("p-email").value, telefone: $("p-telefone").value, consentimentoLGPD: true });
      mostrarIngresso(r);
      UI.aviso("Inscrição confirmada!", "sucesso");
    } catch (err) { mostrarErro(err, "p"); }
    finally { UI.carregando($("btn-participante"), false); }
  });

  /* ---------------- Conta Google (só no modo servidor, com o ID do cliente em js/config.js) ---------------- */
  const CLIENT_ID = (CFG.google && CFG.google.clientId || "").trim();
  let credencial = null; // só na memória da página, para concluir a inscrição

  function mostrarFormGoogle(info) {
    $("part-inicio").classList.add("d-none");
    $("part-google").classList.remove("d-none");
    $("pg-email").textContent = info.email || "";
    $("pg-nome").value = info.nome || "";
    (info.nome ? $("pg-cpf") : $("pg-nome")).focus();
  }
  function cancelarGoogle() {
    credencial = null;
    $("part-google").classList.add("d-none");
    $("part-inicio").classList.remove("d-none");
  }
  $("btn-participante-cancelar").addEventListener("click", cancelarGoogle);

  async function aoReceberCredencial(resposta) {
    if (!resposta || !resposta.credential) return;
    try {
      mostrarIngresso(await API.participanteGoogle(resposta.credential)); // já inscrito: mostra o ingresso
    } catch (err) {
      if (err instanceof API.ErroNegocio && err.status === 404 && err.campo === "precisa-cadastro") {
        credencial = resposta.credential;
        mostrarFormGoogle((err.dados && err.dados.google) || {});
        return;
      }
      UI.aviso(err instanceof API.ErroNegocio ? err.message : "Não foi possível entrar com o Google agora.", "erro");
    }
  }

  $("form-participante-google").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!validar("pg", false)) return;
    UI.carregando($("btn-participante-google"), true, "Enviando...");
    try {
      const r = await API.participanteGoogle(credencial, { nome: $("pg-nome").value, cpf: $("pg-cpf").value, telefone: $("pg-telefone").value, consentimentoLGPD: true });
      credencial = null;
      mostrarIngresso(r);
      UI.aviso("Inscrição confirmada!", "sucesso");
    } catch (err) {
      if (err instanceof API.ErroNegocio && err.status === 401) cancelarGoogle(); // confirmação do Google expirou: clicar de novo
      mostrarErro(err, "pg");
    } finally { UI.carregando($("btn-participante-google"), false); }
  });

  function desenharBotaoGoogle() {
    if (!googlePronto) return;
    const escuro = document.documentElement.getAttribute("data-bs-theme") === "dark";
    document.querySelectorAll("#painel-participante [data-botao-google]").forEach((el) => {
      if (!el.offsetParent) return; // aba escondida: desenha quando abrir, com a largura certa
      el.innerHTML = "";
      google.accounts.id.renderButton(el, {
        type: "standard", theme: escuro ? "filled_black" : "outline", size: "large", shape: "pill",
        text: el.dataset.botaoGoogle, logo_alignment: "left", locale: "pt-BR", width: Math.min(360, Math.max(220, el.clientWidth || 300))
      });
    });
  }
  if (CLIENT_ID && API.googleDisponivel) {
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.onload = () => {
      google.accounts.id.initialize({ client_id: CLIENT_ID, callback: aoReceberCredencial, ux_mode: "popup", auto_select: false, cancel_on_tap_outside: true, context: "signup" });
      googlePronto = true;
      document.querySelectorAll("[data-google-part]").forEach((el) => el.classList.remove("d-none"));
      desenharBotaoGoogle();
    };
    s.onerror = () => console.warn("Não foi possível carregar o login com Google.");
    document.head.appendChild(s);
    document.addEventListener("sgja:tema", desenharBotaoGoogle);
  }
})();
