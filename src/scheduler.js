require('./load-env');
const fs   = require('fs');
const path = require('path');
const {
  buscarVisitantesSemContato,
  buscarVisitantePorId,
} = require('./supabase');
const { sendTextComFallback, sendButtonsComFallback } = require('./whatsapp');
const { redirecionarVisitante } = require('./redirecionamento');
const { logMensagemLider } = require('./msg-logger');

const CHECK_INTERVAL_MS = 60 * 60 * 1000; // verifica a cada 1 hora
const LOG_DIR = path.join(__dirname, '..', 'logs');

let ultimoEnvio = null; // cache em memória — evita ler o arquivo a cada hora

function hoje() {
  return new Date().toLocaleDateString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric', month: '2-digit', day: '2-digit',
  });
}

// Retorna a data no formato YYYY-MM-DD (mesmo usado pelo msg-logger no nome do arquivo)
function hojeISO() {
  return new Date().toLocaleDateString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).split('/').reverse().join('-');
}

// Verifica no arquivo de log do dia se já houve um disparo de lembrete
function jaEnviouHojeNoLog() {
  try {
    const arquivo = path.join(LOG_DIR, `lideres-${hojeISO()}.log`);
    if (!fs.existsSync(arquivo)) return false;
    const conteudo = fs.readFileSync(arquivo, 'utf8');
    return conteudo.split('\n').some(linha => {
      if (!linha.trim()) return false;
      try { return JSON.parse(linha).tipo === 'lembrete'; } catch { return false; }
    });
  } catch {
    return false;
  }
}

function log(msg) {
  const ts = new Date().toLocaleTimeString('pt-BR');
  console.log(`[${ts}] [scheduler] ${msg}`);
}

function formatarVisitanteParaLider(v) {
  const partes = [];
  if (v.visitante_telefone) partes.push(`📱 ${v.visitante_telefone}`);
  if (v.visitante_idade)    partes.push(`${v.visitante_idade} anos`);
  if (v.visitante_bairro)   partes.push(`📍 ${v.visitante_bairro}`);
  const info = partes.length ? partes.join(' | ') + '\n' : '';
  const cadastro = `Cadastrado em ${v.visitante_data_contato ?? '—'}.`;

  const status = (v.visitante_status ?? 'ATIVO').toLowerCase();
  let pergunta;
  if (status === 'convidado') {
    pergunta = 'Já foi convidado — está frequentando o PG?';
  } else if (status === 'esperando retorno') {
    pergunta = 'Ainda aguardando retorno do visitante.';
  } else {
    pergunta = 'Qual é a situação?';
  }

  return `${v.visitante_nome}\n${info}${cadastro} ${pergunta}`;
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

        // Lista de opções por visitante (o líder toca para escolher)
        for (const v of lider.visitantes) {
          const corpo = formatarVisitanteParaLider(v);
          await sendButtonsComFallback(
            lider.telefone,
            corpo,
            [
              { text: '⏳ Não respondeu ainda', id: `esperando:${v.id}`  },
              { text: '📩 Convidei para o PG',  id: `convidado:${v.id}` },
              { text: '🚫 Perfil não atende',   id: `nao_atende:${v.id}` },
            ],
          );

          logMensagemLider({
            liderNome:     lider.nome,
            liderTelefone: lider.telefone,
            tipo:          'lembrete',
            visitanteNome: v.visitante_nome,
            visitanteId:   v.id,
            mensagem:      corpo,
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
  // Cache em memória para evitar leitura de arquivo a cada hora
  if (ultimoEnvio === dataHoje) return;
  // Na inicialização (ou após restart), verifica o log do dia no disco
  if (jaEnviouHojeNoLog()) {
    log('Lembrete do dia já registrado no log — nenhum envio necessário.');
    ultimoEnvio = dataHoje; // aquece o cache
    return;
  }
  await dispararLembretes();
  ultimoEnvio = dataHoje; // marca só após completar
}

function iniciar() {
  log('Agendador iniciado — lembretes diários para líderes com visitantes pendentes.');

  // Verifica imediatamente na inicialização (evita perder o dia se o servidor reiniciou)
  verificarEDisparar();

  setInterval(verificarEDisparar, CHECK_INTERVAL_MS);
}

// Reduz número para forma canônica de 10 dígitos (sem 55, sem o 9 extra do DDD)
function canonico(tel) {
  const d = tel.replace(/\D/g, '').replace(/^55/, '');
  return d.length === 11 && d[2] === '9' ? d.slice(0, 2) + d.slice(3) : d;
}

// Reenvia lembretes apenas para um líder específico (aceita qualquer variante do número)
async function dispararLembretesLider(telefone) {
  const telCanon = canonico(telefone);
  log(`Reenvio forçado para líder ${telCanon}...`);
  try {
    const todos = await buscarVisitantesSemContato();
    const liderVisitantes = todos.filter(v => {
      return canonico(v.lider_telefone ?? '') === telCanon;
    });
    if (!liderVisitantes.length) {
      log(`Nenhum visitante pendente para ${telNorm}.`);
      return { enviados: 0 };
    }
    const lideres = agruparPorLider(liderVisitantes);
    for (const lider of lideres) {
      const saudacao =
        `Oi líder ${lider.nome}! 😊 Passando para lembrar que você tem visitante(s) aguardando.\n` +
        `Para cada um, é só selecionar o status abaixo 👇`;
      await sendTextComFallback(lider.telefone, saudacao);
      for (const v of lider.visitantes) {
        const corpo = formatarVisitanteParaLider(v);
        await sendButtonsComFallback(
          lider.telefone,
          corpo,
          [
            { text: '⏳ Não respondeu ainda', id: `esperando:${v.id}`  },
            { text: '📩 Convidei para o PG',  id: `convidado:${v.id}` },
            { text: '🚫 Perfil não atende',   id: `nao_atende:${v.id}` },
          ],
        );
        logMensagemLider({
          liderNome:     lider.nome,
          liderTelefone: lider.telefone,
          tipo:          'lembrete',
          visitanteNome: v.visitante_nome,
          visitanteId:   v.id,
          mensagem:      corpo,
        });
      }
      log(`Reenvio concluído para ${lider.nome} — ${lider.visitantes.length} visitante(s)`);
    }
    return { enviados: liderVisitantes.length };
  } catch (err) {
    log(`Erro no reenvio para ${telNorm}: ${err.message}`);
    throw err;
  }
}

module.exports = { iniciar, dispararLembretes, dispararLembretesLider };
