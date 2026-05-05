require('../load-env');
const {
  buscarVisitantePorId,
  buscarLideresAnteriores,
  buscarPGProximo,
  buscarPGPorProximidade,
  atualizarStatusVisitante,
  inserirVisitante,
} = require('../supabase');
const { sendTextComFallback } = require('../evolution-api');

// ── Configuração pontual ──────────────────────────────────────────────────────
const VISITANTE_ID = 282; // Hermom Silvestre Ribeiro
const MOTIVO       = 'não atende'; // motivo informado pelo líder
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  const v = await buscarVisitantePorId(VISITANTE_ID);
  if (!v) { console.error('Visitante não encontrado'); process.exit(1); }

  console.log(`Visitante: ${v.visitante_nome} (id=${VISITANTE_ID})`);
  console.log(`Líder atual: ${v.lider} — ${v.lider_telefone}`);

  // 1. Marca linha atual como não atende
  await atualizarStatusVisitante(VISITANTE_ID, { visitante_status: MOTIVO });
  console.log(`Status → ${MOTIVO}`);

  // 2. Histórico de líderes já tentados
  const anteriores = await buscarLideresAnteriores(v.visitante_telefone);
  const tentativa  = anteriores.length;
  console.log(`Tentativa #${tentativa + 1} — já tentados: ${anteriores.join(', ')}`);

  // 3. Busca próximo PG (mesma estratégia do servidor)
  let novoPG;
  if (tentativa >= 2) {
    console.log('3ª+ tentativa — buscando apenas por proximidade');
    novoPG = await buscarPGPorProximidade(
      v.visitante_cidade, v.visitante_bairro, v.visitante_endereco, anteriores
    );
  } else {
    novoPG = await buscarPGProximo(
      v.visitante_cidade, v.visitante_bairro,
      v.vistitante_est_civil, v.visitante_criancas,
      v.visitante_idade, v.visitante_endereco,
      anteriores
    );
  }

  if (!novoPG) {
    console.error('Nenhum PG disponível para redirecionamento');
    process.exit(1);
  }

  console.log(`Novo PG: ${novoPG.LIDER} — ${novoPG.CONTATO}`);

  // 4. Cria nova linha
  const novoReg = await inserirVisitante({
    visitante_nome:         v.visitante_nome,
    visitante_telefone:     v.visitante_telefone,
    visitante_idade:        v.visitante_idade,
    vistitante_est_civil:   v.vistitante_est_civil,
    visitante_criancas:     v.visitante_criancas,
    visitante_endereco:     v.visitante_endereco,
    visitante_bairro:       v.visitante_bairro,
    visitante_cidade:       v.visitante_cidade,
    lider:                  novoPG.LIDER,
    lider_telefone:         novoPG.CONTATO,
    visitante_status:       'ATIVO',
    visitante_data_contato: new Date().toLocaleDateString('pt-BR'),
    Data_atu:               new Date().toISOString(),
  });
  const novoId = novoReg?.[0]?.id ?? null;
  console.log(`Nova linha criada (id=${novoId})`);

  // 5. Notifica novo líder
  const msg =
    `Oi líder ${novoPG.LIDER}, que alegria! 😊 Um visitante foi redirecionado para o seu PG.\n\n` +
    `Nome: ${v.visitante_nome}\n` +
    `Telefone: ${v.visitante_telefone}\n` +
    `Idade: ${v.visitante_idade}\n` +
    `Estado civil: ${v.vistitante_est_civil}\n` +
    `Crianças: ${v.visitante_criancas}\n` +
    `Endereço: ${v.visitante_endereco}, ${v.visitante_bairro} - ${v.visitante_cidade}\n\n` +
    `Entre em contato com ele(a) para dar as boas-vindas! 🌟`;

  try {
    const enviado = await sendTextComFallback(novoPG.CONTATO, msg);
    console.log(`Líder ${novoPG.LIDER} notificado: ${enviado}`);
    if (novoId) await atualizarStatusVisitante(novoId, { lider_avisado: 'sim' });
  } catch (err) {
    console.error(`Erro ao notificar líder: ${err.message}`);
    if (novoId) await atualizarStatusVisitante(novoId, { lider_avisado: 'não' });
  }
}

main();
