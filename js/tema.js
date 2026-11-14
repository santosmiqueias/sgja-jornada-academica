/*
 * Tema claro, escuro ou de acordo com o sistema do aparelho.
 * Carregado no <head> de todas as páginas, antes do CSS aparecer na tela, para não piscar branco no modo escuro.
 * A escolha fica só neste navegador (localStorage); sem escolha, segue o sistema.
 */
(function () {
  "use strict";
  const CHAVE = "sgja_tema";
  const OPCOES = ["claro", "escuro", "sistema"];
  const midia = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;

  function lerEscolha() {
    try { const v = localStorage.getItem(CHAVE); return OPCOES.includes(v) ? v : "sistema"; } catch (_) { return "sistema"; }
  }
  function resolver(escolha) {
    if (escolha === "claro" || escolha === "escuro") return escolha;
    return midia && midia.matches ? "escuro" : "claro";
  }
  function aplicar() {
    const escolha = lerEscolha();
    const efetivo = resolver(escolha);
    const raiz = document.documentElement;
    raiz.setAttribute("data-bs-theme", efetivo === "escuro" ? "dark" : "light");
    raiz.setAttribute("data-tema-escolha", escolha);
    document.dispatchEvent(new CustomEvent("sgja:tema", { detail: { escolha, efetivo } }));
  }
  function definir(escolha) {
    if (!OPCOES.includes(escolha)) return;
    try { if (escolha === "sistema") localStorage.removeItem(CHAVE); else localStorage.setItem(CHAVE, escolha); } catch (_) {}
    aplicar();
  }

  aplicar();
  // No modo "sistema", acompanha quando o aparelho troca sozinho (ex.: modo escuro automático à noite).
  if (midia) {
    const aoMudar = () => { if (lerEscolha() === "sistema") aplicar(); };
    if (midia.addEventListener) midia.addEventListener("change", aoMudar); else if (midia.addListener) midia.addListener(aoMudar);
  }
  // Outra aba mudou o tema: aplica aqui também.
  window.addEventListener("storage", (e) => { if (e.key === CHAVE) aplicar(); });

  window.SGJA_TEMA = { OPCOES, escolha: lerEscolha, efetivo: () => resolver(lerEscolha()), definir };
})();
