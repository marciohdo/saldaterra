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

// Normaliza o número e gera candidatos para envio.
// Formato alvo: 13 dígitos — 55 + DDD(2) + 9 + número(8) — ex: 5534996689999
// Fallback:     12 dígitos — 55 + DDD(2) + número(8)      — ex: 553496689999
function gerarCandidatos(telefone) {
  const digitos = telefone.replace(/\D/g, '');
  const com55   = digitos.startsWith('55') ? digitos : '55' + digitos;
  const local   = com55.slice(2); // parte sem o código do país

  if (local.length === 11 && local[2] === '9') {
    // ✓ já é 13 dígitos — formato correto; fallback: sem o 9 (12 dígitos)
    return [com55, '55' + local.slice(0, 2) + local.slice(3)];
  }

  if (local.length === 10) {
    // formato antigo sem o 9 (12 dígitos) — tenta 13 dígitos primeiro
    const com9 = '55' + local.slice(0, 2) + '9' + local.slice(2);
    return [com9, com55];
  }

  // número fora do padrão esperado — usa como está e loga aviso
  console.warn(`[evolution-api] Número fora do padrão (${com55.length} dígitos): ${com55}`);
  return [com55];
}

// Tenta enviar para cada candidato de número.
// Qualquer 400 da Evolution API → tenta próximo candidato.
// Esgotou todos → lança erro com tipo 'numero_inexistente' (aciona busca de novo líder).
// Erros não-400 (rede, instância offline) → relança imediatamente.
async function sendTextComFallback(telefone, text) {
  const candidatos = gerarCandidatos(telefone);
  let ultimoErro;

  for (const numero of candidatos) {
    try {
      await sendTyping(numero);
      await sendText(numero, text);
      return numero; // entregue com sucesso
    } catch (err) {
      ultimoErro = err;
      if (!err.message.includes('Evolution API 400:')) throw err; // erro não é 400 — para imediatamente
      // é 400 — tenta próximo candidato com formato diferente
    }
  }

  const e = new Error(ultimoErro?.message ?? 'numero inexistente');
  e.type = 'numero_inexistente';
  throw e;
}

async function sendButtons(number, buttonsData) {
  const url = `${BASE_URL}/message/sendButtons/${INSTANCE}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify({ number, ...buttonsData }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Evolution API ${res.status}: ${body}`);
  }
  return res.json();
}

async function sendButtonsComFallback(telefone, buttonsData) {
  const candidatos = gerarCandidatos(telefone);
  let ultimoErro;
  for (const numero of candidatos) {
    try {
      await sendButtons(numero, buttonsData);
      return numero;
    } catch (err) {
      ultimoErro = err;
      if (!err.message.includes('Evolution API 400:')) throw err;
    }
  }
  const e = new Error(ultimoErro?.message ?? 'numero inexistente');
  e.type = 'numero_inexistente';
  throw e;
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

module.exports = { sendText, sendTyping, markAsRead, sendTextComFallback, sendButtons, sendButtonsComFallback };
