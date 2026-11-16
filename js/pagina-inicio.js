(async () => {
  const CFG = SGJA_CONFIG, API = SGJA_API, C = SGJACore, UI = SGJA_UI;
  const $ = (id) => document.getElementById(id);

  $("local-evento").textContent = CFG.evento.local;

  // Local do evento: mapa do OpenStreetMap com marcador, endereço e links de rota
  const L = CFG.evento.localDetalhe;
  if (L) {
    $("local-titulo").textContent = L.unidade;
    $("local-endereco").innerHTML = `${C.escaparHTML(L.endereco)}<br>${C.escaparHTML(L.cidade)}`;
    const mapa = `https://www.google.com/maps/search/?api=1&query=${L.lat},${L.lon}`;
    $("local-mapa-link").href = mapa;
    $("local-pino").href = mapa;
    // Sem a foto em assets/img/uninassau-joquei.jpg, mostra um painel no lugar (nunca imagem quebrada)
    const foto = $("foto-local");
    const semFoto = () => { foto.hidden = true; $("foto-reserva").hidden = false; };
    if (foto.complete && !foto.naturalWidth) semFoto(); else foto.addEventListener("error", semFoto);
    $("local-rota").href = `https://www.google.com/maps/dir/?api=1&destination=${L.lat},${L.lon}`;
  }
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

  // Cronograma oficial (edital, item 6), no mesmo formato da programação: uma coluna por fase.
  const porFase = {};
  (CFG.cronograma || []).forEach((c) => (porFase[c.fase || "Cronograma"] = porFase[c.fase || "Cronograma"] || []).push(c));
  $("lista-cronograma").innerHTML = Object.entries(porFase).map(([fase, itens]) => {
    const linhas = itens.map((c) => `
      <div class="atividade atividade-cronograma d-flex gap-3 align-items-baseline${c.destaque ? " destaque" : ""}">
        <span class="hora">${C.escaparHTML(c.quando)}</span>
        <span class="fw-semibold">${C.escaparHTML(c.oque)}</span>
      </div>`).join("");
    return `<div class="col-md-6"><div class="timeline-dia"><h3 class="h5 fw-bold text-navy">${C.escaparHTML(fase)}</h3>${linhas}</div></div>`;
  }).join("");

  try { $("contador-inscritos").textContent = await API.contarInscritos(); }
  catch (_) { $("contador-inscritos").textContent = "—"; }
})();
