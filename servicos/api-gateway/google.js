/*
 * Login com Google da comissão organizadora.
 * O navegador recebe do Google um "ID token" (JWT assinado pelo Google) e o envia a este servidor,
 * que confere TUDO antes de confiar nele:
 *   - assinatura RS256 com as chaves públicas do Google (https://www.googleapis.com/oauth2/v3/certs);
 *   - emissor (accounts.google.com), destinatário (o nosso GOOGLE_CLIENT_ID) e validade;
 *   - e-mail verificado pelo Google.
 * Sem GOOGLE_CLIENT_ID no .env, o login com Google fica desligado.
 */
const crypto = require("crypto");

const URL_CHAVES = "https://www.googleapis.com/oauth2/v3/certs";
const EMISSORES = ["accounts.google.com", "https://accounts.google.com"];
const FOLGA_RELOGIO_S = 60;

let cache = { chaves: null, ate: 0 };
let buscarChaves = async () => {
  const r = await fetch(URL_CHAVES);
  if (!r.ok) throw new Error(`Google respondeu ${r.status} ao buscar as chaves`);
  const idade = /max-age=(\d+)/.exec(r.headers.get("cache-control") || "");
  return { chaves: (await r.json()).keys || [], validadeS: idade ? Number(idade[1]) : 3600 };
};

async function chavePorId(kid) {
  const agora = Date.now();
  if (!cache.chaves || agora > cache.ate || !cache.chaves.some((k) => k.kid === kid)) {
    const { chaves, validadeS } = await buscarChaves();
    cache = { chaves, ate: agora + Math.min(validadeS, 86400) * 1000 };
  }
  return cache.chaves.find((k) => k.kid === kid) || null;
}

function erro(msg) { const e = new Error(msg); e.status = 401; e.publico = "Não foi possível confirmar sua conta Google. Tente de novo."; return e; }

const ativo = () => !!(process.env.GOOGLE_CLIENT_ID || "").trim();

async function verificarCredencial(credencial) {
  const clientId = (process.env.GOOGLE_CLIENT_ID || "").trim();
  if (!clientId) { const e = new Error("Login com Google não configurado."); e.status = 503; e.publico = e.message; throw e; }
  const partes = String(credencial || "").split(".");
  if (partes.length !== 3 || partes.some((p) => !/^[A-Za-z0-9_-]+$/.test(p))) throw erro("formato inválido");
  let cab, dados;
  try {
    cab = JSON.parse(Buffer.from(partes[0], "base64url").toString("utf8"));
    dados = JSON.parse(Buffer.from(partes[1], "base64url").toString("utf8"));
  } catch (_) { throw erro("JSON inválido"); }
  if (cab.alg !== "RS256" || !cab.kid) throw erro("algoritmo não aceito");
  const jwk = await chavePorId(cab.kid);
  if (!jwk) throw erro("chave desconhecida");
  const chave = crypto.createPublicKey({ key: jwk, format: "jwk" });
  const ok = crypto.verify("RSA-SHA256", Buffer.from(`${partes[0]}.${partes[1]}`), chave, Buffer.from(partes[2], "base64url"));
  if (!ok) throw erro("assinatura inválida");
  const agora = Math.floor(Date.now() / 1000);
  if (!EMISSORES.includes(dados.iss)) throw erro("emissor inválido");
  if (dados.aud !== clientId) throw erro("destinatário inválido");
  if (!(Number(dados.exp) > agora - FOLGA_RELOGIO_S)) throw erro("token expirado");
  if (dados.iat && Number(dados.iat) > agora + FOLGA_RELOGIO_S) throw erro("token do futuro");
  if (dados.email_verified !== true && dados.email_verified !== "true") throw erro("e-mail não verificado");
  if (!dados.sub || !dados.email) throw erro("dados incompletos");
  return { sub: String(dados.sub), email: String(dados.email), nome: String(dados.name || "") };
}

// Só para os testes: troca a origem das chaves públicas.
function _definirBuscaDeChaves(fn) { buscarChaves = fn; cache = { chaves: null, ate: 0 }; }

module.exports = { ativo, verificarCredencial, _definirBuscaDeChaves };
