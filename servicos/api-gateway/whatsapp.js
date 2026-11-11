/*
 * Envio de mensagens WhatsApp. Escolha o provedor em WHATSAPP_PROVEDOR (.env):
 *   simulado : só registra no console e no log (padrão, para demonstração)
 *   meta     : WhatsApp Cloud API oficial (graph.facebook.com) com modelo de mensagem aprovado
 *   twilio   : Twilio WhatsApp (funciona com o sandbox gratuito para testes)
 */
const PROVEDOR = () => (process.env.WHATSAPP_PROVEDOR || "simulado").toLowerCase();

// Meta exige "modelo de mensagem" aprovado para iniciar conversa. Ver docs/whatsapp.md.
async function enviarMeta(telefone, dados) {
  const { WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID } = process.env;
  if (!WHATSAPP_TOKEN || !WHATSAPP_PHONE_NUMBER_ID) throw new Error("Configure WHATSAPP_TOKEN e WHATSAPP_PHONE_NUMBER_ID");
  const versao = process.env.WHATSAPP_API_VERSAO || "v21.0";
  const parametros = [dados.nome, String(dados.minutos), dados.titulo, dados.hora, dados.sala].map((text) => ({ type: "text", text }));
  const r = await fetch(`https://graph.facebook.com/${versao}/${WHATSAPP_PHONE_NUMBER_ID}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp", to: telefone, type: "template",
      template: {
        name: process.env.WHATSAPP_TEMPLATE || "lembrete_atividade",
        language: { code: process.env.WHATSAPP_IDIOMA || "pt_BR" },
        components: [{ type: "body", parameters: parametros }]
      }
    })
  });
  const corpo = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Meta ${r.status}: ${corpo.error?.message || "erro desconhecido"}`);
  return corpo.messages?.[0]?.id || "ok";
}

async function enviarTwilio(telefone, dados) {
  const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM } = process.env;
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_WHATSAPP_FROM) throw new Error("Configure TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN e TWILIO_WHATSAPP_FROM");
  const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: "Basic " + Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString("base64"),
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({ From: `whatsapp:${TWILIO_WHATSAPP_FROM}`, To: `whatsapp:+${telefone}`, Body: dados.texto })
  });
  const corpo = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Twilio ${r.status}: ${corpo.message || "erro desconhecido"}`);
  return corpo.sid;
}

async function enviar(telefone, dados) {
  const p = PROVEDOR();
  if (p === "meta") return { status: "enviado", id: await enviarMeta(telefone, dados) };
  if (p === "twilio") return { status: "enviado", id: await enviarTwilio(telefone, dados) };
  console.log(`[WhatsApp simulado] para +${telefone}:\n${dados.texto}\n`);
  return { status: "simulado", id: null };
}

module.exports = { enviar, provedor: PROVEDOR };
