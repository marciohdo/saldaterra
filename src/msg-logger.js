const fs   = require('fs');
const path = require('path');

const LOG_DIR = path.join(__dirname, '..', 'logs');

function dataHoje() {
  return new Date().toLocaleDateString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).split('/').reverse().join('-'); // YYYY-MM-DD
}

function logMensagemLider({ liderNome, liderTelefone, tipo, mensagem, visitanteNome, visitanteId }) {
  try {
    if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

    const arquivo = path.join(LOG_DIR, `lideres-${dataHoje()}.log`);
    const ts      = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });

    const entrada = JSON.stringify({
      ts,
      lider:     liderNome ?? liderTelefone,
      telefone:  liderTelefone,
      tipo,                          // 'lembrete' | 'confirmacao_lista' | 'resposta_bot'
      visitante: visitanteNome ?? null,
      visitanteId: visitanteId ?? null,
      mensagem:  mensagem?.slice(0, 300),  // primeiros 300 chars
    });

    fs.appendFileSync(arquivo, entrada + '\n', 'utf8');
  } catch (err) {
    console.error('[msg-logger] Erro ao gravar log:', err.message);
  }
}

module.exports = { logMensagemLider };
