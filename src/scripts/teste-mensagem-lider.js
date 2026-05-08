require('../load-env');
const { sendTextComFallback, sendPollComFallback } = require('../evolution-api');

const NUMERO = '5534996689999';

const LIDER_NOME    = 'Lucas e Milena';
const VISITANTE     = { id: 273, nome: 'Andrea Ferreira', data: '07/05/2026' };

async function main() {
  console.log(`Enviando exemplo para ${NUMERO}...`);

  // 1. Saudação
  const saudacao =
    `Oi líder ${LIDER_NOME}! 😊 Passando para lembrar que você tem visitante(s) aguardando.\n` +
    `Para cada um, é só selecionar o status abaixo 👇`;
  await sendTextComFallback(NUMERO, saudacao);
  console.log('✓ Saudação enviada');

  // 2. Botões interativos para o visitante (3 botões — limite do WhatsApp)
  const BASE_URL = process.env.EVOLUTION_API_URL;
  const INSTANCE = process.env.EVOLUTION_INSTANCE;
  const API_KEY  = process.env.EVOLUTION_API_KEY;

  // 2. Enquete com as 4 opções
  const result = await sendPollComFallback(NUMERO, {
    name:            `${VISITANTE.nome} — Cadastrado em ${VISITANTE.data}. Qual é a situação?`,
    values:          ['⏳ Não respondeu ainda', '📩 Convidei para o PG', '✅ Está frequentando', '🚫 Perfil não atende'],
    selectableCount: 1,
  });
  console.log(`✓ Enquete enviada — pollId: ${result?.messageId}`);
}

main().catch(err => { console.error('Erro:', err.message); process.exit(1); });
