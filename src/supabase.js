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
async function buscarPGProximo(cidade, bairro, estadoCivil, temCriancas, idade, endereco) {
  const perfil = determinarPerfil(estadoCivil, temCriancas, idade);
  console.log(`[supabase] buscarPGProximo — perfil=${perfil} cidade=${cidade}`);

  const pg = await _buscarPorPerfil(perfil, cidade, bairro, endereco, estadoCivil, temCriancas, idade);
  if (pg) return pg;

  // Fallback: tenta com perfil Familia
  if (perfil !== 'Familia') {
    console.log('[supabase] Fallback para perfil Familia');
    return _buscarPorPerfil('Familia', cidade, bairro, endereco, estadoCivil, temCriancas, idade);
  }
  return null;
}

async function _buscarPorPerfil(perfil, cidade, bairro, endereco, estadoCivil, temCriancas, idade) {
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

  // Calcula distância real para cada PG e ordena pelo mais próximo
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
  const melhor = comDistancia[0];
  console.log(`[supabase] PG mais próximo: ${melhor.LIDER} — ${melhor.distancia_km} km`);
  return melhor;
}

// Busca cadastro apenas pelo telefone (verificação rápida na chegada)
async function buscarVisitantePorTelefone(telefone) {
  const tel = encodeURIComponent(telefone);
  const url = `${BASE}/rest/v1/LISTA_ACIONAMENTOS?visitante_telefone=eq.${tel}&select=id,visitante_nome,visitante_telefone,lider,lider_telefone,visitante_status&limit=1`;
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);
  const rows = await res.json();
  return rows[0] ?? null;
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
