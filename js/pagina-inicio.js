(async () => {
  const CFG = SGJA_CONFIG, API = SGJA_API, C = SGJACore, UI = SGJA_UI;
  const $ = (id) => document.getElementById(id);

  $("local-evento").textContent = CFG.evento.local;
  $("regra-minimo").textContent = `pelo menos ${API.diasMinimos()} dia do evento`;
  $("link-edital-ver").href = CFG.submissao.edital;
  $("link-edital-baixar").href = CFG.submissao.edital;

  // Programação oficial (edital, item 5): abas por dia + linhas (horário · atividade · turno).
  const esc = C.escaparHTML;
  const nomesDia = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];
  const porDia = {};
  API.eventos().forEach((e) => (porDia[e.data] = porDia[e.data] || []).push(e));
  const dias = Object.entries(porDia);
  $("abas-dias").innerHTML = dias.map(([data], i) => {
    const dia = nomesDia[new Date(data + "T12:00:00").getDay()];
    return `<button type="button" role="tab" id="aba-dia-${i}" aria-controls="painel-dia-${i}" aria-selected="${i === 0}" tabindex="${i === 0 ? 0 : -1}" class="aba-dia${i === 0 ? " ativa" : ""}">
      <span class="aba-dia-num">Dia ${i + 1}</span><span class="aba-dia-data">${UI.formatarData(data)}</span><span class="aba-dia-semana">${dia}</span></button>`;
  }).join("");
  $("lista-programacao").innerHTML = dias.map(([data, evs], i) => `
    <ol class="lista-agenda" role="tabpanel" id="painel-dia-${i}" aria-labelledby="aba-dia-${i}" tabindex="0"${i === 0 ? "" : " hidden"}>
      ${evs.map((e) => `<li><span class="agenda-hora">${esc(e.horario)}</span><span class="agenda-titulo">${esc(e.titulo)}</span><span class="agenda-tag">${esc(e.turno || "")}</span></li>`).join("")}
    </ol>`).join("");
  const abas = [...document.querySelectorAll("#abas-dias [role=tab]")];
  function ativar(i, foco) {
    abas.forEach((b, j) => {
      const sel = i === j;
      b.classList.toggle("ativa", sel); b.setAttribute("aria-selected", String(sel)); b.tabIndex = sel ? 0 : -1;
      $(`painel-dia-${j}`).hidden = !sel;
    });
    if (foco) abas[i].focus();
  }
  abas.forEach((b, i) => {
    b.addEventListener("click", () => ativar(i));
    b.addEventListener("keydown", (e) => {
      if (e.key === "ArrowRight" || e.key === "ArrowLeft") { e.preventDefault(); ativar((i + (e.key === "ArrowRight" ? 1 : -1) + abas.length) % abas.length, true); }
    });
  });

  // Cronograma oficial (edital, item 6): linhas (data · etapa · fase)
  $("lista-cronograma").innerHTML = (CFG.cronograma || []).map((c) =>
    `<li${c.destaque ? ' class="destaque"' : ""}><span class="agenda-hora">${esc(c.quando)}</span><span class="agenda-titulo">${esc(c.oque)}</span><span class="agenda-tag">${esc(c.fase || "")}</span></li>`).join("");

  try { $("contador-inscritos").textContent = await API.contarInscritos(); }
  catch (_) { $("contador-inscritos").textContent = "—"; }
})();
