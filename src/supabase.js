require('./load-env');

const BASE = process.env.SUPABASE_URL;
const KEY  = process.env.SUPABASE_KEY;

const HEADERS = {
  'Content-Type': 'application/json',
  apikey: KEY,
  Authorization: `Bearer ${KEY}`,
};

const { determinarPerfil }    = require('./perfil');
const { distanciaVisitantePG } = require('./maps');

async function inserirVisitante(dados) {
  const url = `${BASE}/rest/v1/LISTA_ACIONAMENTOS`;
  console.log('[supabase] POST', url);
  console.log('[supabase] dados:', JSON.stringify(dados));

  const res = await fetch(url, {
    method: 'POST',
    headers: { ...HEADERS, Prefer: 'return=representation' },
    body: JSON.stringify(dados),
  });

  const body = await res.text();
  console.log(`[supabase] status: ${res.status} | body: ${body}`);

  if (!res.ok) throw new Error(`Supabase ${res.status}: ${body}`);
  return JSON.parse(body);
}

// Busca o PG mais próximo usando perfil do visitante + distância real via Google Maps
// Replica a lógica do fluxo n8n
async function buscarPGProximo(cidade, bairro, estadoCivil, temCriancas, idade, endereco, excluirLideres = []) {
  const perfil = determinarPerfil(estadoCivil, temCriancas, idade);
  const excluidos = excluirLideres.filter(Boolean);
  console.log(`[supabase] buscarPGProximo — perfil=${perfil} cidade=${cidade}${excluidos.length ? ` excluindo=${excluidos.join(', ')}` : ''}`);

  const pg = await _buscarPorPerfil(perfil, cidade, bairro, endereco, estadoCivil, temCriancas, idade, excluidos);
  if (pg) return pg;

  // Fallback: tenta com perfil Familia
  if (perfil !== 'Familia') {
    console.log('[supabase] Fallback para perfil Familia');
    return _buscarPorPerfil('Familia', cidade, bairro, endereco, estadoCivil, temCriancas, idade, excluidos);
  }
  return null;
}

async function _buscarPorPerfil(perfil, cidade, bairro, endereco, estadoCivil, temCriancas, idade, excluirLideres = []) {
  const cidadeEnc  = encodeURIComponent(cidade);
  const perfilEnc  = encodeURIComponent(perfil);
  const url = `${BASE}/rest/v1/LISTA_PGS` +
    `?CIDADE=ilike.${cidadeEnc}` +
    `&PERFIL=eq.${perfilEnc}` +
    `&Capacidade=is.null` +
    `&select=LIDER,CONTATO,BAIRRO,CIDADE,REDE,PERFIL,"DIA DO PG",HORARIO,ENDEREÇO`;

  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);

  const pgs = await res.json();
  console.log(`[supabase] PGs encontrados para perfil=${perfil}: ${pgs.length}`);
  if (!pgs.length) return null;

  // Calcula distância real via Google Maps para todos os PGs
  const comDistancia = await Promise.all(
    pgs.map(async (pg) => {
      try {
        const km = await distanciaVisitantePG(
          endereco, bairro, cidade,
          pg['ENDEREÇO'] ?? '', pg.BAIRRO ?? '', pg.CIDADE ?? ''
        );
        return { ...pg, distancia_km: km ?? Infinity };
      } catch {
        return { ...pg, distancia_km: Infinity };
      }
    })
  );

  comDistancia.sort((a, b) => a.distancia_km - b.distancia_km);

  // Filtra em JS todos os líderes já tentados (ignora maiúsculas/espaços)
  const excluirNorms = excluirLideres.map(l => l.trim().toLowerCase());
  const candidatos   = excluirNorms.length
    ? comDistancia.filter(pg => !excluirNorms.includes(pg.LIDER?.trim().toLowerCase()))
    : comDistancia;

  if (!candidatos.length) return null;

  const melhor = candidatos[0];
  console.log(`[supabase] PG selecionado: ${melhor.LIDER} — ${melhor.distancia_km} km${excluirNorms.length ? ` (excluídos: ${excluirLideres.join(', ')})` : ''}`);
  return melhor;
}

// Retorna todos os nomes de líderes já atribuídos a este visitante (histórico de tentativas)
async function buscarLideresAnteriores(telefone) {
  const tel = encodeURIComponent(telefone);
  const url = `${BASE}/rest/v1/LISTA_ACIONAMENTOS?visitante_telefone=eq.${tel}&select=lider&lider=not.is.null`;
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);
  const rows = await res.json();
  return [...new Set(rows.map(r => r.lider).filter(Boolean))];
}

// Busca todos os campos de um visitante pelo id (usado no redirecionamento)
async function buscarVisitantePorId(id) {
  const url = `${BASE}/rest/v1/LISTA_ACIONAMENTOS?id=eq.${id}` +
    `&select=id,visitante_nome,visitante_telefone,visitante_idade,vistitante_est_civil,visitante_criancas,visitante_endereco,visitante_bairro,visitante_cidade,lider,lider_telefone&limit=1`;
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);
  const rows = await res.json();
  return rows[0] ?? null;
}

// Busca cadastro apenas pelo telefone (verificação rápida na chegada)
async function buscarVisitantePorTelefone(telefone) {
  const tel = encodeURIComponent(telefone);
  const url = `${BASE}/rest/v1/LISTA_ACIONAMENTOS?visitante_telefone=eq.${tel}&select=id,visitante_nome,visitante_telefone,lider,lider_telefone,visitante_status&order=id.desc&limit=1`;
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);
  const rows = await res.json();
  return rows[0] ?? null;
}

// Verifica se o visitante já tem cadastro pelo telefone ou nome
async function buscarVisitante(telefone, nome) {
  const tel  = encodeURIComponent(telefone);
  const url  = `${BASE}/rest/v1/LISTA_ACIONAMENTOS?visitante_telefone=eq.${tel}&select=id,visitante_nome,visitante_telefone,lider,visitante_status&order=id.desc&limit=1`;
  const res  = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);
  const rows = await res.json();
  if (rows.length) return rows[0];

  // Fallback: busca por nome exato
  const nomeEnc = encodeURIComponent(nome);
  const url2    = `${BASE}/rest/v1/LISTA_ACIONAMENTOS?visitante_nome=ilike.${nomeEnc}&select=id,visitante_nome,visitante_telefone,lider,visitante_status&limit=1`;
  const res2    = await fetch(url2, { headers: HEADERS });
  if (!res2.ok) throw new Error(`Supabase ${res2.status}: ${await res2.text()}`);
  const rows2   = await res2.json();
  return rows2[0] ?? null;
}

// Verifica se o telefone pertence a um líder (LISTA_PGS ou LISTA_ACIONAMENTOS)
async function verificarLider(telefone) {
  // Números WhatsApp chegam como "5534xxxxxxxx"; banco pode armazenar sem "55" e/ou sem/com o 9 após DDD
  const telNorm = telefone.startsWith('55') ? telefone.slice(2) : telefone;
  // Variante sem o 9 (11 → 10 dígitos): 34998258133 → 3498258133
  const telSemNove = telNorm.length === 11 && telNorm[2] === '9'
    ? telNorm.slice(0, 2) + telNorm.slice(3)
    : null;
  // Variante com o 9 (10 → 11 dígitos): 3498258133 → 34998258133
  const telComNove = telNorm.length === 10
    ? telNorm.slice(0, 2) + '9' + telNorm.slice(2)
    : null;

  const set = new Set([
    telefone,                                        // 5534998258133
    telNorm,                                         // 34998258133
    ...(telSemNove ? [telSemNove, '55' + telSemNove] : []),  // 3498258133, 553498258133
    ...(telComNove ? [telComNove, '55' + telComNove] : []),  // 34998258133, 5534998258133
  ]);
  const variantes = [...set].map(encodeURIComponent);
  const orContato = variantes.map(v => `CONTATO.eq.${v}`).join(',');

  // Tenta LISTA_PGS — fonte autoritativa de líderes
  const url1 = `${BASE}/rest/v1/LISTA_PGS?or=(${orContato})` +
    `&select=LIDER,CONTATO,BAIRRO,CIDADE,REDE,PERFIL,"DIA DO PG",HORARIO&limit=1`;
  const res1 = await fetch(url1, { headers: HEADERS });
  if (!res1.ok) throw new Error(`Supabase ${res1.status}: ${await res1.text()}`);
  const rows1 = await res1.json();
  if (rows1.length) return { nome: rows1[0].LIDER?.trim(), telefone, fonte: 'LISTA_PGS', pg: rows1[0] };

  // Tenta LISTA_ACIONAMENTOS (coluna lider_telefone)
  const orLider = variantes.map(v => `lider_telefone.eq.${v}`).join(',');
  const url2 = `${BASE}/rest/v1/LISTA_ACIONAMENTOS?or=(${orLider})` +
    `&select=lider,lider_telefone&limit=1`;
  const res2 = await fetch(url2, { headers: HEADERS });
  if (!res2.ok) throw new Error(`Supabase ${res2.status}: ${await res2.text()}`);
  const rows2 = await res2.json();
  if (rows2.length) return { nome: rows2[0].lider?.trim(), telefone, fonte: 'LISTA_ACIONAMENTOS', pg: null };

  return null;
}

// Retorna visitantes pendentes (ATIVO ou convidado pelo lider) atribuídos a este líder
async function buscarVisitantesDoLider(liderTelefone) {
  const telNorm  = liderTelefone.startsWith('55') ? liderTelefone.slice(2) : liderTelefone;
  // inclui variantes com/sem o 9 após o DDD para cobrir diferentes formatos gravados no banco
  const telCom9  = telNorm.length === 10
    ? telNorm.slice(0, 2) + '9' + telNorm.slice(2)          // 10 → 11 dígitos
    : null;
  const telSem9  = telNorm.length === 11 && telNorm[2] === '9'
    ? telNorm.slice(0, 2) + telNorm.slice(3)                 // 11 → 10 dígitos
    : null;

  const variantes = [
    liderTelefone,                                           // ex: 553496917795
    telNorm,                                                 // ex: 3496917795
    ...(telCom9 ? [telCom9, '55' + telCom9] : []),          // ex: 34996917795, 5534996917795
    ...(telSem9 ? [telSem9, '55' + telSem9] : []),          // ex: 3496917795 (já incluso), mas cobre outros casos
  ];
  const orClause = [...new Set(variantes)].map(v => `lider_telefone.eq.${encodeURIComponent(v)}`).join(',');

  const url = `${BASE}/rest/v1/LISTA_ACIONAMENTOS` +
    `?or=(${orClause})` +
    `&visitante_status=not.in.(frequentando,não atende,lotado,numero_inexistente)` +
    `&select=id,visitante_nome,visitante_telefone,visitante_status,visitante_data_ini,visitante_data_fim,visitante_cidade,visitante_bairro` +
    `&order=id.desc`;
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);
  return res.json();
}

// Busca o PG mais próximo ignorando perfil — usado na 3ª tentativa em diante
async function buscarPGPorProximidade(cidade, bairro, endereco, excluirLideres = []) {
  const cidadeEnc  = encodeURIComponent(cidade);
  const excluidos  = excluirLideres.filter(Boolean);
  const url = `${BASE}/rest/v1/LISTA_PGS` +
    `?CIDADE=ilike.${cidadeEnc}` +
    `&Capacidade=is.null` +
    `&select=LIDER,CONTATO,BAIRRO,CIDADE,REDE,PERFIL,"DIA DO PG",HORARIO,ENDEREÇO`;

  console.log(`[supabase] buscarPGPorProximidade — cidade=${cidade} excluindo=${excluidos.join(', ')}`);
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);

  const pgs = await res.json();
  if (!pgs.length) return null;

  const comDistancia = await Promise.all(
    pgs.map(async (pg) => {
      try {
        const km = await distanciaVisitantePG(
          endereco, bairro, cidade,
          pg['ENDEREÇO'] ?? '', pg.BAIRRO ?? '', pg.CIDADE ?? ''
        );
        return { ...pg, distancia_km: km ?? Infinity };
      } catch {
        return { ...pg, distancia_km: Infinity };
      }
    })
  );

  comDistancia.sort((a, b) => a.distancia_km - b.distancia_km);

  const excluirNorms = excluidos.map(l => l.trim().toLowerCase());
  const candidatos   = excluirNorms.length
    ? comDistancia.filter(pg => !excluirNorms.includes(pg.LIDER?.trim().toLowerCase()))
    : comDistancia;

  if (!candidatos.length) return null;
  const melhor = candidatos[0];
  console.log(`[supabase] PG por proximidade: ${melhor.LIDER} — ${melhor.distancia_km} km`);
  return melhor;
}

// Retorna visitantes com status ATIVO (sem contato do líder) agrupados por líder
async function buscarVisitantesSemContato() {
  const url = `${BASE}/rest/v1/LISTA_ACIONAMENTOS` +
    `?visitante_status=not.in.(frequentando,não atende,lotado,numero_inexistente)` +
    `&lider_telefone=not.is.null` +
    `&lider_telefone=neq.` +
    `&select=id,visitante_nome,visitante_telefone,lider,lider_telefone,visitante_data_contato` +
    `&order=lider_telefone.asc`;
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);
  return res.json();
}

// Retorna o registro ativo mais recente de um visitante (status diferente dos terminais)
// Usado para evitar duplo encaminhamento
async function buscarVisitanteComPGAtivo(telefone) {
  const tel = encodeURIComponent(telefone);
  const url = `${BASE}/rest/v1/LISTA_ACIONAMENTOS` +
    `?visitante_telefone=eq.${tel}` +
    `&visitante_status=not.in.(frequentando,não atende,lotado,numero_inexistente)` +
    `&select=id,visitante_nome,lider,lider_telefone,visitante_status` +
    `&order=id.desc&limit=1`;
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);
  const rows = await res.json();
  return rows[0] ?? null;
}

// Relatório 1: todos os visitantes ativos/pendentes (sem retorno do líder)
async function buscarRelatorioVisitantesSemRetorno() {
  const url = `${BASE}/rest/v1/LISTA_ACIONAMENTOS` +
    `?visitante_status=not.in.(frequentando,não atende,lotado,numero_inexistente)` +
    `&select=id,visitante_nome,visitante_telefone,visitante_status,visitante_data_contato,lider,lider_telefone,Data_atu` +
    `&order=visitante_data_contato.asc`;
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);
  return res.json();
}

// Relatório 2: líderes agrupados com visitantes pendentes
async function buscarRelatorioLideresAtendimentoParado() {
  const url = `${BASE}/rest/v1/LISTA_ACIONAMENTOS` +
    `?visitante_status=not.in.(frequentando,não atende,lotado,numero_inexistente)` +
    `&lider_telefone=not.is.null` +
    `&lider_telefone=neq.` +
    `&select=id,visitante_nome,visitante_telefone,visitante_status,visitante_data_contato,Data_atu,lider,lider_telefone` +
    `&order=lider.asc,visitante_data_contato.asc`;
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);
  const rows = await res.json();

  const mapa = new Map();
  for (const r of rows) {
    const key = r.lider_telefone;
    if (!mapa.has(key)) mapa.set(key, { nome: r.lider ?? 'Sem nome', telefone: r.lider_telefone, visitantes: [] });
    mapa.get(key).visitantes.push(r);
  }
  return [...mapa.values()];
}

// Atualiza campos de um visitante pelo id
async function atualizarStatusVisitante(id, campos) {
  const url = `${BASE}/rest/v1/LISTA_ACIONAMENTOS?id=eq.${id}`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: { ...HEADERS, Prefer: 'return=representation' },
    body: JSON.stringify(campos),
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${body}`);
  return JSON.parse(body);
}

module.exports = {
  inserirVisitante,
  buscarPGProximo,
  buscarPGPorProximidade,
  buscarVisitante,
  buscarVisitantePorId,
  buscarVisitantePorTelefone,
  buscarLideresAnteriores,
  verificarLider,
  buscarVisitantesDoLider,
  buscarVisitantesSemContato,
  atualizarStatusVisitante,
  buscarVisitanteComPGAtivo,
  buscarRelatorioVisitantesSemRetorno,
  buscarRelatorioLideresAtendimentoParado,
};
