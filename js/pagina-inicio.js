(async () => {
  const CFG = SGJA_CONFIG, API = SGJA_API, C = SGJACore, UI = SGJA_UI;
  const $ = (id) => document.getElementById(id);

  $("local-evento").textContent = CFG.evento.local;
  $("regra-minimo").textContent = `pelo menos ${API.diasMinimos()} dia do evento`;
  $("link-edital-ver").href = CFG.submissao.edital;
  $("link-edital-baixar").href = CFG.submissao.edital;

  // Programação oficial (edital, item 5)
  const porDia = {};
  API.eventos().forEach((e) => (porDia[e.data] = porDia[e.data] || []).push(e));
  const nomesDia = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
  $("lista-programacao").innerHTML = Object.entries(porDia).map(([data, evs], i) => {
    const dia = nomesDia[new Date(data + "T12:00:00").getDay()];
    const itens = evs.map((e) => `
      <div class="atividade d-flex gap-3 align-items-baseline">
        <span class="hora">${C.escaparHTML(e.horario)}</span>
        <span class="fw-semibold">${C.escaparHTML(e.titulo)}</span>
      </div>`).join("");
    return `<div class="col-md-6"><div class="timeline-dia"><h3 class="h5 fw-bold text-navy">${i + 1}º dia · ${dia}, ${UI.formatarData(data)}</h3>${itens}</div></div>`;
  }).join("");

  // Cronograma oficial (edital, item 6)
  $("lista-cronograma").innerHTML = (CFG.cronograma || []).map((c) =>
    `<li class="${/Jornada Acadêmica/.test(c.oque) ? "destaque" : ""}"><span class="quando">${C.escaparHTML(c.quando)}</span>${C.escaparHTML(c.oque)}</li>`).join("");

  try { $("contador-inscritos").textContent = await API.contarInscritos(); }
  catch (_) { $("contador-inscritos").textContent = "—"; }
})();
