require('./load-env');

const BASE = process.env.SUPABASE_URL;
const KEY  = process.env.SUPABASE_KEY;

const HEADERS = {
  'Content-Type': 'application/json',
  apikey: KEY,
  Authorization: `Bearer ${KEY}`,
};

async function inserirVisitante(dados) {
  const res = await fetch(`${BASE}/rest/v1/LISTA_ACIONAMENTOS`, {
    method: 'POST',
    headers: { ...HEADERS, Prefer: 'return=minimal' },
    body: JSON.stringify(dados),
  });
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);
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

module.exports = { inserirVisitante, buscarPGProximo };
