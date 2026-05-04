require('./load-env');
const { buscarVisitantesSemContato } = require('./supabase');
const { sendTyping, sendText }       = require('./evolution-api');

const CHECK_INTERVAL_MS = 60 * 60 * 1000; // verifica a cada 1 hora
const DIAS_DE_ENVIO     = new Set([1, 4]); // 1=segunda, 4=quinta

let ultimoEnvio = null; // data do último disparo — garante 1 envio por dia

function hoje() {
  return new Date().toLocaleDateString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric', month: '2-digit', day: '2-digit',
  });
}

function isDiaDeEnvio() {
  const agora = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  return DIAS_DE_ENVIO.has(agora.getDay());
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
    const visitantes = await buscarVisitantesSemContato();
    if (!visitantes.length) {
      log('Nenhum visitante sem contato encontrado.');
      return;
    }

    const lideres = agruparPorLider(visitantes);
    log(`${visitantes.length} visitante(s) sem contato em ${lideres.length} líder(es).`);

    for (const lider of lideres) {
      const lista = lider.visitantes
        .map(v => `- ${v.visitante_nome} (cadastrado em ${v.visitante_data_contato})`)
        .join('\n');

      const msg =
        `Oi líder ${lider.nome}! 😊 Passando para lembrar que você tem visitante(s) aguardando o seu contato:\n\n` +
        `${lista}\n\n` +
        `Que tal dar uma ligadinha ou mandar uma mensagem para eles essa semana? Deus abençoe! 🙏`;

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
  log('Agendador iniciado — lembretes toda segunda-feira e quinta-feira.');

  setInterval(async () => {
    if (!isDiaDeEnvio()) return;
    const dataHoje = hoje();
    if (ultimoEnvio === dataHoje) return; // já enviou hoje
    ultimoEnvio = dataHoje;
    await dispararLembretes();
  }, CHECK_INTERVAL_MS);
}

module.exports = { iniciar };
