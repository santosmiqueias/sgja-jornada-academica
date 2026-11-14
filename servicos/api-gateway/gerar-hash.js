// Gera o hash da senha do professor para colocar em PROFESSOR_SENHA_HASH no .env.
// Uso: node gerar-hash.js "uma senha forte"
// Gera também segredos aleatórios para TOKEN_SEGREDO e ASSINATURA_SEGREDO.
const crypto = require("crypto");
const { gerarHash } = require("./auth");
// Conferir: node gerar-hash.js --conferir 'senha' 'scrypt$...'  (diz se a senha bate com o hash)
if (process.argv[2] === "--conferir") {
  const { conferirHash, diagnosticarHash } = require("./auth");
  const d = diagnosticarHash(process.argv[4]);
  console.log(`Formato do hash: ${d.motivo}`);
  console.log(d.ok && conferirHash(process.argv[3] || "", process.argv[4]) ? "A senha CONFERE com o hash." : "A senha NÃO confere com o hash.");
  process.exit(0);
}
const senha = process.argv[2];
if (!senha || senha.length < 10) { console.error("Use uma senha com pelo menos 10 caracteres: node gerar-hash.js \"sua senha\""); process.exit(1); }
console.log(`PROFESSOR_SENHA_HASH=${gerarHash(senha)}`);
console.log(`TOKEN_SEGREDO=${crypto.randomBytes(32).toString("hex")}`);
console.log(`ASSINATURA_SEGREDO=${crypto.randomBytes(32).toString("hex")}`);
