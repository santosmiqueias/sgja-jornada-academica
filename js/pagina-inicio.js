(async () => {
  const CFG = SGJA_CONFIG, API = SGJA_API, C = SGJACore, UI = SGJA_UI;
  const total = API.cargaTotal();
  document.getElementById("carga-total").textContent = total;
  document.getElementById("local-evento").textContent = CFG.evento.local;
  document.getElementById("regra-minimo").textContent = `pelo menos ${API.atividadesMinimas()} das ${CFG.eventos.length} atividades (${CFG.evento.percentualMinimoAtividades}%)`;
  document.getElementById("vagas-texto").textContent = `${total} horas de certificado`;

  const porDia = {};
  API.eventos().forEach((e) => (porDia[e.data] = porDia[e.data] || []).push(e));
  const nomesDia = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
  document.getElementById("lista-programacao").innerHTML = Object.entries(porDia).map(([data, evs], i) => {
    const dia = nomesDia[new Date(data + "T12:00:00").getDay()];
    const itens = evs.map((e) => `
      <div class="atividade d-flex justify-content-between gap-3">
        <div>
          <div class="small text-muted"><i class="bi bi-clock me-1"></i>${C.escaparHTML(e.horario)} · ${C.escaparHTML(e.turno)}</div>
          <div class="fw-semibold">${C.escaparHTML(e.titulo)}</div>
          <div class="small text-muted"><i class="bi bi-geo-alt me-1"></i>${C.escaparHTML(e.sala)}</div>
        </div>
        <span class="carga align-self-start">${e.cargaHoraria}h</span>
      </div>`).join("");
    return `<div class="col-md-6"><div class="timeline-dia"><h3 class="h5 fw-bold text-navy">Dia ${i + 1} · ${dia}, ${UI.formatarData(data)}</h3>${itens}</div></div>`;
  }).join("");

  try { document.getElementById("contador-inscritos").textContent = await API.contarInscritos(); }
  catch (_) { document.getElementById("contador-inscritos").textContent = "—"; }
})();
