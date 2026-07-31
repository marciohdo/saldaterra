const {
  default: makeWASocket,
  useMultiFileAuthState,
  fetchLatestWaWebVersion,
  makeCacheableSignalKeyStore,
  DisconnectReason,
} = require('whaileys');
const { Boom } = require('@hapi/boom');
const pino = require('pino');
const { atualizarStatusBot } = require('./supabase');

const logger = pino({ level: 'silent' });

let sock = null;
let connectedOnce = false;
let heartbeatIniciado = false;

function getSocket() {
  return sock;
}

// Heartbeat de segurança: se o processo cair por completo, updated_at para
// de avançar e o dashboard passa a mostrar "vermelho" mesmo sem um evento explícito.
function iniciarHeartbeat() {
  if (heartbeatIniciado) return;
  heartbeatIniciado = true;
  setInterval(() => {
    const conectado = !!sock?.user;
    atualizarStatusBot(conectado ? 'ativo' : 'problema', conectado ? null : 'Socket WhatsApp desconectado');
  }, 60 * 1000);
}

async function startWhatsApp({ onMessage, onPoll, onVoice, onConnected }) {
  const { state, saveCreds } = await useMultiFileAuthState('data/auth_info');
  const { version } = await fetchLatestWaWebVersion();
  console.log(`[whatsapp] Versão WA Web: ${version.join('.')}`);

  sock = makeWASocket({
    version,
    logger,
    printQRInTerminal: true,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, logger),
    },
    generateHighQualityLinkPreview: true,
    shouldSyncHistoryMessage: () => false,
    syncFullHistory: false,
    getMessage: async () => ({ conversation: '' }),
  });

  sock.ev.on('creds.update', saveCreds);

  iniciarHeartbeat();

  sock.ev.on('connection.update', ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      console.log('\n📱 Escaneie o QR Code acima com seu WhatsApp!\n');
      atualizarStatusBot('problema', 'Aguardando escaneamento do QR Code');
    }
    if (connection === 'open') {
      console.log('✅ WhatsApp conectado com sucesso!\n');
      atualizarStatusBot('ativo');
      if (!connectedOnce) {
        connectedOnce = true;
        onConnected?.();
      }
    }
    if (connection === 'close') {
      const err = lastDisconnect?.error;
      const statusCode = err instanceof Boom ? err.output.statusCode : null;
      console.error('[whatsapp] Conexão encerrada. Código:', statusCode, '| Erro:', err?.message || err);
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      if (shouldReconnect) {
        console.log('[whatsapp] Reconectando em 3s...');
        atualizarStatusBot('problema', `Conexão encerrada (código ${statusCode}), reconectando...`);
        setTimeout(() => startWhatsApp({ onMessage, onPoll, onVoice, onConnected }), 3000);
      } else {
        console.log('[whatsapp] Sessão encerrada. Delete data/auth_info e reinicie para reconectar.');
        atualizarStatusBot('problema', 'Sessão do WhatsApp encerrada — necessário reconectar via QR Code');
      }
    }
  });

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    console.log(`[whatsapp] upsert type=${type} count=${messages.length}`);
    if (type !== 'notify') return;

    for (const msg of messages) {
      console.log(`[whatsapp] msg fromMe=${msg.key.fromMe} jid=${msg.key.remoteJid} tipos=${Object.keys(msg.message || {}).join(',')}`);
      if (msg.key.fromMe) continue;
      const remoteJid = msg.key.remoteJid;
      if (!remoteJid || remoteJid.endsWith('@g.us')) continue;

      // Quando o remetente está com a privacidade de número ativada, o WhatsApp
      // envia remoteJid como "<id>@lid" em vez de "<numero>@s.whatsapp.net".
      // Nesse caso o número real vem em msg.key.senderPn — sem isso, o replace
      // abaixo não encontra "@s.whatsapp.net" e o telefone fica salvo como "<id>@lid".
      const phoneJid = remoteJid.endsWith('@lid') && msg.key.senderPn ? msg.key.senderPn : remoteJid;
      const phone = phoneJid.replace('@s.whatsapp.net', '');
      const messageId = msg.key.id;
      const m = msg.message;

      // Mensagem de voz/áudio
      if (m?.audioMessage || m?.pttMessage) {
        if (onVoice) {
          try { await onVoice(phone, remoteJid, messageId); } catch (e) { console.error('[whatsapp] Erro em onVoice:', e.message); }
        }
        continue;
      }

      // Voto em enquete (poll)
      const pollUpdate = m?.pollUpdateMessage;
      if (pollUpdate) {
        if (onPoll) {
          const pollMsgId = pollUpdate.pollCreationMessageKey?.id;
          const selected  = pollUpdate.vote?.selectedOptions?.[0]?.optionName ?? '';
          if (pollMsgId) {
            try { await onPoll(phone, pollMsgId, selected); } catch (e) { console.error('[whatsapp] Erro em onPoll:', e.message); }
          }
        }
        continue;
      }

      // Texto / resposta de botão / resposta de lista
      const messageText =
        m?.conversation ||
        m?.extendedTextMessage?.text ||
        m?.templateButtonReplyMessage?.selectedId ||
        m?.buttonsResponseMessage?.selectedButtonId ||
        m?.listResponseMessage?.singleSelectReply?.selectedRowId;

      if (!messageText?.trim()) continue;

      const pushName = msg.pushName || '';
      console.log(`[whatsapp] Mensagem de ${phone} (${pushName}): "${messageText.substring(0, 80)}"`);

      if (onMessage) {
        try {
          await onMessage(phone, pushName, messageText.trim(), remoteJid, messageId);
        } catch (e) {
          console.error('[whatsapp] Erro em onMessage:', e.message);
        }
      }
    }
  });

  return sock;
}

module.exports = { startWhatsApp, getSocket };
