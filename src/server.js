require('./load-env');
const express = require('express');
const { sendText, sendTyping, markAsRead } = require('./evolution-api');
const { reply }             = require('./claude');
const {
  inserirVisitante,
  buscarPGProximo,
  buscarVisitante,
  buscarVisitantePorTelefone,
  verificarLider,
  buscarVisitantesDoLider,
  atualizarStatusVisitante,
} = require('./supabase');
const conversation          = require('./conversation');
const { SYSTEM_PROMPT: LUZ_IA } = require('./agents/luz-ia');
const { buildSystemPrompt: buildPGPrompt } = require('./agents/pg-visitante');

const app = express();
app.use(express.json());

const DADOS_RE    = /^#DADOS:(\{.*\})/;
const CONVIDAR_RE = /^#CONVIDAR:(\{.*\})/m;
const PARTICIPOU_RE = /^#PARTICIPOU:(\{.*\})/m;
const REMINDER_MS = 2 * 60 * 1000;

const TEST_MODE               = process.env.TEST_MODE === 'true';
const TEST_PHONE              = process.env.TEST_PHONE ?? '';
const TEST_LEADER_PHONE       = process.env.TEST_LEADER_PHONE ?? '';
const TEST_LEADER_NOME        = process.env.TEST_LEADER_NOME ?? 'Líder Teste';
const TEST_LEADER_LOOKUP_PHONE = process.env.TEST_LEADER_LOOKUP_PHONE ?? '';

// Cache de líderes verificados: phone → {nome, ...} | false
const liderCache = new Map();

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

async function getLiderInfo(phone) {
  if (liderCache.has(phone)) return liderCache.get(phone);

  // Em TEST_MODE, injeta o líder de teste sem consultar o banco
  if (TEST_MODE && TEST_LEADER_PHONE && phone === TEST_LEADER_PHONE) {
    const info = { nome: TEST_LEADER_NOME, telefone: phone, fonte: 'TEST_MODE', pg: null };
    liderCache.set(phone, info);
    log(phone, `[TESTE] Líder de teste identificado: ${TEST_LEADER_NOME}`);
    return info;
  }

  try {
    const info = await verificarLider(phone);
    liderCache.set(phone, info ?? false);
    return info ?? false;
  } catch (err) {
    log(phone, `Aviso: erro ao verificar líder — ${err.message}`);
    return false;
  }
}

// Contador de lembretes por visitante
const lembreteCount = new Map();
const MAX_LEMBRETES = 3;

// Lembrete automático — dispara se visitante ficou 2 min sem responder
setInterval(async () => {
  const inativos = conversation.getInactive(REMINDER_MS);
  for (const phone of inativos) {
    if (liderCache.get(phone)) continue; // não envia lembrete para líderes
    const count = lembreteCount.get(phone) ?? 0;
    if (count > MAX_LEMBRETES) continue; // já encerrou, ignora
    try {
      let mensagem;
      if (count < MAX_LEMBRETES) {
        mensagem = 'Oi! 😊 Ainda estou aqui esperando por você. Me responde para eu te ajudar a encontrar o seu Pequeno Grupo! 🌟';
        lembreteCount.set(phone, count + 1);
        log(phone, `Lembrete enviado (${count + 1}/${MAX_LEMBRETES})`);
      } else {
        mensagem = 'Tudo bem! 😊 Fico feliz em ter tentado te ajudar. Quando quiser encontrar o seu Pequeno Grupo, é só me chamar aqui. Que Deus te abençoe! 🙏';
        lembreteCount.set(phone, count + 1); // marca como encerrado
        conversation.clear(phone);
        log(phone, 'Despedida enviada — conversa encerrada por inatividade');
      }
      await sendTyping(phone);
      await sendText(phone, mensagem);
      conversation.push(phone, 'assistant', mensagem);
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

  markAsRead(remoteJid, messageId);
  log(phone, `Mensagem recebida: "${text}"`);

  // ── Verificação de líder ──────────────────────────────────────────────────
  const liderInfo = await getLiderInfo(phone);

  if (liderInfo) {
    log(phone, `Líder identificado: ${liderInfo.nome} (${liderInfo.fonte})`);
    await handleLider(phone, text, liderInfo);
    return;
  }

  // ── Fluxo de visitante ────────────────────────────────────────────────────
  // Na primeira mensagem da sessão, verifica se já tem cadastro
  if (!conversation.get(phone).length) {
    try {
      const cadastrado = await buscarVisitantePorTelefone(phone);
      if (cadastrado) {
        log(phone, `Visitante já cadastrado (${cadastrado.visitante_nome}) — bloqueando fluxo`);
        const msg =
          `Oi ${cadastrado.visitante_nome}! 😊 Você já tem um cadastro aqui com a gente.\n\n` +
          `Para continuar sua jornada na fé, venha nos visitar pessoalmente na igreja. Estamos te esperando de braços abertos! 🙏`;
        await sendTyping(phone);
        await sendText(phone, msg);
        return;
      }
    } catch (err) {
      log(phone, `Aviso: erro ao verificar cadastro — ${err.message}`);
    }
  }

  await handleVisitante(phone, text);
});

// ── Handler: líder ────────────────────────────────────────────────────────────
async function handleLider(phone, text, liderInfo) {
  try {
    const lookupPhone  = TEST_MODE && TEST_LEADER_LOOKUP_PHONE ? TEST_LEADER_LOOKUP_PHONE : phone;
    const visitantes   = await buscarVisitantesDoLider(lookupPhone);
    log(phone, `Visitantes pendentes encontrados: ${visitantes.length}${TEST_MODE && TEST_LEADER_LOOKUP_PHONE ? ` (lookup: ${lookupPhone})` : ''}`);
    const systemPrompt = buildPGPrompt(liderInfo.nome, visitantes);

    const response = await reply(phone, text, systemPrompt);
    let mensagem   = response;

    // Processa #CONVIDAR
    const mConvidar = response.match(CONVIDAR_RE);
    if (mConvidar) {
      try {
        const { id } = JSON.parse(mConvidar[1]);
        await atualizarStatusVisitante(id, {
          visitante_status:   'convidado pelo lider',
          visitante_data_ini: new Date().toISOString(),
        });
        log(phone, `Visitante ID ${id} → convidado pelo lider`);
      } catch (err) {
        log(phone, `Erro ao atualizar #CONVIDAR: ${err.message}`);
      }
      mensagem = mensagem.replace(CONVIDAR_RE, '').trimStart();
    }

    // Processa #PARTICIPOU
    const mParticipou = response.match(PARTICIPOU_RE);
    if (mParticipou) {
      try {
        const { id } = JSON.parse(mParticipou[1]);
        await atualizarStatusVisitante(id, {
          visitante_status:   'participando',
          visitante_data_fim: new Date().toISOString(),
        });
        log(phone, `Visitante ID ${id} → participando`);
      } catch (err) {
        log(phone, `Erro ao atualizar #PARTICIPOU: ${err.message}`);
      }
      mensagem = mensagem.replace(PARTICIPOU_RE, '').trimStart();
    }

    if (mensagem) {
      await sendTyping(phone);
      await sendText(phone, mensagem);
      log(phone, 'Resposta enviada ao líder');
    }
  } catch (err) {
    log(phone, `ERRO (líder): ${err.message}`);
    console.error(err);
  }
}

// ── Handler: visitante ────────────────────────────────────────────────────────
async function handleVisitante(phone, text) {
  try {
    const response = await reply(phone, text, LUZ_IA);
    const match    = response.match(DADOS_RE);
    let mensagem   = response;

    if (match && !conversation.isSaved(phone)) {
      try {
        const json = JSON.parse(match[1]);

        const cadastroExistente = await buscarVisitante(phone, json.nome_completo);
        if (cadastroExistente) {
          log(phone, `Visitante já cadastrado: ${cadastroExistente.visitante_nome}`);
          conversation.markSaved(phone);
          mensagem = `Oi ${json.nome_completo}! 😊 Você já tem um cadastro aqui com a gente. Para continuar sua jornada na fé, venha nos visitar pessoalmente na igreja. Estamos te esperando! 🙏`;
        } else {
          let liderNome     = '';
          let liderTelefone = '';
          try {
            const pg  = await buscarPGProximo(
              json.cidade, json.bairro,
              json.estado_civil, json.tem_criancas, json.idade, json.endereco
            );
            liderNome     = pg?.LIDER   ?? '';
            liderTelefone = pg?.CONTATO ?? '';
            log(phone, `PG encontrado: ${liderNome} — ${liderTelefone}`);
          } catch (err) {
            log(phone, `Aviso: não foi possível buscar PG — ${err.message}`);
          }

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

          if (liderTelefone) {
            const destino = telefoneDestino(liderTelefone);
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
              await sendTyping(destino);
              await sendText(destino, msgLider);
              log(phone, `Líder ${liderNome} notificado: ${destino}${TEST_MODE ? ' [MODO TESTE]' : ''}`);
            } catch (err) {
              log(phone, `Aviso: não foi possível notificar líder — ${err.message}`);
            }
          }

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
    log(phone, `ERRO (visitante): ${err.message}`);
    console.error(err);
  }
}

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\nServidor rodando na porta ${PORT}`);
  console.log(`Webhook: POST /webhook/5c697459-3a69-4009-b724-43069e591f81`);
  console.log(`Health:  GET  /health`);
  console.log(`Lembrete: a cada 2 min sem resposta\n`);
});
