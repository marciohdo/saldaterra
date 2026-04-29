// Teste de envio de mensagens pelos dois agentes via Evolution API (WhatsApp)
require('./src/load-env');
const { sendText } = require('./src/evolution-api');

const NUMERO_TESTE = '5534996689999';

const MENSAGENS = [
  {
    agente: 'Luz.ia',
    texto:
      '[TESTE] Oi, que alegria entrar em contato com a Igreja Sal da Terra! 🌟 Eu sou a Luz.ia e estou aqui pra te ajudar a encontrar seu Pequeno Grupo. Me conta, qual é o seu nome? 😊',
  },
  {
    agente: 'PG Visitante Acolhedor',
    texto:
      '[TESTE] Oi líder, que alegria entrar em contato com a Igreja Sal da Terra! 😊 Sou o agente PG Visitante Acolhedor. Poderia me informar sobre a frequência do visitante no PG?',
  },
];

async function main() {
  console.log(`Enviando mensagens de teste para ${NUMERO_TESTE}...\n`);

  for (const { agente, texto } of MENSAGENS) {
    try {
      console.log(`[${agente}] Enviando...`);
      const resp = await sendText(NUMERO_TESTE, texto);
      console.log(`[${agente}] ✓ Enviado — ID: ${resp.key?.id ?? JSON.stringify(resp)}\n`);
    } catch (err) {
      console.error(`[${agente}] ✗ Erro: ${err.message}\n`);
    }
  }
}

main();
