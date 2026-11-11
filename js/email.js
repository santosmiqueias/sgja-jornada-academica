/*
 * Disparo do certificado por e-mail. Três modos (js/config.js → email.modo):
 *   simulado      : não envia de verdade; registra na "Caixa de saída" do painel (bom para a demo)
 *   microsservico : POST para servicos/api-gateway (Node + Nodemailer), com o PDF em base64
 *   emailjs       : envia direto do navegador pelo EmailJS (template com anexo variável "certificado")
 */
(function () {
  "use strict";
  const CFG = window.SGJA_CONFIG, API = window.SGJA_API;

  function mensagem(aluno, cert) {
    const primeiro = aluno.nome.split(" ")[0];
    return `Olá, ${primeiro}!\n\nObrigado por participar da ${CFG.evento.nome} da ${CFG.evento.sigla} Teresina.\n` +
      `Segue em anexo o seu certificado de ${cert.horas} horas.\n\n` +
      `Código de autenticidade: ${cert.codigo}\nValide em: ${window.SGJA_PDF.urlValidacao(cert.codigo)}\n\n` +
      `Até a próxima Jornada!\nComissão Organizadora — ${CFG.evento.instituicao}`;
  }

  async function enviar(aluno, cert, doc) {
    const modo = CFG.email.modo;
    const nomeArquivo = window.SGJA_PDF.nomeArquivo(aluno);
    const pdfBase64 = doc.output("datauristring").split(",")[1];
    const corpo = mensagem(aluno, cert);

    if (modo === "microsservico") {
      const resp = await fetch(CFG.email.microsservicoUrl, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ para: aluno.email, nome: aluno.nome, assunto: CFG.email.assunto, mensagem: corpo, arquivo: nomeArquivo, pdfBase64 })
      });
      if (!resp.ok) throw new Error(`Microsserviço de e-mail respondeu ${resp.status}`);
    } else if (modo === "emailjs") {
      const ej = CFG.email.emailjs;
      if (!window.emailjs || !ej.publicKey) throw new Error("EmailJS não configurado em js/config.js");
      await window.emailjs.send(ej.serviceId, ej.templateId, {
        to_email: aluno.email, to_name: aluno.nome, subject: CFG.email.assunto, message: corpo,
        certificado: `data:application/pdf;base64,${pdfBase64}`
      }, { publicKey: ej.publicKey });
    }

    await API.registrarEmail({
      para: aluno.email, nome: aluno.nome, assunto: CFG.email.assunto, mensagem: corpo,
      anexo: nomeArquivo, codigo: cert.codigo, modo, status: modo === "simulado" ? "simulado" : "enviado"
    });
    if (cert.id) await API.marcarCertificadoEnviado(cert.id);
  }

  window.SGJA_EMAIL = { enviar, mensagem };
})();
