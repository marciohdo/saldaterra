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

// Normaliza o número e gera todas as variantes a tentar:
// 1. Remove não-dígitos, garante prefixo 55
// 2. Variante sem o 9 após DDD (11 → 10 dígitos locais): 34998258133 → 3498258133
// 3. Variante com o 9 após DDD (10 → 11 dígitos locais): 3496550333  → 34996550333
function gerarCandidatos(telefone) {
  const digitos = telefone.replace(/\D/g, '');
  const com55   = digitos.startsWith('55') ? digitos : '55' + digitos;
  const local   = com55.slice(2);
  const set     = new Set([com55]);

  if (local.length === 11 && local[2] === '9') {
    set.add('55' + local.slice(0, 2) + local.slice(3)); // sem o 9
  } else if (local.length === 10) {
    set.add('55' + local.slice(0, 2) + '9' + local.slice(2)); // com o 9
  }
  return [...set];
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
