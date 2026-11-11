/*
 * Autenticação do servidor.
 *  - Senha do professor: hash scrypt guardado no .env (PROFESSOR_SENHA_HASH), nunca a senha.
 *  - Sessões: token assinado com HMAC-SHA256 (TOKEN_SEGREDO), com perfil e validade.
 *  - Limite de tentativas por IP e bloqueio temporário por conta.
 */
const crypto = require("crypto");

const b64u = (buf) => Buffer.from(buf).toString("base64url");

function segredoToken() {
  const s = process.env.TOKEN_SEGREDO || "";
  if (s.length < 32) throw new Error("Defina TOKEN_SEGREDO no .env com pelo menos 32 caracteres aleatórios.");
  return s;
}

// Formato: scrypt$N$r$p$salt$hash (gerado por: node gerar-hash.js "sua senha")
function gerarHash(senha) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(String(senha), salt, 32, { N: 16384, r: 8, p: 1 });
  return `scrypt$16384$8$1$${b64u(salt)}$${b64u(hash)}`;
}

function conferirHash(senha, guardado) {
  const partes = String(guardado || "").split("$");
  if (partes.length !== 6 || partes[0] !== "scrypt") {
    crypto.scryptSync("x", "y", 32); // mesmo custo de tempo, mesmo sem hash válido
    return false;
  }
  const [, N, r, p, salt, hash] = partes;
  const esperado = Buffer.from(hash, "base64url");
  const calc = crypto.scryptSync(String(senha).slice(0, 200), Buffer.from(salt, "base64url"), esperado.length, { N: +N, r: +r, p: +p });
  return calc.length === esperado.length && crypto.timingSafeEqual(calc, esperado);
}

function assinarToken(dados, minutos) {
  const corpo = b64u(JSON.stringify({ ...dados, exp: Date.now() + minutos * 60000, jti: crypto.randomBytes(8).toString("hex") }));
  const assinatura = b64u(crypto.createHmac("sha256", segredoToken()).update(corpo).digest());
  return `${corpo}.${assinatura}`;
}

function lerToken(token) {
  const [corpo, assinatura] = String(token || "").split(".");
  if (!corpo || !assinatura) return null;
  const esperada = crypto.createHmac("sha256", segredoToken()).update(corpo).digest();
  const recebida = Buffer.from(assinatura, "base64url");
  if (recebida.length !== esperada.length || !crypto.timingSafeEqual(recebida, esperada)) return null;
  try {
    const dados = JSON.parse(Buffer.from(corpo, "base64url").toString("utf8"));
    return dados.exp > Date.now() ? dados : null;
  } catch (_) { return null; }
}

// Exige token válido com um dos perfis.
function exigir(...perfis) {
  return (req, res, next) => {
    const m = /^Bearer (.+)$/.exec(req.headers.authorization || "");
    const dados = m && lerToken(m[1]);
    if (!dados || !perfis.includes(dados.perfil)) return res.status(401).json({ erro: "Faça login para continuar." });
    req.sessao = dados;
    next();
  };
}

/* ---------- Limites de requisição ---------- */
function limitador(max, janelaMs, nome) {
  const contas = new Map();
  setInterval(() => { const agora = Date.now(); for (const [k, v] of contas) if (agora - v.inicio > janelaMs) contas.delete(k); }, janelaMs).unref();
  return (req, res, next) => {
    const chave = `${nome}:${req.ip}`, agora = Date.now();
    const reg = contas.get(chave) || { n: 0, inicio: agora };
    if (agora - reg.inicio > janelaMs) { reg.n = 0; reg.inicio = agora; }
    reg.n += 1; contas.set(chave, reg);
    if (reg.n > max) {
      res.setHeader("Retry-After", Math.ceil((reg.inicio + janelaMs - agora) / 1000));
      return res.status(429).json({ erro: "Muitas tentativas. Aguarde um pouco e tente de novo." });
    }
    next();
  };
}

// Bloqueio por conta: 5 erros seguidos travam a conta por 15 minutos.
const falhas = new Map();
function contaBloqueada(chave) {
  const f = falhas.get(chave);
  return !!(f && f.ate > Date.now());
}
function registrarFalha(chave) {
  const f = falhas.get(chave) || { n: 0, ate: 0 };
  f.n += 1;
  if (f.n >= 5) { f.ate = Date.now() + 15 * 60000; f.n = 0; }
  falhas.set(chave, f);
}
function limparFalhas(chave) { falhas.delete(chave); }

module.exports = { gerarHash, conferirHash, assinarToken, lerToken, exigir, limitador, contaBloqueada, registrarFalha, limparFalhas };
