/* Efeitos 3D: inclinação dos cartões seguindo o ponteiro e entrada das seções ao rolar.
   Não roda se o aparelho pede "reduzir movimento". Funciona também com conteúdo criado depois
   (tabelas e cartões do painel), porque escuta os eventos no documento inteiro. */
(function () {
  "use strict";
  const reduzir = window.matchMedia("(prefers-reduced-motion: reduce)");
  if (reduzir.matches) return;
  document.documentElement.classList.add("efeitos-3d");

  // Elementos que ganham a inclinação 3D
  const SELETOR_TILT = [
    ".card-destaque", ".local-evento", "#formatos .card", ".doacao", ".ingresso",
    ".cartao-numero", ".atalho", ".stat", ".mt-cartao", ".cartao-checkin"
  ].join(",");
  // Elementos que entram em 3D quando aparecem na tela
  const SELETOR_REVELAR = [
    "main .secao-titulo", "#sobre .col-lg-7", "#sobre .card", "#como-funciona .card", "#formatos .card",
    "#doacao .doacao", ".timeline-dia", "#faq .accordion-item", ".cabecalho-pagina + .container > *",
    ".cartao-numero", ".painel-conteudo .card"
  ].join(",");

  const ponteiroFino = window.matchMedia("(hover: hover) and (pointer: fine)");

  function marcar(raiz) {
    raiz.querySelectorAll(SELETOR_TILT).forEach((el) => el.classList.add("tilt-3d"));
  }

  /* ---------- Inclinação ---------- */
  let atual = null, quadro = 0, ultimo = null;
  function aplicar() {
    quadro = 0;
    if (!atual || !ultimo) return;
    const r = atual.getBoundingClientRect();
    const x = (ultimo.clientX - r.left) / r.width, y = (ultimo.clientY - r.top) / r.height;
    // Cartões grandes inclinam menos (não atrapalha a leitura)
    const max = Math.max(2.5, Math.min(9, 9 * (380 / Math.max(r.width, r.height))));
    atual.style.setProperty("--ry", `${((x - 0.5) * 2 * max).toFixed(2)}deg`);
    atual.style.setProperty("--rx", `${((0.5 - y) * 2 * max).toFixed(2)}deg`);
    atual.style.setProperty("--gx", `${(x * 100).toFixed(1)}%`);
    atual.style.setProperty("--gy", `${(y * 100).toFixed(1)}%`);
    atual.style.setProperty("--brilho", "1");
  }
  function soltar(el) {
    if (!el) return;
    el.classList.remove("tilt-ativo");
    el.style.setProperty("--rx", "0deg"); el.style.setProperty("--ry", "0deg"); el.style.setProperty("--brilho", "0");
  }
  document.addEventListener("pointermove", (e) => {
    if (!ponteiroFino.matches || e.pointerType !== "mouse") return;
    const alvo = e.target.closest && e.target.closest(".tilt-3d");
    // Não inclina enquanto a pessoa digita ou seleciona dentro do cartão
    if (alvo && alvo.contains(document.activeElement) && /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)) { soltar(alvo); return; }
    if (alvo !== atual) { soltar(atual); atual = alvo; if (atual) atual.classList.add("tilt-ativo"); }
    if (!atual) return;
    ultimo = e;
    if (!quadro) quadro = requestAnimationFrame(aplicar);
  }, { passive: true });
  document.addEventListener("pointerleave", () => { soltar(atual); atual = null; });
  window.addEventListener("blur", () => { soltar(atual); atual = null; });

  /* ---------- Entrada ao rolar ---------- */
  const visto = new WeakSet();
  const observador = "IntersectionObserver" in window ? new IntersectionObserver((itens) => {
    itens.forEach((it) => { if (it.isIntersecting) { it.target.classList.add("revelado"); observador.unobserve(it.target); } });
  }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 }) : null;

  function revelar(raiz) {
    if (!observador) return;
    const grupos = new Map();
    raiz.querySelectorAll(SELETOR_REVELAR).forEach((el) => {
      if (visto.has(el) || el.closest(".modal")) return;
      visto.add(el);
      // Já visível na abertura da página: não esconde (evita "piscar")
      const r = el.getBoundingClientRect();
      if (r.top < window.innerHeight && r.bottom > 0) return;
      // Pequeno atraso em cascata entre irmãos (ex.: os 4 passos)
      const pai = el.parentElement && el.parentElement.parentElement;
      const n = grupos.get(pai) || 0; grupos.set(pai, n + 1);
      el.style.setProperty("--atraso", `${Math.min(n, 5) * 0.08}s`);
      el.classList.add("revelar-3d");
      observador.observe(el);
    });
  }

  function iniciar() {
    marcar(document);
    revelar(document);
    // Conteúdo que aparece depois (painel, ingresso, listas): marca também
    let pendente = false;
    new MutationObserver(() => {
      if (pendente) return;
      pendente = true;
      requestAnimationFrame(() => { pendente = false; marcar(document); });
    }).observe(document.body, { childList: true, subtree: true });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar);
  else iniciar();

  reduzir.addEventListener && reduzir.addEventListener("change", (e) => { if (e.matches) location.reload(); });
})();
