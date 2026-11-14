/* Componentes de tela compartilhados: menu, rodapé, avisos (toasts) e utilidades. */
(function () {
  "use strict";
  const CFG = window.SGJA_CONFIG;

  const LINKS = [
    { href: "index.html", rotulo: "Início", icone: "house" },
    { href: "index.html#programacao", rotulo: "Programação", icone: "calendar3" },
    { href: "inscricao.html", rotulo: "Inscrição", icone: "person-plus" },
    { href: "certificado.html", rotulo: "Meu certificado", icone: "award" },
    { href: "validar.html", rotulo: "Validar", icone: "patch-check" },
    { href: "checkin.html", rotulo: "Check-in", icone: "qr-code-scan" },
    { href: "painel.html", rotulo: "Painel do professor", icone: "clipboard-check" }
  ];

  function montarMenu() {
    const alvo = document.getElementById("menu");
    if (!alvo) return;
    const atual = location.pathname.split("/").pop() || "index.html";
    const itens = LINKS.map((l) => {
      const ativo = l.href === atual ? " active" : "";
      const aria = ativo ? ' aria-current="page"' : "";
      return `<li class="nav-item"><a class="nav-link${ativo}"${aria} href="${l.href}"><i class="bi bi-${l.icone} me-1" aria-hidden="true"></i>${l.rotulo}</a></li>`;
    }).join("");
    alvo.innerHTML = `
      <nav class="navbar navbar-expand-xl navbar-dark bg-navy sticky-top shadow-sm">
        <div class="container">
          <a class="navbar-brand d-flex align-items-center gap-2" href="index.html">
            <span class="brand-badge">6ª</span><span class="fw-bold">Jornada Acadêmica</span>
          </a>
          <button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#nav" aria-controls="nav" aria-expanded="false" aria-label="Abrir menu">
            <span class="navbar-toggler-icon"></span>
          </button>
          <div class="collapse navbar-collapse" id="nav"><ul class="navbar-nav ms-auto">${itens}</ul></div>
        </div>
      </nav>`;
  }

  function montarRodape() {
    const alvo = document.getElementById("rodape");
    if (!alvo) return;
    const insta = CFG.evento.instagram;
    const usuario = insta ? "@" + insta.replace(/\/+$/, "").split("/").pop() : "";
    alvo.innerHTML = `
      <footer class="bg-navy text-white-50 py-4">
        <div class="container d-flex flex-column flex-md-row justify-content-between gap-2 small">
          <span><strong class="text-white">${CFG.evento.nomeCompleto || CFG.evento.nome}</strong> · ${CFG.evento.instituicao} · ${CFG.evento.cidade}</span>
          ${insta ? `<a class="link-rede" href="${insta}" target="_blank" rel="noopener noreferrer"><i class="bi bi-instagram me-1" aria-hidden="true"></i>${usuario}</a>` : ""}
        </div>
        <div class="container small mt-2">S.G.J.A — Sistema de Gestão da Jornada Acadêmica · Seus dados são tratados conforme a LGPD</div>
      </footer>`;
  }

  function aviso(mensagem, tipo) {
    let area = document.getElementById("area-avisos");
    if (!area) {
      area = document.createElement("div");
      area.id = "area-avisos";
      area.className = "toast-container position-fixed bottom-0 end-0 p-3";
      area.setAttribute("aria-live", "polite");
      document.body.appendChild(area);
    }
    const cores = { sucesso: "text-bg-success", erro: "text-bg-danger", info: "text-bg-primary", alerta: "text-bg-warning" };
    const el = document.createElement("div");
    el.className = `toast align-items-center border-0 ${cores[tipo] || cores.info}`;
    el.setAttribute("role", tipo === "erro" ? "alert" : "status");
    el.innerHTML = `<div class="d-flex"><div class="toast-body"></div><button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Fechar"></button></div>`;
    el.querySelector(".toast-body").textContent = mensagem;
    area.appendChild(el);
    const t = new bootstrap.Toast(el, { delay: 4000 });
    el.addEventListener("hidden.bs.toast", () => el.remove());
    t.show();
  }

  function formatarData(iso) {
    const [a, m, d] = iso.split("-");
    return `${d}/${m}/${a}`;
  }
  function formatarDataHora(iso) {
    return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
  }

  // Botão em estado "carregando": evita clique duplo e mostra progresso.
  function carregando(botao, ativo, texto) {
    if (ativo) {
      botao.dataset.textoOriginal = botao.innerHTML;
      botao.disabled = true;
      botao.innerHTML = `<span class="spinner-border spinner-border-sm me-2" aria-hidden="true"></span>${texto || "Processando..."}`;
    } else {
      botao.disabled = false;
      if (botao.dataset.textoOriginal) botao.innerHTML = botao.dataset.textoOriginal;
    }
  }

  // Gera um QR Code como dataURL (usa a biblioteca qrcodejs carregada na página).
  function qrDataURL(texto, tamanho) {
    const tmp = document.createElement("div");
    new QRCode(tmp, { text: texto, width: tamanho || 220, height: tamanho || 220, colorDark: "#0b2a6f", colorLight: "#ffffff", correctLevel: QRCode.CorrectLevel.M });
    const canvas = tmp.querySelector("canvas");
    return canvas ? canvas.toDataURL("image/png") : tmp.querySelector("img").src;
  }

  /*
   * Confirmação dentro da página (substitui confirm/prompt do navegador).
   * exigirTexto: a pessoa precisa digitar essa palavra para liberar o botão (ações destrutivas).
   * Retorna uma Promise<boolean>.
   */
  function confirmar(mensagem, opcoes) {
    const o = Object.assign({ titulo: "Confirmar", botao: "Confirmar", perigo: false, exigirTexto: "" }, opcoes);
    return new Promise((resolver) => {
      const el = document.createElement("div");
      el.className = "modal fade";
      el.tabIndex = -1;
      el.setAttribute("aria-labelledby", "confirmar-titulo");
      el.innerHTML = `
        <div class="modal-dialog modal-dialog-centered"><div class="modal-content">
          <div class="modal-header"><h2 class="modal-title h5" id="confirmar-titulo"></h2>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cancelar"></button></div>
          <div class="modal-body"><p class="mb-0" data-msg></p>
            <div class="mt-3" data-campo hidden><label class="form-label small" for="confirmar-texto"></label>
              <input class="form-control" id="confirmar-texto" autocomplete="off"></div></div>
          <div class="modal-footer">
            <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Cancelar</button>
            <button type="button" class="btn ${o.perigo ? "btn-danger" : "btn-primary"}" data-ok></button></div>
        </div></div>`;
      el.querySelector(".modal-title").textContent = o.titulo;
      el.querySelector("[data-msg]").textContent = mensagem;
      const ok = el.querySelector("[data-ok]");
      ok.textContent = o.botao;
      const campo = el.querySelector("#confirmar-texto");
      if (o.exigirTexto) {
        el.querySelector("[data-campo]").hidden = false;
        el.querySelector("label[for=confirmar-texto]").textContent = `Digite ${o.exigirTexto} para confirmar`;
        ok.disabled = true;
        campo.addEventListener("input", () => { ok.disabled = campo.value.trim().toUpperCase() !== o.exigirTexto; });
      }
      document.body.appendChild(el);
      const modal = new bootstrap.Modal(el);
      let resposta = false;
      ok.addEventListener("click", () => { resposta = true; modal.hide(); });
      el.addEventListener("shown.bs.modal", () => (o.exigirTexto ? campo : ok).focus());
      el.addEventListener("hidden.bs.modal", () => { el.remove(); resolver(resposta); });
      modal.show();
    });
  }

  // Aviso de modo demonstração nas áreas restritas (para ninguém lançar dados reais nele).
  function avisoDemonstracao() {
    const api = window.SGJA_API;
    const pagina = location.pathname.split("/").pop();
    if (!api || api.backend !== "local" || !["painel.html", "checkin.html"].includes(pagina)) return;
    const alvo = document.querySelector("main.container");
    if (!alvo) return;
    const el = document.createElement("div");
    el.className = "alert alert-warning small";
    el.setAttribute("role", "note");
    el.innerHTML = "<strong>Modo demonstração.</strong> Os dados ficam só neste navegador e o acesso é conferido no próprio aparelho. Para o evento, configure o modo servidor (veja docs/seguranca.md).";
    alvo.prepend(el);
  }

  document.addEventListener("DOMContentLoaded", () => { montarMenu(); montarRodape(); avisoDemonstracao(); });

  window.SGJA_UI = { aviso, formatarData, formatarDataHora, carregando, qrDataURL, confirmar };
})();
