require('./load-env');
const {
  buscarVisitantesSemContato,
  buscarVisitantePorId,
} = require('./supabase');
const { sendTextComFallback } = require('./evolution-api');
const { redirecionarVisitante } = require('./redirecionamento');

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

async function redirecionarVisitante(id) {
  try {
    const v = await buscarVisitantePorId(id);
    if (!v) return;

    await atualizarStatusVisitante(id, { visitante_status: 'numero_inexistente' });
    log(`Visitante ID ${id} (${v.visitante_nome}) → numero_inexistente (número inválido)`);

    const anteriores = await buscarLideresAnteriores(v.visitante_telefone);
    const tentativa  = anteriores.length;

    const novoPG = tentativa >= 2
      ? await buscarPGPorProximidade(v.visitante_cidade, v.visitante_bairro, v.visitante_endereco, anteriores)
      : await buscarPGProximo(v.visitante_cidade, v.visitante_bairro, v.vistitante_est_civil, v.visitante_criancas, v.visitante_idade, v.visitante_endereco, anteriores);

    if (!novoPG) {
      log(`Nenhum PG disponível para ${v.visitante_nome} na tentativa #${tentativa + 1}`);
      return;
    }

    const novoReg = await inserirVisitante({
      visitante_nome:         v.visitante_nome,
      visitante_telefone:     v.visitante_telefone,
      visitante_idade:        v.visitante_idade,
      vistitante_est_civil:   v.vistitante_est_civil,
      visitante_criancas:     v.visitante_criancas,
      visitante_endereco:     v.visitante_endereco,
      visitante_bairro:       v.visitante_bairro,
      visitante_cidade:       v.visitante_cidade,
      lider:                  novoPG.LIDER,
      lider_telefone:         novoPG.CONTATO,
      visitante_status:       'ATIVO',
      visitante_data_contato: new Date().toLocaleDateString('pt-BR'),
      Data_atu:               new Date().toISOString(),
    });
    const novoId = novoReg?.[0]?.id ?? null;
    log(`Nova linha criada para ${v.visitante_nome} → ${novoPG.LIDER} (id=${novoId})`);

    const msgNovo =
      `Oi líder ${novoPG.LIDER}, que alegria! 😊 Um visitante foi redirecionado para o seu PG.\n\n` +
      `Nome: ${v.visitante_nome}\nTelefone: ${v.visitante_telefone}\nIdade: ${v.visitante_idade}\n` +
      `Estado civil: ${v.vistitante_est_civil}\nCrianças: ${v.visitante_criancas}\n` +
      `Endereço: ${v.visitante_endereco}, ${v.visitante_bairro} - ${v.visitante_cidade}\n\n` +
      `Entre em contato com ele(a) para dar as boas-vindas! 🌟`;

    try {
      const enviado = await sendTextComFallback(novoPG.CONTATO, msgNovo);
      log(`Novo líder ${novoPG.LIDER} notificado: ${enviado}`);
      if (novoId) await atualizarStatusVisitante(novoId, { lider_avisado: 'sim' }).catch(() => {});
    } catch (e) {
      log(`Erro ao notificar novo líder ${novoPG.LIDER}: ${e.message}`);
      if (novoId) await atualizarStatusVisitante(novoId, { lider_avisado: 'não' }).catch(() => {});
      // Se o novo líder também tiver número inválido, o próximo ciclo do scheduler cuidará
    }
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
      const lista = lider.visitantes
        .map(v => `- ${v.visitante_nome} (cadastrado em ${v.visitante_data_contato})`)
        .join('\n');

      const msg =
        `Oi líder ${lider.nome}! 😊 Passando para lembrar que você tem visitante(s) aguardando o seu contato:\n\n` +
        `${lista}\n\n` +
        `Que tal dar uma ligadinha ou mandar uma mensagem para eles hoje? Deus abençoe! 🙏`;

      try {
        const enviado = await sendTextComFallback(lider.telefone, msg);
        log(`Lembrete enviado para líder ${lider.nome} (${enviado}) — ${lider.visitantes.length} visitante(s)`);
      } catch (err) {
        log(`Erro ao notificar líder ${lider.nome}: ${err.message}`);
        if (err.type === 'numero_inexistente') {
          log(`Número inválido para ${lider.nome} — redirecionando ${lider.visitantes.length} visitante(s)`);
          for (const v of lider.visitantes) {
            await redirecionarVisitante(v.id);
          }
        }
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
