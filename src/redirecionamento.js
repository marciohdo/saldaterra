require('./load-env');
const {
  buscarPGProximo,
  buscarPGPorProximidade,
  buscarLideresAnteriores,
  inserirVisitante,
  atualizarStatusVisitante,
  buscarVisitanteComPGAtivo,
} = require('./supabase');
const { sendTextComFallback } = require('./evolution-api');

const MAX_TENTATIVAS = 5;
const SECRETARIA_PHONE = process.env.SECRETARIA_PHONE ?? '5534999318496';
const TEST_MODE  = process.env.TEST_MODE === 'true';
const TEST_PHONE = process.env.TEST_PHONE ?? '';

function log(id, msg) {
  const ts = new Date().toLocaleTimeString('pt-BR');
  console.log(`[${ts}] [${id}] [redirect] ${msg}`);
}

function msgParaLider(liderNome, v) {
  return (
    `Oi líder ${liderNome}, que alegria! 😊 Um visitante foi redirecionado para o seu PG.\n\n` +
    `Nome: ${v.nome}\nTelefone: ${v.telefone}\nIdade: ${v.idade}\n` +
    `Estado civil: ${v.estadoCivil}\nCrianças: ${v.criancas}\n` +
    `Endereço: ${v.endereco}, ${v.bairro} - ${v.cidade}\n\n` +
    `Entre em contato com ele(a) para dar as boas-vindas! 🌟`
  );
}

async function notificarSecretaria(v, totalTentativas) {
  const destino = TEST_MODE ? TEST_PHONE : SECRETARIA_PHONE;
  const msg =
    `Olá! 😊 Precisamos de ajuda para encaminhar um visitante.\n\n` +
    `Nome: ${v.nome}\nTelefone: ${v.telefone}\n` +
    `Endereço: ${v.endereco}, ${v.bairro} - ${v.cidade}\n` +
    `Idade: ${v.idade} | Estado civil: ${v.estadoCivil} | Crianças: ${v.criancas}\n\n` +
    `Tentamos ${totalTentativas} PGs e nenhum conseguiu ser notificado. Pode verificar manualmente? 🙏`;
  try {
    await sendTextComFallback(destino, msg);
    log('secretaria', `Notificada após ${totalTentativas} tentativas para ${v.nome}`);
  } catch (e) {
    log('secretaria', `Erro ao notificar secretaria: ${e.message}`);
  }
}

/**
 * Marca a linha atual como 'numero_inexistente' e percorre PGs em sequência
 * até conseguir notificar um líder por WhatsApp.
 *
 * @param {number}  idLinhaAtual - ID da linha no banco a marcar como numero_inexistente
 * @param {object}  v            - dados do visitante { nome, telefone, idade, estadoCivil,
 *                                  criancas, endereco, bairro, cidade }
 * @param {string}  identificador - string para log (ex: phone do visitante)
 */
async function redirecionarVisitante(idLinhaAtual, v, identificador) {
  try {
    await atualizarStatusVisitante(idLinhaAtual, { visitante_status: 'numero_inexistente' });
    log(identificador, `Linha ${idLinhaAtual} → numero_inexistente. Buscando próximo PG...`);

    // Carrega histórico completo de líderes já tentados para este visitante
    const excluidos = await buscarLideresAnteriores(v.telefone);

    for (let t = 0; t < MAX_TENTATIVAS; t++) {
      const totalJaTentados = excluidos.length;
      log(identificador, `Tentativa ${t + 1} — excluídos: ${excluidos.join(', ') || '(nenhum)'}`);

      // 1ª e 2ª tentativa: usa perfil; 3ª em diante: só proximidade
      const pg = totalJaTentados >= 2
        ? await buscarPGPorProximidade(v.cidade, v.bairro, v.endereco, excluidos)
        : await buscarPGProximo(v.cidade, v.bairro, v.estadoCivil, v.criancas, v.idade, v.endereco, excluidos);

      if (!pg) {
        log(identificador, `Nenhum PG disponível na tentativa ${t + 1}`);
        if (totalJaTentados >= 3) await notificarSecretaria(v, totalJaTentados + 1);
        return;
      }

      // Garante que não existe outro PG ativo para este visitante antes de inserir
      const pgAtivo = await buscarVisitanteComPGAtivo(v.telefone);
      if (pgAtivo) {
        log(identificador, `Abortado: ${v.nome} já tem PG ativo (líder: ${pgAtivo.lider}, status: ${pgAtivo.visitante_status})`);
        return;
      }

      const novoReg = await inserirVisitante({
        visitante_nome:         v.nome,
        visitante_telefone:     v.telefone,
        visitante_idade:        v.idade,
        vistitante_est_civil:   v.estadoCivil,
        visitante_criancas:     v.criancas,
        visitante_endereco:     v.endereco,
        visitante_bairro:       v.bairro,
        visitante_cidade:       v.cidade,
        lider:                  pg.LIDER,
        lider_telefone:         pg.CONTATO,
        visitante_status:       'ATIVO',
        visitante_data_contato: new Date().toLocaleDateString('pt-BR'),
        Data_atu:               new Date().toISOString(),
      });
      const novoId = novoReg?.[0]?.id ?? null;
      log(identificador, `Nova linha → ${pg.LIDER} (id=${novoId})`);

      const destino = TEST_MODE ? TEST_PHONE : pg.CONTATO;
      try {
        const enviado = await sendTextComFallback(destino, msgParaLider(pg.LIDER, v));
        log(identificador, `Líder ${pg.LIDER} notificado: ${enviado}`);
        if (novoId) await atualizarStatusVisitante(novoId, { lider_avisado: 'sim' }).catch(() => {});
        return; // entregue com sucesso — encerra o loop
      } catch (err) {
        log(identificador, `Falhou ao notificar ${pg.LIDER}: ${err.message}`);
        if (novoId) await atualizarStatusVisitante(novoId, { lider_avisado: 'não' }).catch(() => {});
        if (err.type !== 'numero_inexistente') return; // erro não relacionado ao número — encerra
        // número inválido → marca linha e tenta próximo PG
        if (novoId) await atualizarStatusVisitante(novoId, { visitante_status: 'numero_inexistente' }).catch(() => {});
        excluidos.push(pg.LIDER);
      }
    }

    log(identificador, `Máximo de ${MAX_TENTATIVAS} tentativas atingido para ${v.nome}`);
    await notificarSecretaria(v, excluidos.length);
  } catch (err) {
    log(identificador, `Erro no redirecionamento: ${err.message}`);
    console.error(err);
  }
}

module.exports = { redirecionarVisitante };
