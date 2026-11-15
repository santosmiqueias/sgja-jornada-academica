(async () => {
  const CFG = SGJA_CONFIG, API = SGJA_API, C = SGJACore, UI = SGJA_UI;
  const $ = (id) => document.getElementById(id);

  $("local-evento").textContent = CFG.evento.local;
  $("regra-minimo").textContent = `pelo menos ${API.diasMinimos()} dia do evento`;
  $("link-edital-ver").href = CFG.submissao.edital;
  $("link-edital-baixar").href = CFG.submissao.edital;

  // Programação oficial (edital, item 5): tabela com o dia em destaque e as atividades de cada dia.
  const esc = C.escaparHTML;
  const nomesDia = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];
  const porDia = {};
  API.eventos().forEach((e) => (porDia[e.data] = porDia[e.data] || []).push(e));
  const corpoProg = Object.entries(porDia).map(([data, evs], i) => {
    const dia = nomesDia[new Date(data + "T12:00:00").getDay()];
    const linhas = evs.map((e) => `<tr><td class="col-hora">${esc(e.horario)}</td><td>${esc(e.titulo)}</td><td class="col-turno">${esc(e.turno || "")}</td></tr>`).join("");
    return `<tbody><tr class="linha-dia"><th colspan="3" scope="rowgroup">${i + 1}º dia · ${UI.formatarData(data)} (${dia})</th></tr>${linhas}</tbody>`;
  }).join("");
  $("lista-programacao").innerHTML = `<div class="table-responsive"><table class="table tabela-oficial">
    <thead><tr><th scope="col">Horário</th><th scope="col">Atividade</th><th scope="col" class="col-turno">Turno</th></tr></thead>${corpoProg}</table></div>`;

  // Cronograma oficial (edital, item 6)
  const linhasCrono = (CFG.cronograma || []).map((c) =>
    `<tr${c.destaque ? ' class="linha-destaque"' : ""}><td class="col-data">${esc(c.quando)}</td><td>${esc(c.oque)}</td></tr>`).join("");
  $("lista-cronograma").innerHTML = `<div class="table-responsive"><table class="table tabela-oficial">
    <thead><tr><th scope="col">Data</th><th scope="col">Etapa</th></tr></thead><tbody>${linhasCrono}</tbody></table></div>`;

  try { $("contador-inscritos").textContent = await API.contarInscritos(); }
  catch (_) { $("contador-inscritos").textContent = "—"; }
})();
