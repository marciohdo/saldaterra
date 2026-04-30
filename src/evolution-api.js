require('./load-env');

const BASE_URL = process.env.EVOLUTION_API_URL;
const API_KEY  = process.env.EVOLUTION_API_KEY;
const INSTANCE = process.env.EVOLUTION_INSTANCE;

const HEADERS = {
  'Content-Type': 'application/json',
  apikey: API_KEY,
};

// Calcula delay de digitação baseado no tamanho da mensagem (mín 1s, máx 4s)
function typingDelay(text) {
  const ms = Math.min(Math.max(text.length * 30, 1000), 4000);
  return Math.round(ms);
}

async function sendTyping(number) {
  const url = `${BASE_URL}/chat/sendPresence/${INSTANCE}`;
  try {
    await fetch(url, {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify({ number, options: { presence: 'composing' } }),
    });
  } catch (_) {
    // não bloqueia o envio se falhar
  }
}

async function sendText(number, text) {
  const url = `${BASE_URL}/message/sendText/${INSTANCE}`;
  const delay = typingDelay(text);

  const res = await fetch(url, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify({
      number,
      text,
      options: {
        delay,          // mostra "digitando..." por este tempo antes de enviar
        presence: 'composing',
      },
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Evolution API ${res.status}: ${body}`);
  }

  return res.json();
}

module.exports = { sendText, sendTyping };
