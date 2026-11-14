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

    // O QR Code de autenticidade fica no verso.
    const site = /^https?:/.test(location.protocol) ? `${location.host}${location.pathname.replace(/[^/]*$/, "")}validar.html` : "validar.html";

    desenharVerso(doc, aluno, cert, site);
    return doc;
  }

  /*
   * Verso: programação completa do evento (todas as atividades ofertadas, somando a carga total),
   * com a coluna Presença marcando onde o participante fez check-in. Serve para o Currículo Lattes.
   * cert.atividades = ids dos eventos com presença.
   */
  function desenharVerso(doc, aluno, cert, site) {
    const ev = CFG.evento;
    const AMARELO = [245, 196, 0], CLARO = [242, 245, 251], BORDA = [214, 220, 234], VERDE = [20, 108, 67];
    const ids = Array.isArray(cert.atividades) ? cert.atividades : [];
    const todas = CFG.eventos;
    const feitas = todas.filter((e) => ids.includes(e.id));
    const totalEvento = CFG.evento.cargaHorariaTotal;
    
    const M = 18;                                   // margem lateral
    doc.addPage("a4", "landscape");

    // Cabeçalho azul com faixa amarela
    doc.setFillColor(...AZUL); doc.rect(0, 0, PAG_W, 26, "F");
    doc.setFillColor(...AMARELO); doc.rect(0, 26, PAG_W, 1.6, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold"); doc.setFontSize(16);
    doc.text("Programação do evento", M, 13);
    doc.setFont("helvetica", "normal"); doc.setFontSize(10);
    doc.text(`${ev.nomeCertificado} · ${ev.datasTexto} · ${ev.instituicao} – ${ev.cidade} · carga horária total de ${totalEvento} horas`, M, 20);

    // Participante
    let y = 40;
    doc.setTextColor(...CINZA); doc.setFontSize(8.5);
    doc.text("PARTICIPANTE", M, y);
    doc.text("CURSO", 150, y);
    doc.text("CPF", 240, y);
    doc.setTextColor(...AZUL); doc.setFont("helvetica", "bold"); doc.setFontSize(12);
    doc.text(doc.splitTextToSize(aluno.nome.toUpperCase(), 128)[0], M, y + 6);
    doc.setFont("helvetica", "normal"); doc.setFontSize(11);
    doc.text(doc.splitTextToSize(aluno.curso, 86)[0], 150, y + 6);
    doc.text(C.mascararCPFParaExibicao(aluno.cpf), 240, y + 6);

    // Tabela com todas as atividades ofertadas
    const col = { atividade: M + 3, data: 150, horario: 186, presenca: PAG_W - M - 13 };
    const topo = 56;
    y = topo;
    doc.setFillColor(...AZUL); doc.rect(M, y, PAG_W - 2 * M, 9, "F");
    doc.setTextColor(255, 255, 255); doc.setFont("helvetica", "bold"); doc.setFontSize(9.5);
    doc.text("Atividade", col.atividade, y + 6);
    doc.text("Data", col.data, y + 6);
    doc.text("Horário", col.horario, y + 6);
    doc.text("Presença", col.presenca, y + 6, { align: "center" });
    y += 9;

    doc.setFont("helvetica", "normal"); doc.setFontSize(10);
    todas.forEach((e, i) => {
      const linhas = doc.splitTextToSize(e.titulo, col.data - col.atividade - 6);
      const h = Math.max(9, 4 + linhas.length * 4.6);
      if (i % 2 === 0) { doc.setFillColor(...CLARO); doc.rect(M, y, PAG_W - 2 * M, h, "F"); }
      doc.setTextColor(...AZUL);
      doc.text(linhas, col.atividade, y + 6);
      doc.setTextColor(...CINZA);
      doc.text(UI.formatarData(e.data), col.data, y + 6);
      doc.text(`${e.horario} (${e.turno})`, col.horario, y + 6);
      doc.setFont("helvetica", "bold");
      if (ids.includes(e.id)) { doc.setTextColor(...VERDE); doc.text("Presente", col.presenca, y + 6, { align: "center" }); }
      else { doc.setFont("helvetica", "normal"); doc.setTextColor(...CINZA); doc.text("—", col.presenca, y + 6, { align: "center" }); }
      doc.setFont("helvetica", "normal");
      y += h;
    });
    doc.setDrawColor(...BORDA); doc.setLineWidth(0.3); doc.rect(M, topo, PAG_W - 2 * M, y - topo);

    // Totais: carga do evento e participação
    doc.setFillColor(255, 246, 204); doc.rect(M, y, PAG_W - 2 * M, 11, "F");
    doc.setDrawColor(...AMARELO); doc.setLineWidth(0.6); doc.line(M, y, PAG_W - M, y);
    doc.setTextColor(...AZUL); doc.setFont("helvetica", "bold"); doc.setFontSize(11);
    doc.text(`Carga horária total do evento: ${totalEvento} horas`, col.atividade, y + 7.3);
    const diasPresenca = new Set(feitas.map((e) => e.data)).size, diasEvento = new Set(todas.map((e) => e.data)).size;
    doc.text(`Presença: ${feitas.length} de ${todas.length} atividades, em ${diasPresenca} de ${diasEvento} dias`, PAG_W - M - 3, y + 7.3, { align: "right" });
    y += 11;

    // Trabalhos apresentados pelo participante (validados pela organização)
    const trabs = Array.isArray(cert.trabalhos) ? cert.trabalhos : [];
    if (trabs.length) {
      y += 7;
      doc.setTextColor(...AZUL); doc.setFont("helvetica", "bold"); doc.setFontSize(10.5);
      doc.text(trabs.length > 1 ? "Trabalhos apresentados" : "Trabalho apresentado", M, y + 4);
      doc.setFont("helvetica", "normal"); doc.setFontSize(10);
      trabs.slice(0, 3).forEach((t) => {
        const linhas = doc.splitTextToSize(`• “${t.titulo}” — ${t.modalidade}`, PAG_W - 2 * M - 60);
        doc.text(linhas, M, y + 10);
        y += 5 * linhas.length;
      });
      y += 6;
    }

    // Critério e autenticidade
    doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); doc.setTextColor(...CINZA);
    const minimo = Math.max(1, Number(ev.diasMinimosCertificado) || 1);
    doc.text(`Critério para o certificado: participação em pelo menos ${minimo} dia do evento, com certificado da carga horária total de ${totalEvento} horas.`, M, y + 8);

    // QR Code de autenticidade (canto inferior direito, acima do rodapé)
    const q = 34;
    const qx = PAG_W - M - q, qy = PAG_H - 14 - q - 16; // posição fixa, acima do rodapé (o texto à esquerda não chega até aqui)
    doc.setDrawColor(...BORDA); doc.setLineWidth(0.3);
    doc.roundedRect(qx - 4, qy - 4, q + 8, q + 15, 2, 2);
    doc.addImage(UI.qrDataURL(urlValidacao(cert.codigo), 300), "PNG", qx, qy, q, q);
    doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); doc.setTextColor(...CINZA);
    doc.text("Escaneie para validar", qx + q / 2, qy + q + 4, { align: "center" });
    doc.setFont("courier", "bold"); doc.setFontSize(9); doc.setTextColor(...AZUL);
    doc.text(cert.codigo, qx + q / 2, qy + q + 8.5, { align: "center" });
    doc.setFont("helvetica", "normal");

    doc.setFillColor(...AZUL); doc.rect(0, PAG_H - 14, PAG_W, 14, "F");
    doc.setTextColor(255, 255, 255); doc.setFontSize(9);
    doc.text(`Código de autenticidade: ${cert.codigo}`, M, PAG_H - 5.5);
    doc.text(`Valide em: ${site}`.slice(0, 80), PAG_W - M, PAG_H - 5.5, { align: "right" });
  }

  function nomeArquivo(aluno) {
    const slug = aluno.nome.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "");
    return `certificado-jornada-${slug.toLowerCase()}.pdf`;
  }

  window.SGJA_PDF = { gerar, nomeArquivo, urlValidacao };
})();
