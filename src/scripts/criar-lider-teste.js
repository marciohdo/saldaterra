require('../load-env');

const BASE    = process.env.SUPABASE_URL;
const KEY     = process.env.SUPABASE_KEY;
const HEADERS = {
  'Content-Type': 'application/json',
  apikey: KEY,
  Authorization: `Bearer ${KEY}`,
  Prefer: 'return=representation',
};

async function post(path, body) {
  const res = await fetch(`${BASE}/rest/v1/${path}`, {
    method: 'POST', headers: HEADERS, body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status}: ${text}`);
  return JSON.parse(text);
}

async function del(path) {
  const res = await fetch(`${BASE}/rest/v1/${path}`, {
    method: 'DELETE', headers: HEADERS,
  });
  if (!res.ok) throw new Error(`DELETE ${res.status}: ${await res.text()}`);
  console.log(`🗑  Deletado: ${path}`);
}

async function main() {
  const acao = process.argv[2]; // "criar" ou "apagar"

  if (acao === 'apagar') {
    await del('LISTA_PGS?LIDER=eq.LIDER_TESTE');
    await del('LISTA_ACIONAMENTOS?visitante_nome=eq.Visitante Teste');
    console.log('✅ Dados de teste removidos.');
    return;
  }

  // 1. Cria líder em LISTA_PGS
  const lider = await post('LISTA_PGS', {
    LIDER:      'LIDER_TESTE',
    CONTATO:    '34996689999',
    CONTATO_1:  '34996689999',
    CIDADE:     'Uberlândia',
    BAIRRO:     'Centro',
    REDE:       'TESTE',
    PERFIL:     'Familia',
    'DIA DO PG': 'Quarta',
    HORARIO:    '19:00',
    'ENDEREÇO': 'Rua Teste, 1',
  });
  console.log('✅ Líder criado:', JSON.stringify(lider[0] ?? lider));

  // 2. Cria visitante atribuído a esse líder em LISTA_ACIONAMENTOS
  const visitante = await post('LISTA_ACIONAMENTOS', {
    visitante_nome:         'Visitante Teste',
    visitante_telefone:     '5511999999999',
    lider:                  'LIDER_TESTE',
    lider_telefone:         '34996689999',
    visitante_status:       'ATIVO',
    visitante_data_contato: (() => { const d = new Date(); d.setDate(d.getDate() - 1); return d.toLocaleDateString('pt-BR'); })(),
    Data_atu:               new Date().toISOString(),
    visitante_cidade:       'Uberlândia',
    visitante_bairro:       'Centro',
    visitante_endereco:     'Rua Visitante, 1',
    visitante_idade:        '30',
    vistitante_est_civil:   'Solteiro',
    visitante_criancas:     'Não',
  });
  console.log('✅ Visitante criado:', JSON.stringify(visitante[0] ?? visitante));
  console.log('\nPróximo passo: envie uma mensagem pro bot com o número 34996689999.');
}

main().catch(err => { console.error('❌ Erro:', err.message); process.exit(1); });
