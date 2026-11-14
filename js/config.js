/*
 * S.G.J.A — Sistema de Gestão da Jornada Acadêmica
 * Configuração central. É o único arquivo que precisa ser editado para
 * trocar banco de dados, regras de presença, e-mail e textos do certificado.
 */
window.SGJA_CONFIG = {
  evento: {
    nome: "VI Jornada Acadêmica",
    nomeCompleto: "VI Jornada Acadêmica da UNINASSAU Teresina",
    nomeCertificado: "VI Jornada Acadêmica",
    instituicao: "Centro Universitário Maurício de Nassau",
    sigla: "UNINASSAU",
    cidade: "Teresina - PI",
    datasTexto: "09 e 10 de dezembro de 2026",
    dataEmissao: "10 de dezembro de 2026",
    local: "UNINASSAU Teresina",
    cargaHorariaTotal: 20,
    // Critério do certificado: participar de pelo menos 1 dia do evento (check-in em alguma
    // atividade daquele dia). Quem cumpre recebe o certificado de 20 horas (carga total do evento).
    diasMinimosCertificado: 1,
    instagram: "https://www.instagram.com/vi_jornadaacademicauninassau/",
    doacao: "1 kg de alimento não perecível, que será doado a uma instituição beneficente",
    fusoHorario: "-03:00", // Teresina (sem horário de verão)
    tema: "Conhecimento que conecta pessoas e transforma realidades",
    assinaturas: [
      { nome: "Profª. Drª. Roselane Moita Pierot", cargo: "Reitora" },
      { nome: "Prof. [Nome do Coordenador]", cargo: "Coordenador da VI Jornada Acadêmica" }
    ]
  },

  // Programação oficial (edital, item 5). As apresentações de cada trabalho são distribuídas
  // nestas sessões pela organização (divulgação em 05/12/2026).
  eventos: [
    { id: "EV01", titulo: "Cerimônia de abertura", data: "2026-12-09", turno: "Manhã", horario: "08:30" },
    { id: "EV02", titulo: "Apresentações de trabalhos", data: "2026-12-09", turno: "Manhã", horario: "09:00 – 12:00" },
    { id: "EV03", titulo: "Apresentações de trabalhos", data: "2026-12-09", turno: "Noite", horario: "18:30 – 21:30" },
    { id: "EV04", titulo: "Apresentações de trabalhos", data: "2026-12-10", turno: "Manhã", horario: "08:30 – 12:00" },
    { id: "EV05", titulo: "Apresentações de trabalhos", data: "2026-12-10", turno: "Noite", horario: "18:00 – 20:00" },
    { id: "EV06", titulo: "Encerramento e premiação dos trabalhos", data: "2026-12-10", turno: "Noite", horario: "20:30" }
  ],

  // Cronograma oficial (edital, item 6).
  cronograma: [
    { quando: "13/11/2026", oque: "Lançamento do edital" },
    { quando: "16 a 30/11/2026", oque: "Período de submissão de trabalhos" },
    { quando: "05/12/2026", oque: "Divulgação dos trabalhos selecionados" },
    { quando: "05/12/2026", oque: "Definição de dia e horário das apresentações" },
    { quando: "09 e 10/12/2026", oque: "VI Jornada Acadêmica" },
    { quando: "A partir de 14/12/2026", oque: "Certificados disponíveis no site do evento" }
  ],

  // Submissão de trabalhos (edital, itens 1 e 2).
  submissao: {
    inicio: "2026-11-16", fim: "2026-11-30",
    bloquearForaDoPeriodo: false, // true no evento real: só aceita entre inicio e fim
    maxCaracteresResumo: 1500, minCaracteresResumo: 200,
    maxParticipantes: 10,
    maxOrientadores: 5,
    arquivo: { maxMB: 10, extensoes: ["pdf", "doc", "docx"] },
    edital: "assets/docs/edital-6-jornada-academica-2026.pdf",
    modalidades: { banner: "Pôster/Banner", oral: "Comunicação oral" },
    // Vínculo do trabalho. APIExt I, III e V: banner obrigatório. APIExt II, IV e VI: comunicação oral obrigatória.
    vinculos: [
      { id: "APIEXT1", nome: "APIExt I", modalidade: "banner" },
      { id: "APIEXT2", nome: "APIExt II", modalidade: "oral" },
      { id: "APIEXT3", nome: "APIExt III", modalidade: "banner" },
      { id: "APIEXT4", nome: "APIExt IV", modalidade: "oral" },
      { id: "APIEXT5", nome: "APIExt V", modalidade: "banner" },
      { id: "APIEXT6", nome: "APIExt VI", modalidade: "oral" },
      { id: "PIC", nome: "PIC (Iniciação Científica)" },
      { id: "TCC", nome: "Trabalho de Conclusão de Curso" },
      { id: "OUTRAS", nome: "Outras disciplinas" },
      { id: "EXTERNO", nome: "Trabalho externo à UNINASSAU Teresina" }
    ]
  },

  cursos: [
    "Análise e Desenvolvimento de Sistemas", "Ciência da Computação", "Sistemas de Informação",
    "Engenharia de Software", "Redes de Computadores", "Administração", "Ciências Contábeis",
    "Direito", "Enfermagem", "Fisioterapia", "Nutrição", "Odontologia", "Psicologia",
    "Biomedicina", "Farmácia", "Educação Física", "Engenharia Civil", "Arquitetura e Urbanismo",
    "Publicidade e Propaganda", "Outros"
  ],

  // Onde ficam os dados:
  //   "local"    -> DEMONSTRAÇÃO. Dados no navegador deste aparelho, PIN e segredo abaixo ficam visíveis.
  //                Não use com dados reais de alunos.
  //   "servidor" -> EVENTO REAL. Tudo passa pelo servidor (servicos/api-gateway) com login por perfil;
  //                senhas, segredos e a chave do Base44 ficam só no servidor (arquivo .env).
  backend: "local",
  servidor: {
    url: "https://SEU-SERVIDOR.onrender.com" // HTTPS obrigatório (localhost só em testes)
  },

  // E-mail no modo "local": "simulado" (só registra) ou "emailjs".
  // No modo "servidor" o envio é feito pelo servidor (SMTP do .env), sempre para o e-mail da inscrição.
  email: {
    modo: "simulado",
    emailjs: { publicKey: "", serviceId: "", templateId: "" },
    assunto: "Seu certificado — VI Jornada Acadêmica UNINASSAU"
  },

  // Lembrete por WhatsApp antes de cada atividade (enviado pelo servidor: servicos/api-gateway).
  whatsapp: {
    ativo: true,
    antecedenciaMinutos: 30
  },

  // Acesso do professor no modo "local" (DEMONSTRAÇÃO): PIN 2026.
  // No modo "servidor" a senha do professor fica só no servidor (PROFESSOR_SENHA_HASH no .env).
  painel: {
    pinHash: "158a323a7ba44870f23d96f1516dd70aa48e9a72db4ebb026b0a89e212a208ab",
    sessaoMinutos: 120
  },

  // Comissão organizadora: cada membro cria o próprio cadastro em checkin.html
  // e só registra presença depois que um professor libera o acesso no painel.
  comissao: {
    sessaoMinutos: 240
  },

  // Segredo de assinatura de QR Codes e certificados SÓ do modo "local" (demonstração).
  // No modo "servidor" o segredo fica no .env (ASSINATURA_SEGREDO) e este valor não é usado.
  segredoAssinatura: "SGJA-6JA-UNINASSAU-2026"
};
