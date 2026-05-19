const { getSocket } = require('./whatsapp-client');

function toJid(number) {
  const clean = number.replace(/\D/g, '');
  return `${clean}@s.whatsapp.net`;
}

function typingDelay(text) {
  return Math.min(Math.max(text.length * 30, 1000), 4000);
}

async function sendTyping(number) {
  const sock = getSocket();
  if (!sock) return;
  try {
    await sock.sendPresenceUpdate('composing', toJid(number));
  } catch (_) {}
}

async function sendText(number, text) {
  const sock = getSocket();
  if (!sock) throw new Error('Socket WhatsApp não inicializado');
  const jid   = toJid(number);
  const delay = typingDelay(text);
  try {
    await sock.sendPresenceUpdate('composing', jid);
    await new Promise(r => setTimeout(r, delay));
    await sock.sendPresenceUpdate('paused', jid);
  } catch (_) {}
  await sock.sendMessage(jid, { text });
}

async function markAsRead(remoteJid, messageId) {
  const sock = getSocket();
  if (!sock) return;
  try {
    await sock.readMessages([{ remoteJid, id: messageId, participant: undefined }]);
  } catch (_) {}
}

// Normaliza número e gera candidatos: 13 dígitos (formato atual) e 12 dígitos (sem o 9).
function gerarCandidatos(telefone) {
  const digitos = telefone.replace(/\D/g, '');
  const com55   = digitos.startsWith('55') ? digitos : '55' + digitos;
  const local   = com55.slice(2);

  if (local.length === 11 && local[2] === '9') {
    return [com55, '55' + local.slice(0, 2) + local.slice(3)];
  }
  if (local.length === 10) {
    return ['55' + local.slice(0, 2) + '9' + local.slice(2), com55];
  }
  console.warn(`[whatsapp] Número fora do padrão (${com55.length} dígitos): ${com55}`);
  return [com55];
}

// Consulta o WhatsApp para descobrir qual variante do número está registrada.
// Retorna o número confirmado (sem @s.whatsapp.net) ou null se nenhum existir.
async function resolverJid(telefone) {
  const sock = getSocket();
  if (!sock) return null;
  const candidatos = gerarCandidatos(telefone);
  try {
    const resultado = await sock.onWhatsApp(...candidatos.map(c => c + '@s.whatsapp.net'));
    const encontrado = resultado?.find(r => r.exists);
    if (encontrado) {
      const numero = encontrado.jid.replace('@s.whatsapp.net', '');
      console.log(`[whatsapp] resolverJid: ${telefone} → ${numero}`);
      return numero;
    }
  } catch (err) {
    console.warn(`[whatsapp] resolverJid falhou para ${telefone}: ${err.message}`);
  }
  return null;
}

async function sendTextComFallback(telefone, text) {
  // Tenta primeiro resolver o JID correto via onWhatsApp para evitar envio silencioso para JID errado
  const jidConfirmado = await resolverJid(telefone);
  const candidatos = jidConfirmado ? [jidConfirmado] : gerarCandidatos(telefone);
  let ultimoErro;

  for (const numero of candidatos) {
    try {
      await sendTyping(numero);
      await sendText(numero, text);
      return numero;
    } catch (err) {
      ultimoErro = err;
    }
  }

  const e = new Error(ultimoErro?.message ?? 'numero inexistente');
  e.type = 'numero_inexistente';
  throw e;
}

async function sendPoll(number, { name, values, selectableCount = 1 }) {
  const sock = getSocket();
  if (!sock) throw new Error('Socket WhatsApp não inicializado');
  const jid    = toJid(number);
  const result = await sock.sendMessage(jid, {
    poll: { name, values, selectableCount },
  });
  return result;
}

async function sendPollComFallback(telefone, pollData) {
  const candidatos = gerarCandidatos(telefone);
  let ultimoErro;

  for (const numero of candidatos) {
    try {
      const result = await sendPoll(numero, pollData);
      return { numero, messageId: result?.key?.id };
    } catch (err) {
      ultimoErro = err;
    }
  }

  const e = new Error(ultimoErro?.message ?? 'numero inexistente');
  e.type = 'numero_inexistente';
  throw e;
}

async function sendButtons(number, text, buttons) {
  const sock = getSocket();
  if (!sock) throw new Error('Socket WhatsApp não inicializado');
  const jid = toJid(number);
  try {
    await sock.sendPresenceUpdate('composing', jid);
    await new Promise(r => setTimeout(r, 600));
    await sock.sendPresenceUpdate('paused', jid);
  } catch (_) {}
  await sock.sendMessage(jid, {
    text,
    footer: 'Sal da Terra',
    buttons: buttons.map(b => ({
      buttonId:   b.id,
      buttonText: { displayText: b.text },
      type: 1,
    })),
    headerType: 1,
  });
}

async function sendButtonsComFallback(telefone, text, buttons) {
  const jidConfirmado = await resolverJid(telefone);
  const candidatos = jidConfirmado ? [jidConfirmado] : gerarCandidatos(telefone);
  let ultimoErro;

  for (const numero of candidatos) {
    try {
      await sendButtons(numero, text, buttons);
      return numero;
    } catch (err) {
      ultimoErro = err;
    }
  }

  // Fallback: lista interativa se botões falharem
  try {
    const rows = buttons.map(b => ({ text: b.text, rowId: b.id }));
    await sendListComFallback(telefone, text, rows);
    return telefone;
  } catch (err) {
    ultimoErro = err;
  }

  const e = new Error(ultimoErro?.message ?? 'numero inexistente');
  e.type = 'numero_inexistente';
  throw e;
}

async function sendList(number, text, rows) {
  const sock = getSocket();
  if (!sock) throw new Error('Socket WhatsApp não inicializado');
  const jid = toJid(number);
  try {
    await sock.sendPresenceUpdate('composing', jid);
    await new Promise(r => setTimeout(r, 600));
    await sock.sendPresenceUpdate('paused', jid);
  } catch (_) {}
  await sock.sendMessage(jid, {
    text,
    footer: 'Sal da Terra',
    title: '',
    buttonText: 'Ver opções',
    sections: [{
      title: 'Opções',
      rows: rows.map(r => ({
        title:       r.text,
        description: r.description || '',
        rowId:       r.rowId,
      })),
    }],
  });
}

async function sendListComFallback(telefone, text, rows) {
  const jidConfirmado = await resolverJid(telefone);
  const candidatos = jidConfirmado ? [jidConfirmado] : gerarCandidatos(telefone);
  let ultimoErro;

  for (const numero of candidatos) {
    try {
      await sendList(numero, text, rows);
      return numero;
    } catch (err) {
      ultimoErro = err;
    }
  }

  // Fallback: envia como texto numerado se lista falhar em todos os formatos
  try {
    const lines = rows.map((r, i) => `${i + 1}. ${r.text}`).join('\n');
    await sendTextComFallback(telefone, `${text}\n\n${lines}`);
    return telefone;
  } catch (err) {
    ultimoErro = err;
  }

  const e = new Error(ultimoErro?.message ?? 'numero inexistente');
  e.type = 'numero_inexistente';
  throw e;
}

module.exports = { sendText, sendTyping, markAsRead, sendTextComFallback, sendPoll, sendPollComFallback, sendButtons, sendButtonsComFallback, sendList, sendListComFallback, resolverJid };
