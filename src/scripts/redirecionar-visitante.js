require('../load-env');
const { buscarVisitantePorId } = require('../supabase');
const { redirecionarVisitante } = require('../redirecionamento');

const ID = 284; // Thaynan Correa

async function main() {
  const v = await buscarVisitantePorId(ID);
  if (!v) { console.error('Visitante não encontrado'); process.exit(1); }
  console.log(`Visitante: ${v.visitante_nome} (id=${ID}) — líder atual: ${v.lider}`);
  await redirecionarVisitante(ID, {
    nome:        v.visitante_nome,
    telefone:    v.visitante_telefone,
    idade:       v.visitante_idade,
    estadoCivil: v.vistitante_est_civil,
    criancas:    v.visitante_criancas,
    endereco:    v.visitante_endereco,
    bairro:      v.visitante_bairro,
    cidade:      v.visitante_cidade,
  }, 'manual');
}

main();
