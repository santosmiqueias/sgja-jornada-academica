// Carrega o arquivo .env (sem dependência extra). Variáveis já definidas no sistema têm prioridade.
const fs = require("fs");
const path = require("path");
const arq = path.join(__dirname, ".env");
if (fs.existsSync(arq)) {
  for (const linha of fs.readFileSync(arq, "utf8").split(/\r?\n/)) {
    const m = linha.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
  }
}
