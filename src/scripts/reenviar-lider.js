require('../load-env');
const { buscarVisitantePorId, atualizarStatusVisitante } = require('../supabase');
const { sendTextComFallback } = require('../evolution-api');

const ID = 280; // Sarah Mendonça Arantes

async function main() {
  const v = await buscarVisitantePorId(ID);
  if (!v) { console.error('Visitante não encontrado'); process.exit(1); }

  console.log(`Visitante: ${v.visitante_nome}`);
  console.log(`Líder: ${v.lider} — ${v.lider_telefone}`);

  const msg =
    `Oi líder ${v.lider}, que alegria! 😊 Um novo visitante foi indicado para o seu PG.\n\n` +
    `Nome: ${v.visitante_nome}\n` +
    `Telefone: ${v.visitante_telefone}\n` +
    `Endereço: ${v.visitante_endereco}, ${v.visitante_bairro} - ${v.visitante_cidade}\n\n` +
    `Entre em contato com ele(a) para dar as boas-vindas! 🌟`;

  try {
    const enviado = await sendTextComFallback(v.lider_telefone, msg);
    console.log(`Mensagem enviada para: ${enviado}`);
    await atualizarStatusVisitante(ID, { lider_avisado: 'sim' });
    console.log('lider_avisado atualizado para sim');
  } catch (err) {
    console.error(`Falhou: ${err.message} (type=${err.type})`);
    await atualizarStatusVisitante(ID, { lider_avisado: 'não' });
  }
}

main();
