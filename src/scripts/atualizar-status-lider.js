require('../load-env');
const { buscarVisitantesDoLider, atualizarStatusVisitante } = require('../supabase');

// Atualiza visitantes de um líder para "esperando retorno"
// Uso: node src/scripts/atualizar-status-lider.js <telefone_lider> <nome_visitante_parcial>
// Ex:  node src/scripts/atualizar-status-lider.js 3496917795 andrea

const [,, liderTel, nomeFiltro] = process.argv;
if (!liderTel) {
  console.error('Uso: node src/scripts/atualizar-status-lider.js <telefone_lider> [nome_visitante_parcial]');
  process.exit(1);
}

async function main() {
  const visitantes = await buscarVisitantesDoLider(liderTel);
  console.log(`Visitantes encontrados para ${liderTel}: ${visitantes.length}`);
  visitantes.forEach(v => console.log(`  ID ${v.id} | ${v.visitante_nome} | ${v.visitante_status}`));

  const alvos = nomeFiltro
    ? visitantes.filter(v => v.visitante_nome?.toLowerCase().includes(nomeFiltro.toLowerCase()))
    : visitantes;

  if (!alvos.length) {
    console.log('Nenhum visitante correspondente encontrado.');
    return;
  }

  for (const v of alvos) {
    await atualizarStatusVisitante(v.id, { visitante_status: 'esperando retorno' });
    console.log(`✓ ID ${v.id} (${v.visitante_nome}) → esperando retorno`);
  }
}

main().catch(err => { console.error(err); process.exit(1); });
