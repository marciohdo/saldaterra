// Cliente para a Evolution API (WhatsApp)
const BASE_URL = process.env.EVOLUTION_API_URL;
const API_KEY = process.env.EVOLUTION_API_KEY;
const INSTANCE = process.env.EVOLUTION_INSTANCE;

async function sendText(number, text) {
  const url = `${BASE_URL}/message/sendText/${INSTANCE}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: API_KEY,
    },
    body: JSON.stringify({ number, text }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Evolution API ${res.status}: ${body}`);
  }

  return res.json();
}

module.exports = { sendText };
