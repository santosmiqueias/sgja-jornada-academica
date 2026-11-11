(function () {
  const C = SGJACore, API = SGJA_API, UI = SGJA_UI, CFG = SGJA_CONFIG;
  const campo = document.getElementById("codigo"), res = document.getElementById("resultado");
  campo.addEventListener("input", () => {
    const v = campo.value.toUpperCase().replace(/[^A-F0-9]/g, "").slice(0, 12);
    campo.value = v.match(/.{1,4}/g)?.join("-") || "";
  });
  async function validar() {
    const codigo = campo.value.trim();
    if (!/^[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}$/.test(codigo)) {
      res.innerHTML = `<div class="alert alert-warning">Digite o código completo, no formato XXXX-XXXX-XXXX.</div>`; return;
    }
    const cert = await API.buscarCertificadoPorCodigo(codigo);
    if (!cert) {
      res.innerHTML = `<div class="alert alert-danger"><i class="bi bi-x-octagon me-1"></i><strong>Certificado não encontrado.</strong> Este código não foi emitido pela ${C.escaparHTML(CFG.evento.nome)}.</div>`; return;
    }
    res.innerHTML = `<div class="alert alert-success mb-0"><i class="bi bi-patch-check-fill me-1"></i><strong>Certificado autêntico.</strong>
      <dl class="row mb-0 mt-2 small">
        <dt class="col-4">Participante</dt><dd class="col-8">${C.escaparHTML(cert.nome)}</dd>
        <dt class="col-4">Curso</dt><dd class="col-8">${C.escaparHTML(cert.curso)}</dd>
        <dt class="col-4">Carga horária</dt><dd class="col-8">${cert.horas} horas</dd>
        ${Array.isArray(cert.atividades) && cert.atividades.length ? `<dt class="col-4">Atividades</dt><dd class="col-8"><ul class="mb-0 ps-3">${CFG.eventos.filter((e) => cert.atividades.includes(e.id)).map((e) => `<li>${C.escaparHTML(e.titulo)} · ${e.cargaHoraria}h</li>`).join("")}</ul></dd>` : ""}
        <dt class="col-4">Evento</dt><dd class="col-8">${C.escaparHTML(CFG.evento.nomeCertificado)} · ${C.escaparHTML(CFG.evento.datasTexto)}</dd>
        <dt class="col-4">Emitido em</dt><dd class="col-8">${UI.formatarDataHora(cert.emitidoEm)}</dd>
      </dl></div>`;
  }
  document.getElementById("form-validar").addEventListener("submit", (e) => { e.preventDefault(); validar(); });
  const doLink = new URLSearchParams(location.search).get("codigo");
  if (doLink) { campo.value = doLink.toUpperCase(); validar(); }
})();
