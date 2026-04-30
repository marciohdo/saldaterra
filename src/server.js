require('./load-env');
const express = require('express');
const { sendText, sendTyping, markAsRead } = require('./evolution-api');
const { reply }             = require('./claude');
const { inserirVisitante, buscarPGProximo, buscarVisitante } = require('./supabase');
const conversation          = require('./conversation');
const { SYSTEM_PROMPT: LUZ_IA }      = require('./agents/luz-ia');
const { SYSTEM_PROMPT: PG_VISITANTE } = require('./agents/pg-visitante');

const app = express();
app.use(express.json());

const PG_PREFIX   = /^lider:/i;
const DADOS_RE    = /^#DADOS:(\{.*\})/;
const REMINDER_MS = 2 * 60 * 1000; // 2 minutos

const TEST_MODE  = process.env.TEST_MODE === 'true';
const TEST_PHONE = process.env.TEST_PHONE ?? '';

function telefoneDestino(telefoneReal) {
  if (TEST_MODE && TEST_PHONE) {
    log(null, `[TESTE] Redirecionando líder ${telefoneReal} → ${TEST_PHONE}`);
    return TEST_PHONE;
  }
  return telefoneReal;
}

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
      await sendTyping(phone);
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

  const phone     = remoteJid.replace(/@.*/, '');
  const messageId = data?.key?.id;
  const text      = extractText(data);
  if (!text) return;

  // Marca a mensagem como lida imediatamente
  markAsRead(remoteJid, messageId);

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

        // Verifica se o visitante já tem cadastro
        const cadastroExistente = await buscarVisitante(phone, json.nome_completo);
        if (cadastroExistente) {
          log(phone, `Visitante já cadastrado: ${cadastroExistente.visitante_nome}`);
          conversation.markSaved(phone);
          mensagem = `Oi ${json.nome_completo}! 😊 Você já tem um cadastro aqui com a gente. Em breve alguém da nossa equipe vai entrar em contato com você. Fique de olho no WhatsApp! 🌟`;
        } else {
          // Busca o PG mais próximo por cidade e bairro
          let liderNome     = '';
          let liderTelefone = '';
          try {
            const pg  = await buscarPGProximo(json.cidade, json.bairro);
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

          // Notifica o líder via WhatsApp usando o tom do PG Visitante Acolhedor
          if (liderTelefone) {
            const msgLider =
              `Oi líder ${liderNome}, que alegria! 😊 Um novo visitante foi indicado para o seu PG.\n\n` +
              `Nome: ${json.nome_completo}\n` +
              `Telefone: ${phone}\n` +
              `Idade: ${json.idade}\n` +
              `Estado civil: ${json.estado_civil}\n` +
              `Crianças: ${json.tem_criancas}\n` +
              `Endereço: ${json.endereco}, ${json.bairro} - ${json.cidade}\n\n` +
              `Entre em contato com ele(a) para dar as boas-vindas! 🌟`;
            try {
              await sendTyping(liderTelefone);
              await sendText(liderTelefone, msgLider);
              log(phone, `Líder ${liderNome} notificado: ${liderTelefone}`);
            } catch (err) {
              log(phone, `Aviso: não foi possível notificar líder — ${err.message}`);
            }
          }

          // Resposta ao visitante — sem revelar dados do líder
          mensagem = response.replace(DADOS_RE, '').trimStart();
        }
      } catch (err) {
        log(phone, `Erro ao salvar no Supabase: ${err.message}`);
        mensagem = response.replace(DADOS_RE, '').trimStart();
      }
    }

    if (mensagem) {
      await sendTyping(phone);
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
