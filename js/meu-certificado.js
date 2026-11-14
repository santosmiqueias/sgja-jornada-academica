/* Meu certificado: o participante se identifica com CPF + e-mail da inscrição. */
(function () {
  "use strict";
  const C = window.SGJACore, API = window.SGJA_API, UI = window.SGJA_UI, CFG = window.SGJA_CONFIG;
  const $ = (id) => document.getElementById(id);
  const esc = C.escaparHTML;
  const res = $("resultado");
  $("cpf").addEventListener("input", (e) => (e.target.value = C.mascaraCPF(e.target.value)));

  let atual = null; // { cpf, email, aluno, sit }

  $("form-consulta").addEventListener("submit", async (e) => {
    e.preventDefault();
    const cpf = $("cpf").value, email = $("email").value.trim();
    const okCpf = C.validarCPF(cpf), okEmail = C.validarEmail(email);
    $("cpf").classList.toggle("is-invalid", !okCpf);
    $("email").classList.toggle("is-invalid", !okEmail);
    if (!okCpf || !okEmail) return;
    UI.carregando($("btn-consultar"), true, "Consultando...");
    try {
      const r = await API.consultarParticipante(cpf, email);
      atual = { cpf, email, aluno: r.aluno, sit: r.situacao };
      desenhar(r.aluno, r.situacao, r.trabalhos || []);
    } catch (err) {
      atual = null;
      if (err instanceof API.ErroNegocio && err.status !== 0) {
        res.innerHTML = `<div class="alert alert-warning">${esc(err.message)} Confira os dados ou <a href="submissao.html" class="alert-link">submeta um trabalho</a>.</div>`;
      } else { UI.aviso(err.message || "Erro ao consultar. Tente novamente.", "erro"); }
    } finally { UI.carregando($("btn-consultar"), false); }
  });

  const STATUS = { em_analise: ["Em análise pela banca", "badge-pend"], aprovado: ["Aprovado", "badge-ok"], reprovado: ["Não aprovado", "text-bg-danger"] };
  function blocoTrabalhos(trabalhos) {
    if (!trabalhos.length) return "";
    const itens = trabalhos.map((t) => {
      const [rotulo, cor] = STATUS[t.status] || [t.status, "text-bg-light"];
      const ev = t.sessao && API.eventos().find((e) => e.id === t.sessao);
      const quando = ev ? `${UI.formatarData(ev.data)} · ${esc(ev.turno)} · ${esc(ev.horario)}${t.horarioApresentacao ? ` · ${esc(t.horarioApresentacao)}` : ""}` : "";
      return `<li class="list-group-item px-0">
        <div class="d-flex justify-content-between gap-2 flex-wrap"><strong>${esc(t.titulo)}</strong><span class="badge ${cor}">${rotulo}${t.apresentado ? " · apresentado" : ""}</span></div>
        <div class="small text-muted">Protocolo ${esc(t.protocolo)} · ${esc(t.modalidadeNome)} · ${esc(t.vinculo)}</div>
        ${quando ? `<div class="small mt-1"><i class="bi bi-calendar-check me-1" aria-hidden="true"></i>Apresentação: ${quando}</div>` : ""}
        ${t.parecer ? `<div class="small mt-1"><i class="bi bi-chat-left-text me-1" aria-hidden="true"></i>Parecer da banca: ${esc(t.parecer)}</div>` : ""}
      </li>`;
    }).join("");
    return `<h3 class="h6 fw-bold mt-4">Seus trabalhos</h3><ul class="list-group list-group-flush">${itens}</ul>`;
  }

  function desenhar(aluno, sit, trabalhos) {
    const pct = Math.min(100, Math.round((sit.dias / sit.minimo) * 100));
    const linhas = API.eventos().map((ev) => {
      const foi = sit.atividades.includes(ev.id);
      const inscrito = (aluno.atividades || []).includes(ev.id);
      return `<li class="list-group-item d-flex justify-content-between align-items-center">
        <span><i class="bi ${foi ? "bi-check-circle-fill text-success" : "bi-circle text-secondary"} me-2" aria-hidden="true"></i>${esc(ev.titulo)}
        <span class="small text-muted d-block ms-4">${UI.formatarData(ev.data)} · ${esc(ev.horario)}${inscrito ? ' · <i class="bi bi-bookmark-check"></i> sua apresentação' : ""}</span></span>
        <span class="badge ${foi ? "badge-ok" : "badge-pend"}">${foi ? "Presente" : "Sem registro"}</span></li>`;
    }).join("");

    const blocoCert = sit.aprovado
      ? `<div class="alert alert-success d-flex gap-2 align-items-center"><i class="bi bi-award fs-3"></i><div><strong>Parabéns! Certificado liberado.</strong><br>Você participou de ${sit.dias} de ${sit.totalDias} dias do evento (${sit.feitas} atividades). Seu certificado é de ${sit.horasCertificado} horas.</div></div>
         <div class="d-flex flex-wrap gap-2">
           <button class="btn btn-amarelo btn-lg" id="btn-baixar"><i class="bi bi-file-earmark-pdf me-1"></i>Baixar certificado (PDF)</button>
           <button class="btn btn-outline-primary btn-lg" id="btn-email"><i class="bi bi-envelope me-1"></i>Enviar para meu e-mail</button>
         </div>`
      : `<div class="alert alert-warning"><i class="bi bi-hourglass-split me-1"></i>Certificado ainda não liberado: ainda não há presença registrada. Basta participar de <strong>pelo menos ${sit.minimo} dia</strong> do evento para receber o certificado de ${sit.horasCertificado} horas.</div>`;

    res.innerHTML = `
      <div class="card p-4 p-md-5">
        <div class="d-flex flex-column flex-md-row gap-4 align-items-md-center">
          <div class="flex-grow-1">
            <h2 class="h4 fw-bold text-navy mb-1">${esc(aluno.nome)}</h2>
            <div class="text-muted small">${esc(aluno.curso)} · Matrícula ${esc(aluno.matricula)} · CPF ${C.mascararCPFParaExibicao(aluno.cpf)}</div>
            <div class="mt-3 d-flex justify-content-between small fw-semibold"><span>Dias com presença</span><span>${sit.dias} de ${sit.totalDias} · ${sit.feitas} atividade(s)</span></div>
            <div class="progress mt-1" role="progressbar" aria-label="Dias com presença" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><div class="progress-bar ${sit.aprovado ? "bg-success" : ""}" style="width:${pct}%"></div></div>
            <div class="small text-muted mt-1">Critério: participar de pelo menos ${sit.minimo} dia do evento. Certificado de ${sit.horasCertificado} horas.</div>
          </div>
          <div class="ingresso p-3 text-center">
            <img id="qr" alt="QR Code do seu ingresso" width="150" height="150" style="width:150px;height:150px">
            <div class="small fw-semibold mt-1">Seu ingresso (credenciamento)</div>
          </div>
        </div>
        <hr class="my-4">
        ${blocoCert}
        ${blocoTrabalhos(trabalhos)}
        <h3 class="h6 fw-bold mt-4">Sua presença na programação</h3>
        <ul class="list-group list-group-flush">${linhas}</ul>
      </div>`;
    if (aluno.tokenIngresso) $("qr").src = UI.qrDataURL(aluno.tokenIngresso, 300);
    if (sit.aprovado) {
      $("btn-baixar").addEventListener("click", baixar);
      $("btn-email").addEventListener("click", enviarEmail);
    }
  }

  async function prepararPDF() {
    const cert = await API.emitirCertificadoParticipante(atual.cpf, atual.email);
    return { cert, doc: window.SGJA_PDF.gerar(atual.aluno, cert) };
  }

  async function baixar(e) {
    const b = e.currentTarget;
    UI.carregando(b, true, "Gerando PDF...");
    try {
      const { doc } = await prepararPDF();
      doc.save(window.SGJA_PDF.nomeArquivo(atual.aluno));
      UI.aviso("Certificado gerado!", "sucesso");
    } catch (err) { console.error(err); UI.aviso(err.message || "Falha ao gerar o certificado.", "erro"); }
    finally { UI.carregando(b, false); }
  }

  async function enviarEmail(e) {
    const b = e.currentTarget;
    UI.carregando(b, true, "Enviando...");
    try {
      const { cert, doc } = await prepararPDF();
      const r = await API.enviarCertificadoParticipante(atual.cpf, atual.email, atual.aluno, cert, doc);
      UI.aviso(`Certificado enviado para ${r.para}`, "sucesso");
    } catch (err) { console.error(err); UI.aviso(err.message || "Não foi possível enviar o e-mail agora.", "erro"); }
    finally { UI.carregando(b, false); }
  }
})();
