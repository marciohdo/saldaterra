require('./load-env');
const {
  buscarVisitantesSemContato,
  buscarVisitantePorId,
} = require('./supabase');
const { sendTextComFallback, sendPollComFallback } = require('./evolution-api');
const { registerPollVisitante } = require('./poll-map');
const { redirecionarVisitante } = require('./redirecionamento');
const { logMensagemLider } = require('./msg-logger');

const CHECK_INTERVAL_MS = 60 * 60 * 1000; // verifica a cada 1 hora

let ultimoEnvio = null; // data do último disparo — garante 1 envio por dia

function hoje() {
  return new Date().toLocaleDateString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric', month: '2-digit', day: '2-digit',
  });
}

function log(msg) {
  const ts = new Date().toLocaleTimeString('pt-BR');
  console.log(`[${ts}] [scheduler] ${msg}`);
}

// Agrupa visitantes por líder
function agruparPorLider(visitantes) {
  const mapa = new Map();
  for (const v of visitantes) {
    const key = v.lider_telefone;
    if (!mapa.has(key)) mapa.set(key, { nome: v.lider, telefone: v.lider_telefone, visitantes: [] });
    mapa.get(key).visitantes.push(v);
  }
  return [...mapa.values()];
}

async function chamarRedirecionamento(id) {
  try {
    const v = await buscarVisitantePorId(id);
    if (!v) return;
    await redirecionarVisitante(id, {
      nome:        v.visitante_nome,
      telefone:    v.visitante_telefone,
      idade:       v.visitante_idade,
      estadoCivil: v.vistitante_est_civil,
      criancas:    v.visitante_criancas,
      endereco:    v.visitante_endereco,
      bairro:      v.visitante_bairro,
      cidade:      v.visitante_cidade,
    }, `scheduler:${id}`);
  } catch (err) {
    log(`Erro ao redirecionar visitante ID ${id}: ${err.message}`);
  }
}

async function dispararLembretes() {
  log('Verificando visitantes sem contato...');
  try {
    const todos = await buscarVisitantesSemContato();
    if (!todos.length) {
      log('Nenhum visitante sem contato encontrado.');
      return;
    }

    // Só notifica visitantes cadastrados em dias anteriores — se foi hoje, o líder acabou de ser avisado
    const dataHoje = hoje();
    const visitantes = todos.filter(v => v.visitante_data_contato !== dataHoje);
    const ignorados  = todos.length - visitantes.length;

    if (ignorados) log(`${ignorados} visitante(s) cadastrado(s) hoje ignorado(s).`);
    if (!visitantes.length) {
      log('Nenhum visitante de dias anteriores pendente.');
      return;
    }

    const lideres = agruparPorLider(visitantes);
    log(`${visitantes.length} visitante(s) pendente(s) de dias anteriores em ${lideres.length} líder(es).`);

    for (const lider of lideres) {
      try {
        // Saudação inicial
        const saudacao =
          `Oi líder ${lider.nome}! 😊 Passando para lembrar que você tem visitante(s) aguardando.\n` +
          `Para cada um, é só selecionar o status abaixo 👇`;
        await sendTextComFallback(lider.telefone, saudacao);

        // Enquete por visitante (poll nativo do WhatsApp)
        for (const v of lider.visitantes) {
          const descricao = `Cadastrado em ${v.visitante_data_contato ?? '—'}. Qual é a situação?`;
          const result = await sendPollComFallback(lider.telefone, {
            name:   `${v.visitante_nome} — ${descricao}`,
            values: [
              '⏳ Não respondeu ainda',
              '📩 Convidei para o PG',
              '✅ Está frequentando',
              '🚫 Perfil não atende',
            ],
            selectableCount: 1,
          });

          // Registra mapeamento pollMessageId → visitanteId para o webhook processar
          if (result?.messageId) {
            registerPollVisitante(result.messageId, v.id);
          }

          logMensagemLider({
            liderNome:     lider.nome,
            liderTelefone: lider.telefone,
            tipo:          'lembrete',
            visitanteNome: v.visitante_nome,
            visitanteId:   v.id,
            mensagem:      descricao,
          });
        }

        log(`Lembrete enviado para líder ${lider.nome} (${lider.telefone}) — ${lider.visitantes.length} visitante(s)`);
      } catch (err) {
        log(`Erro ao notificar líder ${lider.nome}: ${err.message}`);
        if (err.type === 'numero_inexistente') {
          log(`Número inválido para ${lider.nome} — redirecionando ${lider.visitantes.length} visitante(s)`);
          for (const v of lider.visitantes) {
            await chamarRedirecionamento(v.id);
          }
        }
      }
    }
  } catch (err) {
    log(`Erro ao buscar visitantes: ${err.message}`);
  }
}

async function verificarEDisparar() {
  const dataHoje = hoje();
  if (ultimoEnvio === dataHoje) return;
  await dispararLembretes();
  ultimoEnvio = dataHoje; // só marca depois de completar (evita perder o dia se der erro)
}

function iniciar() {
  log('Agendador iniciado — lembretes diários para líderes com visitantes pendentes.');

  // Verifica imediatamente na inicialização (evita perder o dia se o servidor reiniciou)
  verificarEDisparar();

  setInterval(verificarEDisparar, CHECK_INTERVAL_MS);
}

module.exports = { iniciar };
