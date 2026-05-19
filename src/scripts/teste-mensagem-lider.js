require('../load-env');
const {
  default: makeWASocket,
  useMultiFileAuthState,
  fetchLatestWaWebVersion,
  makeCacheableSignalKeyStore,
  DisconnectReason,
} = require('whaileys');
const { Boom } = require('@hapi/boom');
const pino = require('pino');

const NUMERO_LIDER = '5534996689999';
const VISITANTE    = { id: 273, nome: 'Andrea Ferreira', data: '07/05/2026' };

function toJid(n) { return `${n.replace(/\D/g, '')}@s.whatsapp.net`; }

async function conectar() {
  const logger = pino({ level: 'silent' });
  const { state, saveCreds } = await useMultiFileAuthState('data/auth_info');
  const { version } = await fetchLatestWaWebVersion();
  console.log(`[whatsapp] Versão: ${version.join('.')}`);

  return new Promise((resolve, reject) => {
    const sock = makeWASocket({
      version, logger,
      printQRInTerminal: true,
      auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, logger) },
      getMessage: async () => ({ conversation: '' }),
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', ({ connection, lastDisconnect, qr }) => {
      if (qr) console.log('\n📱 Escaneie o QR Code acima com o WhatsApp do bot!\n');

      if (connection === 'open') {
        resolve(sock);
      }

      if (connection === 'close') {
        const err = lastDisconnect?.error;
        const code = err instanceof Boom ? err.output.statusCode : null;
        console.log(`[whatsapp] Fechou com código ${code}`);

        if (code === DisconnectReason.loggedOut) {
          reject(new Error('Sessão encerrada (loggedOut). Delete data/auth_info e reinicie.'));
        } else {
          // Para qualquer outro código (515, 408, etc.) — reconecta
          console.log('[whatsapp] Reconectando em 3s...');
          setTimeout(() => conectar().then(resolve).catch(reject), 3000);
        }
      }
    });
  });
}

async function main() {
  console.log('\n⏳ Conectando ao WhatsApp...\n');
  const sock = await conectar();

  const meNumero = sock.user?.id?.split(':')[0] ?? '?';
  console.log(`\n✅ Conectado como: +${meNumero}`);
  console.log(`   Alvo: ${NUMERO_LIDER}\n`);

  // Verifica se o número do líder tem WhatsApp (testa os dois formatos)
  const candidatos = ['5534996689999', '553496689999'];
  console.log('🔍 Verificando número do líder no WhatsApp...');
  let jidLider = null;
  for (const num of candidatos) {
    const [info] = await sock.onWhatsApp(num) ?? [];
    console.log(`   ${num} → ${info?.exists ? '✅ existe' : '❌ não encontrado'}`);
    if (info?.exists && !jidLider) jidLider = info.jid;
  }

  if (!jidLider) {
    console.log('\n⚠️  Nenhum dos formatos encontrou WhatsApp para esse número.');
    console.log('   Verifique se o número está correto e tem WhatsApp instalado.');
    process.exit(1);
  }

  console.log(`\n   Usando JID: ${jidLider}\n`);

  // Saudação para o líder
  console.log(`📨 Saudação  → ${jidLider}`);
  const r1 = await sock.sendMessage(jidLider, {
    text:
      `Oi líder! 😊 Passando para lembrar que você tem um visitante aguardando.\n` +
      `Selecione o status abaixo 👇`,
  });
  console.log(`   msgId: ${r1?.key?.id}`);
  await new Promise(r => setTimeout(r, 2000));

  // Lista com 3 opções clicáveis
  console.log(`📨 Opções    → ${jidLider}`);
  const r2 = await sock.sendMessage(jidLider, {
    text:       `${VISITANTE.nome}\nCadastrado em ${VISITANTE.data}. Qual é a situação?`,
    footer:     'Sal da Terra',
    buttonText: 'Ver opções',
    sections: [{
      title: 'Opções',
      rows: [
        { title: '⏳ Não respondeu ainda', rowId: `esperando:${VISITANTE.id}`  },
        { title: '📩 Convidei para o PG',  rowId: `convidado:${VISITANTE.id}` },
        { title: '🚫 Perfil não atende',   rowId: `nao_atende:${VISITANTE.id}` },
      ],
    }],
  });
  console.log(`   msgId: ${r2?.key?.id}`);

  await new Promise(r => setTimeout(r, 6000));
  console.log('\n✅ Concluído.');
  process.exit(0);
}

main().catch(err => { console.error('\n❌ Erro fatal:', err.message); process.exit(1); });
