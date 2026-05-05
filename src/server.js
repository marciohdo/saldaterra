require('./load-env');
const express = require('express');
const { sendText, sendTyping, markAsRead, sendTextComFallback } = require('./evolution-api');
const { reply }             = require('./claude');
const {
  inserirVisitante,
  buscarPGProximo,
  buscarPGPorProximidade,
  buscarVisitante,
  buscarVisitantePorId,
  buscarVisitantePorTelefone,
  buscarLideresAnteriores,
  verificarLider,
  buscarVisitantesDoLider,
  atualizarStatusVisitante,
} = require('./supabase');
const conversation          = require('./conversation');
const { SYSTEM_PROMPT: LUZ_IA } = require('./agents/luz-ia');
const { buildSystemPrompt: buildPGPrompt } = require('./agents/pg-visitante');
const { redirecionarVisitante } = require('./redirecionamento');
const scheduler             = require('./scheduler');

const app = express();
app.use(express.json());

const DADOS_RE      = /^#DADOS:(\{.*\})/;
const CONVIDAR_RE   = /^#CONVIDAR:(\{.*\})/m;
const PARTICIPOU_RE = /^#PARTICIPOU:(\{.*\})/m;
const NAO_ATENDE_RE = /^#NAO_ATENDE:(\{.*\})/m;
const REMINDER_MS = 2 * 60 * 1000;

const TEST_MODE                = process.env.TEST_MODE === 'true';
const TEST_PHONE               = process.env.TEST_PHONE ?? '';
const TEST_LEADER_PHONE        = process.env.TEST_LEADER_PHONE ?? '';
const TEST_LEADER_NOME         = process.env.TEST_LEADER_NOME ?? 'Líder Teste';
const TEST_LEADER_LOOKUP_PHONE = process.env.TEST_LEADER_LOOKUP_PHONE ?? '';
const SECRETARIA_PHONE         = process.env.SECRETARIA_PHONE ?? '5534999318496';

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

function isVoiceMessage(data) {
  return !!(data?.message?.audioMessage || data?.message?.pttMessage);
}

const PROMPT_INJECTION_PATTERNS = [
  /ignore\s+(previous|todas?\s+as?\s+instru|suas?\s+instru|o\s+prompt)/i,
  /esqueça\s+(tudo|suas?\s+instru|o\s+prompt)/i,
  /novo\s+prompt/i,
  /novas?\s+instru[çc][õo]es/i,
  /mude?\s+seu\s+(prompt|comportamento|instru)/i,
  /altere?\s+suas?\s+instru/i,
  /voc[eê]\s+(agora\s+[eé]|deve\s+ser|passa\s+a\s+ser)/i,
  /finja\s+(que|ser)/i,
  /aja\s+como/i,
  /atue\s+como/i,
  /act\s+as/i,
  /you\s+are\s+now/i,
  /pretend\s+(to\s+be|you)/i,
  /system\s*:/i,
  /\[system\]/i,
  /instruc[çc][aã]o\s*:/i,
  /prompt\s*:/i,
  /DAN\b/,
  /jailbreak/i,
  /bypass\s+(your|the|suas?)\s+(rules?|regras?|instru)/i,
];

function isPromptInjection(text) {
  return PROMPT_INJECTION_PATTERNS.some(re => re.test(text));
}

function log(phone, msg) {
  const ts = new Date().toLocaleTimeString('pt-BR');
  console.log(`[${ts}] [${phone ?? 'server'}] ${msg}`);
}

async function getLiderInfo(phone) {
  // Só usa cache para líderes confirmados — não-líderes sempre re-consultam o banco
  // para garantir que um líder nunca seja tratado como visitante
  const cached = liderCache.get(phone);
  if (cached) return cached;

  // Em TEST_MODE, injeta o líder de teste sem consultar o banco
  if (TEST_MODE && TEST_LEADER_PHONE && phone === TEST_LEADER_PHONE) {
    const info = { nome: TEST_LEADER_NOME, telefone: phone, fonte: 'TEST_MODE', pg: null };
    liderCache.set(phone, info);
    log(phone, `[TESTE] Líder de teste identificado: ${TEST_LEADER_NOME}`);
    return info;
  }

  try {
    const info = await verificarLider(phone);
    if (info) liderCache.set(phone, info); // só cacheia se confirmado como líder
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

  if (isVoiceMessage(data)) {
    markAsRead(remoteJid, messageId);
    log(phone, 'Mensagem de voz recebida — informando que não é suportado');
    await sendTyping(phone);
    await sendText(phone, 'Oi! 😊 Por enquanto não consigo ouvir mensagens de voz. Me manda um textinho que eu te ajudo rapidinho! 🙏');
    return;
  }

  const text = extractText(data);
  if (!text) return;

  markAsRead(remoteJid, messageId);
  log(phone, `Mensagem recebida: "${text}"`);

  if (isPromptInjection(text)) {
    log(phone, 'Tentativa de prompt injection bloqueada');
    await sendTyping(phone);
    await sendText(phone, 'Oi! 😊 Não consigo processar esse tipo de mensagem. Se quiser encontrar um Pequeno Grupo, é só me contar um pouquinho sobre você! 🙏');
    return;
  }

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
          visitante_status:   'convidado',
          visitante_data_ini: new Date().toISOString(),
        });
        log(phone, `Visitante ID ${id} → convidado`);
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
          visitante_status:   'frequentando',
          visitante_data_fim: new Date().toISOString(),
        });
        log(phone, `Visitante ID ${id} → frequentando`);
      } catch (err) {
        log(phone, `Erro ao atualizar #PARTICIPOU: ${err.message}`);
      }
      mensagem = mensagem.replace(PARTICIPOU_RE, '').trimStart();
    }

    // Processa #NAO_ATENDE — redireciona visitante para novo PG
    const mNaoAtende = response.match(NAO_ATENDE_RE);
    if (mNaoAtende) {
      try {
        const { id, motivo } = JSON.parse(mNaoAtende[1]);
        const v = await buscarVisitantePorId(id);
        if (v) {
          const statusAtual = motivo === 'lotado' ? 'lotado' : 'não atende';
          await atualizarStatusVisitante(id, { visitante_status: statusAtual });
          log(phone, `Visitante ID ${id} → ${statusAtual} (motivo: ${motivo})`);

          // Redireciona em loop até conseguir notificar um líder
          await redirecionarVisitante(id, {
            nome:       v.visitante_nome,
            telefone:   v.visitante_telefone,
            idade:      v.visitante_idade,
            estadoCivil: v.vistitante_est_civil,
            criancas:   v.visitante_criancas,
            endereco:   v.visitante_endereco,
            bairro:     v.visitante_bairro,
            cidade:     v.visitante_cidade,
          }, phone);

          mensagem =
            `Tudo certo, líder ${liderInfo.nome}! 😊 Encontrei um novo PG para ${v.visitante_nome}.\n` +
            `Ele(a) foi encaminhado(a) para outro líder que já foi avisado. Muito obrigado pelo retorno! 🙏`;
        }
      } catch (err) {
        log(phone, `Erro ao processar #NAO_ATENDE: ${err.message}`);
        console.error(err);
      }
      mensagem = mensagem.replace(NAO_ATENDE_RE, '').trimStart();
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

          const saved   = await inserirVisitante(dbRecord);
          const savedId = saved?.[0]?.id ?? null;
          conversation.markSaved(phone);
          log(phone, `Visitante salvo: ${dbRecord.visitante_nome}${savedId ? ` (id=${savedId})` : ''}`);

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
            const destinoFinal = TEST_MODE ? TEST_PHONE : liderTelefone;
            try {
              const enviado = await sendTextComFallback(destinoFinal, msgLider);
              log(phone, `Líder ${liderNome} notificado: ${enviado}${TEST_MODE ? ' [MODO TESTE]' : ''}`);
              if (savedId) await atualizarStatusVisitante(savedId, { lider_avisado: 'sim' }).catch(e => log(phone, `Aviso lider_avisado: ${e.message}`));
            } catch (err) {
              log(phone, `Aviso: não foi possível notificar líder (${err.message})`);
              if (savedId) await atualizarStatusVisitante(savedId, { lider_avisado: 'não' }).catch(e => log(phone, `Aviso lider_avisado: ${e.message}`));
              if (err.type === 'numero_inexistente' && savedId) {
                await redirecionarVisitante(savedId, {
                  nome: json.nome_completo, telefone: phone,
                  idade: json.idade, estadoCivil: json.estado_civil,
                  criancas: json.tem_criancas, endereco: json.endereco,
                  bairro: json.bairro, cidade: json.cidade,
                }, phone);
              }
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
  console.log(`Lembrete visitante: a cada 2 min sem resposta`);
  console.log(`Lembrete líder: toda segunda-feira\n`);
  scheduler.iniciar();
});
