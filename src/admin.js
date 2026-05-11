require('./load-env');
const { sendText, sendTyping } = require('./evolution-api');
const {
  buscarRelatorioVisitantesSemRetorno,
  buscarRelatorioLideresAtendimentoParado,
} = require('./supabase');

const ADMINS_NORM = new Set(['34998096868', '34996689999', '34999931849']);

function normalizarTel(tel) {
  return tel.startsWith('55') ? tel.slice(2) : tel;
}

function isAdmin(phone) {
  return ADMINS_NORM.has(normalizarTel(phone));
}

function log(phone, msg) {
  const ts = new Date().toLocaleTimeString('pt-BR');
  console.log(`[${ts}] [admin:${phone}] ${msg}`);
}

const MENU =
  `Olá! 👋 Sou o assistente administrativo da Igreja Sal da Terra.\n\n` +
  `Posso gerar os seguintes relatórios:\n\n` +
  `*1️⃣* Lista completa de visitantes que pediram PG e estão sem retorno\n` +
  `*2️⃣* Líderes com atendimentos parados ou incompletos (visitante, líder, status e datas)\n\n` +
  `Responda com o *número* do relatório desejado.`;

function formatarData(valor) {
  if (!valor) return '—';
  // Suporta "DD/MM/YYYY" direto ou ISO
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(valor)) return valor;
  try { return new Date(valor).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }); }
  catch { return valor; }
}

async function enviarEmPedacos(phone, linhas, cabecalho, rodape = '') {
  const LIMITE = 3500; // caracteres por mensagem para folga no WhatsApp
  let bloco = cabecalho;
  for (const linha of linhas) {
    if ((bloco + '\n\n' + linha).length > LIMITE) {
      await sendText(phone, bloco);
      bloco = linha;
    } else {
      bloco += (bloco ? '\n\n' : '') + linha;
    }
  }
  if (bloco) await sendText(phone, bloco + (rodape ? '\n\n' + rodape : ''));
}

async function handleAdmin(phone, text) {
  const cmd = text.trim();

  if (cmd === '1') {
    log(phone, 'Relatório 1 — visitantes sem retorno');
    await sendTyping(phone);
    try {
      const lista = await buscarRelatorioVisitantesSemRetorno();
      if (!lista.length) {
        await sendText(phone, '✅ Nenhum visitante pendente no momento.');
        return;
      }
      const linhas = lista.map((v, i) =>
        `${i + 1}. *${v.visitante_nome}*\n` +
        `   📱 ${v.visitante_telefone ?? '—'}\n` +
        `   Status: ${v.visitante_status ?? 'ATIVO'}\n` +
        `   Cadastro: ${formatarData(v.visitante_data_contato)}\n` +
        `   Líder: ${v.lider ?? '—'} / ${v.lider_telefone ?? '—'}`
      );
      await enviarEmPedacos(
        phone, linhas,
        `📋 *Visitantes sem retorno — ${lista.length} registro(s):*`
      );
      log(phone, `Relatório 1 enviado — ${lista.length} visitante(s)`);
    } catch (err) {
      log(phone, `Erro relatório 1: ${err.message}`);
      await sendText(phone, '❌ Erro ao gerar o relatório. Tente novamente.');
    }
    return;
  }

  if (cmd === '2') {
    log(phone, 'Relatório 2 — líderes com atendimento parado');
    await sendTyping(phone);
    try {
      const lideres = await buscarRelatorioLideresAtendimentoParado();
      if (!lideres.length) {
        await sendText(phone, '✅ Nenhum atendimento pendente no momento.');
        return;
      }
      const linhas = lideres.map(l => {
        const header = `👤 *${l.nome}* (${l.telefone}) — ${l.visitantes.length} visitante(s)`;
        const itens  = l.visitantes.map((v, i) =>
          `  ${i + 1}. ${v.visitante_nome}\n` +
          `     📱 ${v.visitante_telefone ?? '—'}\n` +
          `     Status: ${v.visitante_status ?? 'ATIVO'}\n` +
          `     Cadastro: ${formatarData(v.visitante_data_contato)}\n` +
          `     Últ. atualização: ${formatarData(v.Data_atu)}`
        );
        return header + '\n' + itens.join('\n');
      });
      await enviarEmPedacos(
        phone, linhas,
        `📋 *Líderes com atendimentos parados — ${lideres.length} líder(es):*`
      );
      log(phone, `Relatório 2 enviado — ${lideres.length} líder(es)`);
    } catch (err) {
      log(phone, `Erro relatório 2: ${err.message}`);
      await sendText(phone, '❌ Erro ao gerar o relatório. Tente novamente.');
    }
    return;
  }

  // Qualquer outra mensagem → menu
  await sendTyping(phone);
  await sendText(phone, MENU);
}

module.exports = { isAdmin, handleAdmin };
