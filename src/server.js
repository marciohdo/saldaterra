require('./load-env');
const express = require('express');
const { sendText } = require('./evolution-api');
const { reply } = require('./claude');
const { SYSTEM_PROMPT: LUZ_IA } = require('./agents/luz-ia');
const { SYSTEM_PROMPT: PG_VISITANTE } = require('./agents/pg-visitante');

const app = express();
app.use(express.json());

// Prefixos que ativam o agente PG Visitante em vez da Luz.ia
// Mensagens que começam com "lider:" são roteadas para o PG Visitante
const PG_PREFIX = /^lider:/i;

function extractText(data) {
  return (
    data?.message?.conversation ||
    data?.message?.extendedTextMessage?.text ||
    null
  );
}

app.post('/webhook/5c697459-3a69-4009-b724-43069e591f81', async (req, res) => {
  res.sendStatus(200); // responde imediatamente para a Evolution API

  const { event, data } = req.body ?? {};
  if (event !== 'messages.upsert') return;
  if (data?.key?.fromMe) return; // ignora mensagens enviadas pelo próprio bot

  const remoteJid = data?.key?.remoteJid ?? '';
  if (!remoteJid.endsWith('@s.whatsapp.net')) return; // ignora grupos

  const phone = remoteJid.replace('@s.whatsapp.net', '');
  const text = extractText(data);
  if (!text) return;

  const systemPrompt = PG_PREFIX.test(text) ? PG_VISITANTE : LUZ_IA;

  try {
    const response = await reply(phone, text, systemPrompt);
    await sendText(phone, response);
  } catch (err) {
    console.error(`[${phone}] Erro ao processar mensagem:`, err.message);
  }
});

// Health check
app.get('/health', (_req, res) => res.json({ status: 'ok' }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));
