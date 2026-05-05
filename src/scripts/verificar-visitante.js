require('../load-env');

const BASE    = process.env.SUPABASE_URL;
const KEY     = process.env.SUPABASE_KEY;
const HEADERS = { 'Content-Type': 'application/json', apikey: KEY, Authorization: `Bearer ${KEY}` };

const PHONE = '553175629267';

async function main() {
  const tel  = PHONE.startsWith('55') ? PHONE.slice(2) : PHONE;
  const url  = `${BASE}/rest/v1/LISTA_ACIONAMENTOS?visitante_telefone=in.(${PHONE},${tel})&select=id,visitante_nome,lider,lider_telefone,visitante_status,lider_avisado,visitante_data_contato&order=id.desc`;
  const res  = await fetch(url, { headers: HEADERS });
  const rows = await res.json();
  console.table(rows);
}

main();
