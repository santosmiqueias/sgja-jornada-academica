/*
 * S.G.J.A — Sistema de Gestão da Jornada Acadêmica
 * Configuração central. É o único arquivo que precisa ser editado para
 * trocar banco de dados, regras de presença, e-mail e textos do certificado.
 */
window.SGJA_CONFIG = {
  evento: {
    nome: "6ª Jornada Acadêmica",
    nomeCertificado: "VI Jornada Acadêmica",
    instituicao: "Centro Universitário Maurício de Nassau",
    sigla: "UNINASSAU",
    cidade: "Teresina - PI",
    datasTexto: "09 e 10 de dezembro de 2026",
    dataEmissao: "10 de dezembro de 2026",
    local: "UNINASSAU Teresina",
    cargaHorariaTotal: 20,
    // Critério do certificado: check-in em pelo menos 50% das atividades ofertadas
    // (6 atividades → mínimo de 3). O certificado mostra as horas efetivamente cumpridas.
    percentualMinimoAtividades: 50,
    fusoHorario: "-03:00", // Teresina (sem horário de verão)
    assinaturas: [
      { nome: "Prof. Dr. [Nome do Reitor]", cargo: "Reitor" },
      { nome: "Prof. [Nome do Coordenador]", cargo: "Coordenador da VI Jornada Acadêmica" }
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
    "Publicidade e Propaganda", "Outro"
  ],

  // Banco de dados: "local" (demonstração, salva no navegador) ou "base44".
  backend: "local",
  base44: {
    // Painel do Base44 → app → Settings → API. Em produção, não exponha a chave
    // no front-end: use o microsserviço (servicos/api-gateway) como proxy.
    appId: "",
    apiKey: "",
    baseUrl: "https://app.base44.com/api/apps"
  },

  // Envio de e-mail: "simulado" (registra na caixa de saída), "microsservico" ou "emailjs".
  email: {
    modo: "simulado",
    microsservicoUrl: "http://localhost:3000/api/v1/certificados/enviar",
    emailjs: { publicKey: "", serviceId: "", templateId: "" },
    assunto: "Seu certificado — 6ª Jornada Acadêmica UNINASSAU"
  },

  // Lembrete por WhatsApp antes de cada atividade (enviado pelo servidor: servicos/api-gateway).
  whatsapp: {
    ativo: true,
    antecedenciaMinutos: 30,
    servidorUrl: "http://localhost:3000" // microsserviço que agenda e envia
  },

  // Acesso do professor ao painel. Guarda só o hash SHA-256 do PIN, nunca o PIN.
  // PIN padrão de demonstração: 2026  (troque gerando um novo hash, veja docs/seguranca.md)
  painel: {
    pinHash: "158a323a7ba44870f23d96f1516dd70aa48e9a72db4ebb026b0a89e212a208ab",
    sessaoMinutos: 120
  },

  // Segredo usado para assinar QR Codes e códigos de certificado.
  segredoAssinatura: "SGJA-6JA-UNINASSAU-2026"
};
