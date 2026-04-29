require('./load-env');

const BASE = process.env.SUPABASE_URL;
const KEY  = process.env.SUPABASE_KEY;

async function inserirVisitante(dados) {
  const res = await fetch(`${BASE}/rest/v1/LISTA_ACIONAMENTOS`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: KEY,
      Authorization: `Bearer ${KEY}`,
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(dados),
  });
  if (!res.ok) {
    throw new Error(`Supabase ${res.status}: ${await res.text()}`);
  }
}

module.exports = { inserirVisitante };
