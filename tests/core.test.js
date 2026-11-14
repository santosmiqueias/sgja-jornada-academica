// Testes unitários das regras de negócio. Rodar: node --test tests/
const test = require("node:test");
const assert = require("node:assert/strict");
const C = require("../js/core.js");

test("CPF: aceita válidos, com ou sem máscara", () => {
  assert.equal(C.validarCPF("529.982.247-25"), true);
  assert.equal(C.validarCPF("52998224725"), true);
  assert.equal(C.validarCPF("111.444.777-35"), true);
});

test("CPF: rejeita dígito errado, sequências, letras e tamanho", () => {
  assert.equal(C.validarCPF("529.982.247-24"), false);
  assert.equal(C.validarCPF("111.111.111-11"), false);
  assert.equal(C.validarCPF("abc.def.ghi-jk"), false);
  assert.equal(C.validarCPF("1234567890"), false);
  assert.equal(C.validarCPF(""), false);
  assert.equal(C.validarCPF(null), false);
});

test("Máscaras descartam letras e formatam", () => {
  assert.equal(C.mascaraCPF("529a98b2247c25"), "529.982.247-25");
  assert.equal(C.mascaraTelefone("86999998888"), "(86) 99999-8888");
  assert.equal(C.mascaraTelefone("8632211234"), "(86) 3221-1234");
  assert.equal(C.mascaraMatricula("ab2026x0001"), "20260001");
});

test("Nome exige nome e sobrenome, sem números", () => {
  assert.equal(C.validarNome("Maria Silva"), true);
  assert.equal(C.validarNome("José D'Ávila"), true);
  assert.equal(C.validarNome("Maria"), false);
  assert.equal(C.validarNome("Maria 123"), false);
  assert.equal(C.validarNome("<script>x</script> a"), false);
  assert.equal(C.capitalizarNome("  maria   DA silva "), "Maria da Silva");
});

test("E-mail e telefone", () => {
  assert.equal(C.validarEmail("aluno@uninassau.edu.br"), true);
  assert.equal(C.validarEmail("aluno@"), false);
  assert.equal(C.validarEmail("a b@x.com"), false);
  assert.equal(C.validarTelefone("(86) 99999-8888"), true);
  assert.equal(C.validarTelefone("(86) 89999-8888"), false); // celular sem o 9
  assert.equal(C.validarTelefone("123"), false);
});

test("CPF mascarado para exibição (LGPD)", () => {
  assert.equal(C.mascararCPFParaExibicao("52998224725"), "***.982.247-**");
});

const eventos = [
  { id: "A", cargaHoraria: 4 }, { id: "B", cargaHoraria: 4 }, { id: "C", cargaHoraria: 2 },
  { id: "D", cargaHoraria: 4 }, { id: "E", cargaHoraria: 4 }, { id: "F", cargaHoraria: 2 }
];

test("Horas: soma cada atividade uma vez e ignora outros alunos", () => {
  const freqs = [
    { alunoId: "x", eventoId: "A" }, { alunoId: "x", eventoId: "A" }, // duplicado
    { alunoId: "x", eventoId: "C" }, { alunoId: "y", eventoId: "B" }, { alunoId: "x", eventoId: "Z" }
  ];
  assert.deepEqual(C.calcularHoras(freqs, eventos, "x"), { horas: 6, atividades: ["A", "C"] });
});

test("Certificado: check-in em pelo menos 50% das atividades (3 de 6)", () => {
  assert.equal(C.atividadesMinimas(6, 50), 3);
  assert.equal(C.atividadesMinimas(5, 50), 3); // número ímpar arredonda para cima
  assert.equal(C.atividadesMinimas(1, 50), 1);
  assert.equal(C.situacaoAluno(3, 6, 50, 10).aprovado, true);  // exemplo do enunciado
  assert.equal(C.situacaoAluno(6, 6, 50, 20).aprovado, true);
  assert.equal(C.situacaoAluno(2, 6, 50, 8).aprovado, false);
  assert.equal(C.situacaoAluno(2, 6, 50, 8).faltam, 1);
  assert.equal(C.situacaoAluno(0, 6, 50).faltam, 3);
  assert.equal(C.situacaoAluno(3, 6, 50, 10).horas, 10);
});

test("Certificado: 3 atividades curtas já bastam (conta atividades, não horas)", () => {
  const evs = [
    { id: "A", cargaHoraria: 4 }, { id: "B", cargaHoraria: 4 }, { id: "C", cargaHoraria: 2 },
    { id: "D", cargaHoraria: 4 }, { id: "E", cargaHoraria: 4 }, { id: "F", cargaHoraria: 2 }
  ];
  const freqs = ["C", "F", "A"].map((eventoId) => ({ alunoId: "x", eventoId }));
  const { horas, atividades } = C.calcularHoras(freqs, evs, "x");
  const s = C.situacaoAluno(atividades.length, evs.length, 50, horas);
  assert.equal(s.aprovado, true);
  assert.equal(s.horas, 8);
});

test("QR Code do ingresso: gera, lê e detecta adulteração", async () => {
  const token = await C.gerarTokenIngresso("AL123", "529.982.247-25", "segredo");
  assert.match(token, /^SGJA\|AL123\|[a-f0-9]{16}$/);
  assert.deepEqual(C.lerTokenIngresso(token).alunoId, "AL123");
  assert.equal(C.lerTokenIngresso("qualquer coisa"), null);
  const outro = await C.gerarTokenIngresso("AL123", "111.444.777-35", "segredo");
  assert.notEqual(token, outro);
});

test("Código do certificado é estável e no formato XXXX-XXXX-XXXX", async () => {
  const a = await C.gerarCodigoCertificado("AL1", "52998224725", 18, "s");
  const b = await C.gerarCodigoCertificado("AL1", "52998224725", 18, "s");
  assert.equal(a, b);
  assert.match(a, /^[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}$/);
});

test("Escape de HTML contra XSS", () => {
  assert.equal(C.escaparHTML('<img src=x onerror="alert(1)">'), "&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
});

test("Colar dados com sujeira: CPF com texto e telefone com +55", () => {
  assert.equal(C.mascaraCPF("CPF: 529.982.247-25"), "529.982.247-25");
  assert.equal(C.mascaraTelefone("+55 (86) 99999-8888"), "(86) 99999-8888");
});

test("Senha da comissão: regras e hash PBKDF2", async () => {
  assert.equal(C.validarSenha("jornada2026"), true);
  assert.equal(C.validarSenha("curta1"), false);
  assert.equal(C.validarSenha("somenteletras"), false);
  assert.equal(C.validarSenha("12345678"), false);
  const salt = C.gerarSalt();
  assert.match(salt, /^[a-f0-9]{32}$/);
  const h = await C.hashSenha("jornada2026", salt);
  assert.match(h, /^[a-f0-9]{64}$/);
  assert.equal(h, await C.hashSenha("jornada2026", salt));
  assert.notEqual(h, await C.hashSenha("jornada2027", salt));
  assert.notEqual(h, await C.hashSenha("jornada2026", C.gerarSalt())); // mesmo texto, salt diferente
});

test("Certificado: participar de 1 dia do evento dá o certificado de 20 horas", () => {
  const evs = [
    { id: "A", data: "2026-12-09", cargaHoraria: 4 }, { id: "B", data: "2026-12-09", cargaHoraria: 4 }, { id: "C", data: "2026-12-09", cargaHoraria: 2 },
    { id: "D", data: "2026-12-10", cargaHoraria: 4 }, { id: "E", data: "2026-12-10", cargaHoraria: 4 }, { id: "F", data: "2026-12-10", cargaHoraria: 2 }
  ];
  const f = (ids) => ids.map((eventoId) => ({ alunoId: "x", eventoId }));
  const nenhum = C.avaliarCertificado(f([]), evs, "x", 1, 20);
  assert.equal(nenhum.aprovado, false);
  assert.equal(nenhum.faltam, 1);
  const umaAtividade = C.avaliarCertificado(f(["F"]), evs, "x", 1, 20);
  assert.equal(umaAtividade.aprovado, true);
  assert.equal(umaAtividade.horasCertificado, 20);
  assert.equal(umaAtividade.dias, 1);
  const doisDias = C.avaliarCertificado(f(["A", "D", "D"]), evs, "x", 1, 20);
  assert.deepEqual([doisDias.dias, doisDias.feitas, doisDias.totalDias, doisDias.horas], [2, 2, 2, 8]);
  assert.equal(C.avaliarCertificado(f(["A"]), evs, "x", 2, 20).aprovado, false); // se exigirem 2 dias
});
