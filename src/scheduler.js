require('./load-env');
const fs   = require('fs');
const path = require('path');
const {
  buscarVisitantesSemContato,
  buscarVisitantesConvidados,
  buscarVisitantePorId,
} = require('./supabase');
const { sendTextComFallback, sendButtonsComFallback, formatarTelefoneExibicao } = require('./whatsapp');
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

// Tipos de log que indicam que a rotina diária (lembretes + check-in de 15 dias) já rodou hoje
const TIPOS_ROTINA_DIARIA = new Set(['lembrete', 'checkin_15dias']);

// Verifica no arquivo de log do dia se já houve um disparo da rotina diária
function jaEnviouHojeNoLog() {
  try {
    const arquivo = path.join(LOG_DIR, `lideres-${hojeISO()}.log`);
    if (!fs.existsSync(arquivo)) return false;
    const conteudo = fs.readFileSync(arquivo, 'utf8');
    return conteudo.split('\n').some(linha => {
      if (!linha.trim()) return false;
      try { return TIPOS_ROTINA_DIARIA.has(JSON.parse(linha).tipo); } catch { return false; }
    });
  } catch {
    return false;
  }
}

// Converte "DD/MM/YYYY" ou "DD/MM/YYYY, HH:MM:SS" para dias corridos desde o contato até hoje
function diasDesdeContato(dataContato) {
  const [dataParte] = (dataContato ?? '').split(',');
  const [d, m, y] = dataParte.trim().split('/').map(Number);
  if (!d || !m || !y) return null;
  const dataRef = new Date(y, m - 1, d);

  const [hd, hm, hy] = hoje().split('/').map(Number);
  const hojeRef = new Date(hy, hm - 1, hd);

  return Math.round((hojeRef - dataRef) / 86_400_000);
}

// Varre todos os logs diários e retorna o conjunto de IDs de visitante que já
// receberam o check-in de 15 dias alguma vez — evita reenvio em dias seguintes
// (cobre tanto o backlog de casos antigos quanto retentativa se o envio falhar)
function idsComCheckinEnviado() {
  const enviados = new Set();
  try {
    const arquivos = fs.readdirSync(LOG_DIR).filter(f => f.startsWith('lideres-') && f.endsWith('.log'));
    for (const arquivo of arquivos) {
      const conteudo = fs.readFileSync(path.join(LOG_DIR, arquivo), 'utf8');
      for (const linha of conteudo.split('\n')) {
        if (!linha.trim()) continue;
        try {
          const obj = JSON.parse(linha);
          if (obj.tipo === 'checkin_15dias' && obj.visitanteId != null) enviados.add(obj.visitanteId);
        } catch { /* linha inválida, ignora */ }
      }
    }
  } catch { /* sem diretório de logs ainda */ }
  return enviados;
}

function log(msg) {
  const ts = new Date().toLocaleTimeString('pt-BR');
  console.log(`[${ts}] [scheduler] ${msg}`);
}

function formatarVisitanteParaLider(v) {
  const partes = [];
  if (v.visitante_telefone) partes.push(`📱 ${formatarTelefoneExibicao(v.visitante_telefone)}`);
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
    // (compara só a parte "DD/MM/YYYY" pois visitante_data_contato agora também guarda a hora)
    const dataHoje = hoje();
    const visitantes = todos.filter(v => v.visitante_data_contato?.slice(0, 10) !== dataHoje);
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
          const statusV = (v.visitante_status ?? '').toLowerCase();
          const botoes = statusV === 'esperando retorno'
            ? [
                { text: '📩 Contato feito',        id: `convidado:${v.id}`   },
                { text: '📵 Não atende o contato', id: `esperando:${v.id}`   },
                { text: '🚫 Perfil não atende',    id: `nao_atende:${v.id}`  },
              ]
            : [
                { text: '⏳ Não respondeu ainda',  id: `esperando:${v.id}`   },
                { text: '📩 Contato feito',        id: `convidado:${v.id}`   },
                { text: '🚫 Perfil não atende',    id: `nao_atende:${v.id}`  },
              ];
          await sendButtonsComFallback(lider.telefone, corpo, botoes);

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

// Check-in de 15 dias — visitantes com status "convidado" há 15 dias ou mais
// desde visitante_data_contato recebem uma pergunta ao líder sobre a frequência.
// Cada visitante recebe o check-in uma única vez (controlado via idsComCheckinEnviado).
async function dispararCheckInConvidados() {
  log('Verificando convidados para check-in de 15 dias...');
  try {
    const convidados = await buscarVisitantesConvidados();
    const jaEnviados = idsComCheckinEnviado();
    const alvos = convidados.filter(v => {
      const dias = diasDesdeContato(v.visitante_data_contato);
      return dias !== null && dias >= 15 && !jaEnviados.has(v.id);
    });

    if (!alvos.length) {
      log('Nenhum convidado pendente de check-in de 15 dias.');
      return;
    }

    const lideres = agruparPorLider(alvos);
    log(`${alvos.length} convidado(s) com 15+ dias pendentes de check-in em ${lideres.length} líder(es).`);

    for (const lider of lideres) {
      try {
        for (const v of lider.visitantes) {
          const partes = [];
          if (v.visitante_telefone) partes.push(`📱 ${formatarTelefoneExibicao(v.visitante_telefone)}`);
          if (v.visitante_idade)    partes.push(`${v.visitante_idade} anos`);
          if (v.visitante_bairro)   partes.push(`📍 ${v.visitante_bairro}`);
          const info  = partes.length ? partes.join(' | ') + '\n' : '';
          const dias  = diasDesdeContato(v.visitante_data_contato);
          const corpo = `${v.visitante_nome}\n${info}Já se passaram ${dias} dias desde o convite. Como está a situação?`;

          await sendButtonsComFallback(lider.telefone, corpo, [
            { text: '😕 Ainda não apareceu', id: `ainda_nao_apareceu:${v.id}` },
            { text: '❌ Desistiu',           id: `desistiu:${v.id}`           },
            { text: '✅ Frequentando',       id: `frequentando:${v.id}`       },
          ]);

          logMensagemLider({
            liderNome:     lider.nome,
            liderTelefone: lider.telefone,
            tipo:          'checkin_15dias',
            visitanteNome: v.visitante_nome,
            visitanteId:   v.id,
            mensagem:      corpo,
          });
        }
        log(`Check-in de 15 dias enviado para líder ${lider.nome} (${lider.telefone}) — ${lider.visitantes.length} visitante(s)`);
      } catch (err) {
        log(`Erro ao enviar check-in de 15 dias para ${lider.nome}: ${err.message}`);
      }
    }
  } catch (err) {
    log(`Erro ao buscar convidados para check-in: ${err.message}`);
  }
}

function dentroJanela() {
  const hora = new Date().toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    hour: 'numeric',
    hour12: false,
  });
  const h = parseInt(hora, 10);
  return h >= 8 && h < 20;
}

async function verificarEDisparar() {
  if (!dentroJanela()) {
    log('Fora da janela de envio (08h–20h) — aguardando próxima verificação.');
    return;
  }
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
  await dispararCheckInConvidados();
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
      log(`Nenhum visitante pendente para ${telCanon}.`);
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
        const statusV = (v.visitante_status ?? '').toLowerCase();
        const botoes = statusV === 'esperando retorno'
          ? [
              { text: '📩 Contato feito',        id: `convidado:${v.id}`  },
              { text: '📵 Não atende o contato', id: `esperando:${v.id}`  },
              { text: '🚫 Perfil não atende',    id: `nao_atende:${v.id}` },
            ]
          : [
              { text: '⏳ Não respondeu ainda',  id: `esperando:${v.id}`  },
              { text: '📩 Contato feito',        id: `convidado:${v.id}`  },
              { text: '🚫 Perfil não atende',    id: `nao_atende:${v.id}` },
            ];
        await sendButtonsComFallback(lider.telefone, corpo, botoes);
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
    log(`Erro no reenvio para ${telCanon}: ${err.message}`);
    throw err;
  }
}

// Envia um exemplo do check-in de 15 dias (texto + botões) para um número qualquer,
// usando um ID fictício — só para conferência visual, não grava log nem altera dado real.
async function enviarCheckInExemplo(telefoneDestino) {
  const idExemplo = 999999; // não corresponde a nenhum visitante real
  const corpo =
    `[EXEMPLO] Maria da Silva\n📱 34999998888 | 29 anos | 📍 Centro\n` +
    `Já se passaram 15 dias desde o convite. Como está a situação?`;

  await sendButtonsComFallback(telefoneDestino, corpo, [
    { text: '😕 Ainda não apareceu', id: `ainda_nao_apareceu:${idExemplo}` },
    { text: '❌ Desistiu',           id: `desistiu:${idExemplo}`           },
    { text: '✅ Frequentando',       id: `frequentando:${idExemplo}`       },
  ]);
  return { destino: telefoneDestino };
}

module.exports = { iniciar, dispararLembretes, dispararLembretesLider, dispararCheckInConvidados, enviarCheckInExemplo };
