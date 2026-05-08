require('../load-env');
const { sendTextComFallback, sendListComFallback } = require('../evolution-api');

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

  const resBtn = await fetch(`${BASE_URL}/message/sendButtons/${INSTANCE}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: API_KEY },
    body: JSON.stringify({
      number:      NUMERO,
      title:       `Visitante: ${VISITANTE.nome}`,
      description: `Cadastrado em ${VISITANTE.data}. Qual é a situação?`,
      footer:      'Igreja Sal da Terra',
      buttons: [
        { buttonId: `esperando:${VISITANTE.id}`,   buttonText: { displayText: '❌ Não respondeu ainda' }, type: 'reply' },
        { buttonId: `convidado:${VISITANTE.id}`,   buttonText: { displayText: '📩 Convidei para o PG' },  type: 'reply' },
        { buttonId: `frequentando:${VISITANTE.id}`,buttonText: { displayText: '✅ Está frequentando' },   type: 'reply' },
      ],
    }),
  });
  const bodyBtn = await resBtn.text();
  console.log(`Botões — status ${resBtn.status}: ${bodyBtn.slice(0, 200)}`);

  // 3. Segunda mensagem com a opção restante
  const resBtn2 = await fetch(`${BASE_URL}/message/sendButtons/${INSTANCE}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: API_KEY },
    body: JSON.stringify({
      number:      NUMERO,
      title:       `Perfil de ${VISITANTE.nome}`,
      description: 'Se o visitante não se encaixa no seu PG:',
      footer:      'Igreja Sal da Terra',
      buttons: [
        { buttonId: `nao_atende:${VISITANTE.id}`, buttonText: { displayText: '🚫 Perfil não atende' }, type: 1 },
      ],
    }),
  });
  const bodyBtn2 = await resBtn2.text();
  console.log(`Botão perfil — status ${resBtn2.status}: ${bodyBtn2.slice(0, 200)}`);
}

main().catch(err => { console.error('Erro:', err.message); process.exit(1); });
