/*
 * Gerador do certificado em PDF (jsPDF).
 * Usa o modelo oficial como fundo (assets/img/certificado-base.jpg, embutido em
 * js/certificado-base64.js para funcionar até abrindo o arquivo direto) e escreve
 * os dados do aluno nas posições do modelo.
 * As posições estão em pixels da imagem original (1491 x 1055) e são convertidas para mm.
 */
(function () {
  "use strict";
  const CFG = window.SGJA_CONFIG, C = window.SGJACore, UI = window.SGJA_UI;

  const IMG_W = 1491, IMG_H = 1055, PAG_W = 297, PAG_H = 210; // A4 paisagem
  const mmX = (px) => (px * PAG_W) / IMG_W;
  const mmY = (px) => (px * PAG_H) / IMG_H;
  const AZUL = [17, 34, 84];
  const CINZA = [70, 80, 110];

  function urlValidacao(codigo) {
    const base = location.href.replace(/[^/]*([?#].*)?$/, "");
    return `${base}validar.html?codigo=${encodeURIComponent(codigo)}`;
  }

  // Escreve um parágrafo centralizado com trechos em negrito, quebrando linhas pela largura.
  function paragrafoRico(doc, trechos, centroX, y, larguraMax, tamanho, entrelinha) {
    const palavras = [];
    trechos.forEach((t) => t.texto.split(/(\s+)/).filter(Boolean).forEach((p) => palavras.push({ p, negrito: !!t.negrito })));
    const largura = (w) => { doc.setFont("helvetica", w.negrito ? "bold" : "normal"); doc.setFontSize(tamanho); return doc.getTextWidth(w.p); };
    const linhas = [[]];
    let atual = 0;
    for (const w of palavras) {
      const lw = largura(w);
      const espaco = /^\s+$/.test(w.p);
      if (!espaco && atual + lw > larguraMax && linhas[linhas.length - 1].length) { linhas.push([]); atual = 0; }
      if (espaco && atual === 0) continue;
      linhas[linhas.length - 1].push({ ...w, lw });
      atual += lw;
    }
    linhas.forEach((linha, i) => {
      while (linha.length && /^\s+$/.test(linha[linha.length - 1].p)) linha.pop();
      const total = linha.reduce((s, w) => s + w.lw, 0);
      let x = centroX - total / 2;
      linha.forEach((w) => {
        doc.setFont("helvetica", w.negrito ? "bold" : "normal");
        doc.setFontSize(tamanho);
        doc.text(w.p, x, y + i * entrelinha);
        x += w.lw;
      });
    });
    return y + linhas.length * entrelinha;
  }

  /**
   * @param aluno  { nome, cpf, curso }
   * @param cert   { codigo, horas }
   * @returns jsPDF
   */
  function gerar(aluno, cert) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4", compress: true });
    const ev = CFG.evento;
    doc.setProperties({ title: `Certificado - ${aluno.nome}`, subject: ev.nomeCertificado, author: ev.instituicao, keywords: cert.codigo, creator: "S.G.J.A" });

    doc.addImage(window.SGJA_CERT_BASE64, "JPEG", 0, 0, PAG_W, PAG_H, "fundo", "FAST");
    doc.setTextColor(...AZUL);
    const cx = mmX(745);

    doc.setFont("helvetica", "normal"); doc.setFontSize(13);
    doc.text(`O ${ev.instituicao} – ${ev.sigla} Teresina certifica que`, cx, mmY(606), { align: "center" });

    // Nome: reduz a fonte até caber na linha.
    const nome = aluno.nome.toUpperCase();
    let tam = 24;
    doc.setFont("times", "bold");
    do { doc.setFontSize(tam); tam -= 0.5; } while (doc.getTextWidth(nome) > mmX(1000) && tam > 12);
    doc.text(nome, cx, mmY(652), { align: "center" });
    const larguraLinha = Math.max(doc.getTextWidth(nome) + 16, mmX(700));
    doc.setDrawColor(245, 196, 0); doc.setLineWidth(0.6);
    doc.line(cx - larguraLinha / 2, mmY(664), cx + larguraLinha / 2, mmY(664));

    const fim = paragrafoRico(doc, [
      { texto: "participou da " }, { texto: ev.nomeCertificado, negrito: true },
      { texto: ", realizada nos dias " }, { texto: ev.datasTexto, negrito: true },
      { texto: ", com carga horária de " }, { texto: `${cert.horas} horas`, negrito: true },
      { texto: `, promovida pelo ${ev.instituicao} – ${ev.cidade}.` }
    ], cx, mmY(700), mmX(1040), 13, 6.2);

    doc.setFont("helvetica", "normal"); doc.setFontSize(9.5); doc.setTextColor(...CINZA);
    doc.text(`Curso: ${aluno.curso}   ·   CPF: ${C.mascararCPFParaExibicao(aluno.cpf)}`, cx, fim + 1, { align: "center" });

    doc.setTextColor(...AZUL); doc.setFontSize(12);
    doc.text(`${ev.cidade}, ${ev.dataEmissao}.`, mmX(1340), mmY(810), { align: "right" });

    // Assinaturas (as linhas já estão no fundo).
    [531, 974].forEach((x, i) => {
      const a = ev.assinaturas[i];
      if (!a) return;
      doc.setFont("helvetica", "bold"); doc.setFontSize(10);
      doc.text(a.nome, mmX(x), mmY(866), { align: "center" });
      doc.setFont("helvetica", "normal"); doc.setFontSize(9.5);
      doc.text(a.cargo, mmX(x), mmY(888), { align: "center" });
      doc.text(ev.instituicao, mmX(x), mmY(909), { align: "center" });
      doc.text(ev.cidade, mmX(x), mmY(930), { align: "center" });
    });

    // Autenticidade: QR Code + código.
    const qr = UI.qrDataURL(urlValidacao(cert.codigo), 300);
    const q = 24;
    doc.addImage(qr, "PNG", mmX(1370) - q / 2, mmY(560), q, q);
    doc.setFontSize(7); doc.setTextColor(...CINZA);
    doc.text("Código de autenticidade", mmX(1370), mmY(560) + q + 3, { align: "center" });
    doc.setFont("courier", "bold"); doc.setFontSize(8.5); doc.setTextColor(...AZUL);
    doc.text(cert.codigo, mmX(1370), mmY(560) + q + 6.5, { align: "center" });
    doc.setFont("helvetica", "normal"); doc.setFontSize(6.5); doc.setTextColor(...CINZA);
    const site = /^https?:/.test(location.protocol) ? `${location.host}${location.pathname.replace(/[^/]*$/, "")}validar.html` : "validar.html";
    doc.text(`Valide em: ${site}`.slice(0, 60), mmX(1370), mmY(560) + q + 9.5, { align: "center" });

    return doc;
  }

  function nomeArquivo(aluno) {
    const slug = aluno.nome.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "");
    return `certificado-jornada-${slug.toLowerCase()}.pdf`;
  }

  window.SGJA_PDF = { gerar, nomeArquivo, urlValidacao };
})();
