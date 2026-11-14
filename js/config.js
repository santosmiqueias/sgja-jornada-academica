/*
 * S.G.J.A — Sistema de Gestão da Jornada Acadêmica
 * Configuração central. É o único arquivo que precisa ser editado para
 * trocar banco de dados, regras de presença, e-mail e textos do certificado.
 */
window.SGJA_CONFIG = {
  evento: {
    nome: "6ª Jornada Acadêmica",
    nomeCompleto: "6ª Jornada Acadêmica da UNINASSAU Teresina",
    nomeCertificado: "6ª Jornada Acadêmica",
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
    assinaturas: [
      { nome: "Profª. Drª. Roselane Moita Pierot", cargo: "Reitora" },
      { nome: "Prof. [Nome do Coordenador]", cargo: "Coordenador da 6ª Jornada Acadêmica" }
    ]
  },

  // Catálogo de atividades (tabela Eventos). A soma das cargas é a carga total.
  eventos: [
    { id: "EV01", titulo: "Abertura e Palestra Magna", data: "2026-12-09", turno: "Manhã", horario: "08:00 – 12:00", sala: "Auditório Principal", cargaHoraria: 4 },
    { id: "EV02", titulo: "Oficinas Práticas e Minicursos", data: "2026-12-09", turno: "Tarde", horario: "14:00 – 18:00", sala: "Laboratórios Bloco B", cargaHoraria: 4 },
    { id: "EV03", titulo: "Mostra Científica de Pesquisa e Extensão", data: "2026-12-09", turno: "Noite", horario: "19:00 – 21:00", sala: "Hall Central", cargaHoraria: 2 },
    { id: "EV04", titulo: "Painel Inovação e Mercado de Tecnologia", data: "2026-12-10", turno: "Manhã", horario: "08:00 – 12:00", sala: "Auditório Principal", cargaHoraria: 4 },
    { id: "EV05", titulo: "Hackathon e Apresentação de Projetos", data: "2026-12-10", turno: "Tarde", horario: "14:00 – 18:00", sala: "Laboratórios Bloco B", cargaHoraria: 4 },
    { id: "EV06", titulo: "Premiação e Encerramento", data: "2026-12-10", turno: "Noite", horario: "19:00 – 21:00", sala: "Auditório Principal", cargaHoraria: 2 }
  ],

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
    assunto: "Seu certificado — 6ª Jornada Acadêmica UNINASSAU"
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
