// Atualiza o número de versão (?v=...) dos arquivos CSS, JS e imagens em todas as páginas.
// Rode antes de cada publicação: node scripts/versao.js
// Assim o navegador baixa os arquivos novos em vez de usar a cópia antiga guardada.
const fs = require("fs");
const path = require("path");
const raiz = path.join(__dirname, "..");
const versao = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "");
for (const arq of fs.readdirSync(raiz).filter((f) => f.endsWith(".html"))) {
  const p = path.join(raiz, arq);
  const antes = fs.readFileSync(p, "utf8");
  const depois = antes.replace(/((?:href|src)="(?:css|js|assets\/img)\/[^"?]+\.(?:css|js|jpg|png))(?:\?v=[^"]*)?"/g, `$1?v=${versao}"`);
  if (depois !== antes) { fs.writeFileSync(p, depois); console.log(`${arq}: versão ${versao}`); }
}
