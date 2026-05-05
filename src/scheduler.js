require('./load-env');
const { buscarVisitantesSemContato } = require('./supabase');
const { sendTyping, sendText }       = require('./evolution-api');

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
      const lista = lider.visitantes
        .map(v => `- ${v.visitante_nome} (cadastrado em ${v.visitante_data_contato})`)
        .join('\n');

      const msg =
        `Oi líder ${lider.nome}! 😊 Passando para lembrar que você tem visitante(s) aguardando o seu contato:\n\n` +
        `${lista}\n\n` +
        `Que tal dar uma ligadinha ou mandar uma mensagem para eles hoje? Deus abençoe! 🙏`;

      try {
        await sendTyping(lider.telefone);
        await sendText(lider.telefone, msg);
        log(`Lembrete enviado para líder ${lider.nome} (${lider.telefone}) — ${lider.visitantes.length} visitante(s)`);
      } catch (err) {
        log(`Erro ao notificar líder ${lider.nome}: ${err.message}`);
      }
    }
  } catch (err) {
    log(`Erro ao buscar visitantes: ${err.message}`);
  }
}

function iniciar() {
  log('Agendador iniciado — lembretes diários para líderes com visitantes pendentes.');

  setInterval(async () => {
    const dataHoje = hoje();
    if (ultimoEnvio === dataHoje) return; // já enviou hoje
    ultimoEnvio = dataHoje;
    await dispararLembretes();
  }, CHECK_INTERVAL_MS);
}

module.exports = { iniciar };
