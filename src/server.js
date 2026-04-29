require('./load-env');
const express = require('express');
const { sendText } = require('./evolution-api');
const { reply } = require('./claude');
const { SYSTEM_PROMPT: LUZ_IA } = require('./agents/luz-ia');
const { SYSTEM_PROMPT: PG_VISITANTE } = require('./agents/pg-visitante');

const app = express();
app.use(express.json());

const PG_PREFIX = /^lider:/i;

function extractText(data) {
  return (
    data?.message?.conversation ||
    data?.message?.extendedTextMessage?.text ||
    data?.message?.imageMessage?.caption ||
    null
  );
}

function log(phone, msg) {
  const ts = new Date().toLocaleTimeString('pt-BR');
  console.log(`[${ts}] [${phone ?? 'server'}] ${msg}`);
}

// Captura QUALQUER requisição recebida para facilitar o debug
app.use((req, _res, next) => {
  console.log(`\n>>> ${req.method} ${req.path}`);
  if (Object.keys(req.body ?? {}).length) {
    console.log('BODY:', JSON.stringify(req.body, null, 2));
  }
  next();
});

app.post('/webhook/5c697459-3a69-4009-b724-43069e591f81', async (req, res) => {
  res.sendStatus(200);

  const body = req.body ?? {};
  const event = body.event ?? body.type; // algumas versões usam "type"
  const data = body.data ?? body;

  log(null, `Evento recebido: "${event}"`);

  // Aceita variações do nome do evento entre versões da Evolution API
  const isMessage = /messages[\.\-_]upsert/i.test(event ?? '');
  if (!isMessage) {
    log(null, `Evento ignorado (não é mensagem): ${event}`);
    return;
  }

  if (data?.key?.fromMe) {
    log(null, 'Ignorado: mensagem enviada pelo próprio bot');
    return;
  }

  const remoteJid = data?.key?.remoteJid ?? '';
  if (!remoteJid.includes('@')) {
    log(null, `remoteJid inválido: "${remoteJid}"`);
    return;
  }

  if (remoteJid.endsWith('@g.us')) {
    log(null, 'Ignorado: mensagem de grupo');
    return;
  }

  const phone = remoteJid.replace(/@.*/, '');
  const text = extractText(data);

  if (!text) {
    log(phone, 'Ignorado: sem texto (mídia ou tipo não suportado)');
    log(phone, 'message keys: ' + JSON.stringify(Object.keys(data?.message ?? {})));
    return;
  }

  log(phone, `Mensagem recebida: "${text}"`);

  const systemPrompt = PG_PREFIX.test(text) ? PG_VISITANTE : LUZ_IA;
  const agente = PG_PREFIX.test(text) ? 'PG Visitante' : 'Luz.ia';
  log(phone, `Roteado para: ${agente}`);

  try {
    const response = await reply(phone, text, systemPrompt);
    log(phone, `Resposta gerada: "${response.slice(0, 80)}..."`);
    await sendText(phone, response);
    log(phone, 'Mensagem enviada com sucesso');
  } catch (err) {
    log(phone, `ERRO: ${err.message}`);
    console.error(err);
  }
});

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\nServidor rodando na porta ${PORT}`);
  console.log(`Webhook: POST /webhook/5c697459-3a69-4009-b724-43069e591f81`);
  console.log(`Health:  GET  /health\n`);
});
