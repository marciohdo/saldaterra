require('./load-env');
const express = require('express');
const { sendText }          = require('./evolution-api');
const { reply }             = require('./claude');
const { inserirVisitante, buscarPGProximo } = require('./supabase');
const conversation          = require('./conversation');
const { SYSTEM_PROMPT: LUZ_IA }      = require('./agents/luz-ia');
const { SYSTEM_PROMPT: PG_VISITANTE } = require('./agents/pg-visitante');

const app = express();
app.use(express.json());

const PG_PREFIX   = /^lider:/i;
const DADOS_RE    = /^#DADOS:(\{.*\})/;
const REMINDER_MS = 2 * 60 * 1000; // 2 minutos

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

// Lembrete automático — dispara se visitante ficou 2 min sem responder
setInterval(async () => {
  const inativos = conversation.getInactive(REMINDER_MS);
  for (const phone of inativos) {
    try {
      const lembrete =
        'Oi! 😊 Ainda estou aqui esperando por você. Me responde para eu te ajudar a encontrar o seu Pequeno Grupo! 🌟';
      await sendText(phone, lembrete);
      conversation.push(phone, 'assistant', lembrete);
      log(phone, 'Lembrete enviado (2 min sem resposta)');
    } catch (err) {
      log(phone, `Erro ao enviar lembrete: ${err.message}`);
    }
  }
}, 30_000);

app.use((req, _res, next) => {
  console.log(`\n>>> ${req.method} ${req.path}`);
  if (Object.keys(req.body ?? {}).length) {
    console.log('BODY:', JSON.stringify(req.body, null, 2));
  }
  next();
});

app.post('/webhook/5c697459-3a69-4009-b724-43069e591f81', async (req, res) => {
  res.sendStatus(200);

  const body  = req.body ?? {};
  const event = body.event ?? body.type;
  const data  = body.data ?? body;

  log(null, `Evento recebido: "${event}"`);

  const isMessage = /messages[\.\-_]upsert/i.test(event ?? '');
  if (!isMessage) return;
  if (data?.key?.fromMe) return;

  const remoteJid = data?.key?.remoteJid ?? '';
  if (!remoteJid.includes('@')) return;
  if (remoteJid.endsWith('@g.us')) return;

  const phone = remoteJid.replace(/@.*/, '');
  const text  = extractText(data);
  if (!text) return;

  log(phone, `Mensagem recebida: "${text}"`);

  const systemPrompt = PG_PREFIX.test(text) ? PG_VISITANTE : LUZ_IA;
  log(phone, `Roteado para: ${PG_PREFIX.test(text) ? 'PG Visitante' : 'Luz.ia'}`);

  try {
    const response = await reply(phone, text, systemPrompt);
    const match    = response.match(DADOS_RE);
    let mensagem   = response;

    if (match && !conversation.isSaved(phone)) {
      try {
        const json = JSON.parse(match[1]);

        // Busca o PG mais próximo por cidade e bairro
        let liderNome     = '';
        let liderTelefone = '';
        try {
          const pg = await buscarPGProximo(json.cidade, json.bairro);
          liderNome     = pg?.LIDER   ?? '';
          liderTelefone = pg?.CONTATO ?? '';
          log(phone, `PG encontrado: ${liderNome} — ${liderTelefone}`);
        } catch (err) {
          log(phone, `Aviso: não foi possível buscar PG — ${err.message}`);
        }

        // Monta o objeto com os nomes das colunas do banco
        const dbRecord = {
          visitante_nome:         json.nome_completo,
          visitante_telefone:     phone,
          lider:                  liderNome,
          lider_telefone:         liderTelefone,
          visitante_idade:        json.idade,
          vistitante_est_civil:   json.estado_civil,
          visitante_criancas:     json.tem_criancas,
          visitante_endereco:     json.endereco,
          visitante_bairro:       json.bairro,
          visitante_cidade:       json.cidade,
          visitante_data_contato: new Date().toLocaleDateString('pt-BR'),
          visitante_status:       'ATIVO',
          Data_atu:               new Date().toISOString(),
        };

        await inserirVisitante(dbRecord);
        conversation.markSaved(phone);
        log(phone, `Visitante salvo: ${dbRecord.visitante_nome}`);
      } catch (err) {
        log(phone, `Erro ao salvar no Supabase: ${err.message}`);
      }

      mensagem = response.replace(DADOS_RE, '').trimStart();
    }

    if (mensagem) {
      await sendText(phone, mensagem);
      log(phone, 'Mensagem enviada com sucesso');
    }
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
  console.log(`Health:  GET  /health`);
  console.log(`Lembrete: a cada 2 min sem resposta\n`);
});
