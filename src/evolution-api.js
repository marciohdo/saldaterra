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

// Remove o dígito 9 após o DDD (ex: 34998258133 → 3498258133)
function numeroSemNove(tel) {
  const local = tel.startsWith('55') ? tel.slice(2) : tel;
  if (local.length === 11 && local[2] === '9') {
    const alt = local.slice(0, 2) + local.slice(3);
    return tel.startsWith('55') ? '55' + alt : alt;
  }
  return null;
}

function isNumeroInexistente(errMsg) {
  return errMsg.includes('"exists":false');
}

// Tenta enviar; se o número não existir no WhatsApp, tenta sem o 9 após o DDD.
// Retorna o destino que funcionou ou lança erro com tipo 'numero_inexistente'.
async function sendTextComFallback(telefone, text) {
  const destino = telefone.startsWith('55') ? telefone : '55' + telefone;
  try {
    await sendTyping(destino);
    await sendText(destino, text);
    return destino;
  } catch (err) {
    if (!isNumeroInexistente(err.message)) throw err;

    const alt = numeroSemNove(destino);
    if (!alt) {
      const e = new Error(err.message);
      e.type = 'numero_inexistente';
      throw e;
    }

    try {
      await sendTyping(alt);
      await sendText(alt, text);
      return alt; // número alternativo funcionou
    } catch (err2) {
      const e = new Error(err2.message);
      e.type = 'numero_inexistente';
      throw e;
    }
  }
}

async function markAsRead(remoteJid, messageId) {
  const url = `${BASE_URL}/chat/markMessageAsRead/${INSTANCE}`;
  try {
    await fetch(url, {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify({
        readMessages: [{ remoteJid, fromMe: false, id: messageId }],
      }),
    });
  } catch (_) {
    // não bloqueia o fluxo se falhar
  }
}

module.exports = { sendText, sendTyping, markAsRead, sendTextComFallback };
