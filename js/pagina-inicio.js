(async () => {
  const CFG = SGJA_CONFIG, API = SGJA_API, C = SGJACore, UI = SGJA_UI;
  const $ = (id) => document.getElementById(id);

  $("local-evento").textContent = CFG.evento.local;
  $("regra-minimo").textContent = `pelo menos ${API.diasMinimos()} dia do evento`;
  $("link-edital-ver").href = CFG.submissao.edital;
  $("link-edital-baixar").href = CFG.submissao.edital;

  // Programação oficial (edital, item 5): um cartão por dia, com os horários em fonte mono.
  const esc = C.escaparHTML;
  const nomesDia = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];
  const porDia = {};
  API.eventos().forEach((e) => (porDia[e.data] = porDia[e.data] || []).push(e));
  $("lista-programacao").innerHTML = Object.entries(porDia).map(([data, evs], i) => {
    const dia = nomesDia[new Date(data + "T12:00:00").getDay()];
    const linhas = evs.map((e) => `<li><span class="hora">${esc(e.horario)}</span><span>${esc(e.titulo)}</span></li>`).join("");
    return `<div class="col-md-6"><div class="cartao-item h-100"><p class="sub mb-1">${i + 1}º dia · ${dia}</p><h3>${UI.formatarData(data)}</h3><ul class="lista-horarios">${linhas}</ul></div></div>`;
  }).join("");

  // Cronograma oficial (edital, item 6): linha do tempo
  $("lista-cronograma").innerHTML = (CFG.cronograma || []).map((c) =>
    `<li${c.destaque ? ' class="destaque"' : ""}><span class="etiqueta">${esc(c.quando)}</span><h3>${esc(c.oque)}</h3></li>`).join("");

  try { $("contador-inscritos").textContent = await API.contarInscritos(); }
  catch (_) { $("contador-inscritos").textContent = "—"; }
})();
