require('./load-env');

const BASE = process.env.SUPABASE_URL;
const KEY  = process.env.SUPABASE_KEY;

const HEADERS = {
  'Content-Type': 'application/json',
  apikey: KEY,
  Authorization: `Bearer ${KEY}`,
};

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

// Busca o PG mais adequado por cidade e bairro na LISTA_PGS
async function buscarPGProximo(cidade, bairro) {
  const cidadeEnc = encodeURIComponent(cidade);
  const url = `${BASE}/rest/v1/LISTA_PGS?CIDADE=ilike.${cidadeEnc}&select=LIDER,CONTATO,BAIRRO,CIDADE,REDE,PERFIL,"DIA DO PG",HORARIO`;

  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);

  const pgs = await res.json();
  if (!pgs.length) return null;

  // Tenta encontrar PG no mesmo bairro (case-insensitive)
  const bairroNorm = bairro?.toLowerCase().trim() ?? '';
  const mesmoBairro = pgs.find(
    (pg) => pg.BAIRRO?.toLowerCase().trim() === bairroNorm
  );

  return mesmoBairro ?? pgs[0]; // fallback: primeiro PG da cidade
}

// Verifica se o visitante já tem cadastro pelo telefone ou nome
async function buscarVisitante(telefone, nome) {
  const tel  = encodeURIComponent(telefone);
  const url  = `${BASE}/rest/v1/LISTA_ACIONAMENTOS?visitante_telefone=eq.${tel}&select=id,visitante_nome,visitante_telefone,lider,visitante_status&limit=1`;
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

module.exports = { inserirVisitante, buscarPGProximo, buscarVisitante };
