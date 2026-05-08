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

  // 2. Lista interativa para o visitante
  const listData = {
    title:       `Visitante: ${VISITANTE.nome}`,
    description: `Cadastrado em ${VISITANTE.data}. Qual é a situação?`,
    buttonText:  'Atualizar status',
    footerText:  'Igreja Sal da Terra',
    sections: [{
      title: 'Selecione uma opção:',
      rows: [
        { title: 'Não respondeu ainda',  description: 'Aguardando retorno do visitante', rowId: `esperando:${VISITANTE.id}` },
        { title: 'Perfil não atende',    description: 'Distância ou perfil inadequado',  rowId: `nao_atende:${VISITANTE.id}` },
        { title: 'Convidei para o PG',   description: 'Visitante foi convidado',         rowId: `convidado:${VISITANTE.id}` },
        { title: 'Está frequentando',    description: 'Visitante já participa do PG',    rowId: `frequentando:${VISITANTE.id}` },
      ],
    }],
  };

  await sendListComFallback(NUMERO, listData);
  console.log('✓ Lista interativa enviada');
}

main().catch(err => { console.error('Erro:', err.message); process.exit(1); });
