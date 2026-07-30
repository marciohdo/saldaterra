import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  LineChart, Line,
} from 'recharts'

const URL = import.meta.env.VITE_SUPABASE_URL
const KEY = import.meta.env.VITE_SUPABASE_KEY
const HDR = {
  'Content-Type': 'application/json',
  apikey: KEY,
  Authorization: `Bearer ${KEY}`,
}

const STATUS_CORES = {
  'ativo':               '#3b82f6',
  'convidado':           '#f59e0b',
  'frequentando':        '#10b981',
  'não atende':          '#ef4444',
  'lotado':              '#f97316',
  'numero_inexistente':  '#9ca3af',
  'esperando retorno':   '#8b5cf6',
}

const STATUS_LABELS = {
  'ativo':              'Ativo',
  'convidado':          'Convidado',
  'frequentando':       'Frequentando',
  'não atende':         'Não Atende',
  'lotado':             'Lotado',
  'numero_inexistente': 'Nº Inexistente',
  'esperando retorno':  'Aguardando',
}

function corStatus(s) {
  return STATUS_CORES[(s ?? '').toLowerCase()] ?? '#6b7280'
}

function labelStatus(s) {
  return STATUS_LABELS[(s ?? '').toLowerCase()] ?? s
}

// Semáforo de status do bot — lido da tabela bot_status (heartbeat gravado pelo servidor)
const HEARTBEAT_LIMITE_MIN = 3

function SemaforoBot({ botStatus }) {
  let cor = '#9ca3af' // cinza — ainda não carregou
  let texto = 'Carregando status do bot...'

  if (botStatus) {
    const minutosAtras = (Date.now() - new Date(botStatus.updated_at).getTime()) / 60000
    if (minutosAtras > HEARTBEAT_LIMITE_MIN) {
      cor = '#ef4444' // vermelho — sem heartbeat recente, bot desativado
      texto = `Bot desativado (sem sinal há ${Math.round(minutosAtras)} min)`
    } else if (botStatus.status === 'problema') {
      cor = '#f59e0b' // amarelo — processo ativo, mas com problema
      texto = `Bot com problemas: ${botStatus.detalhe || 'verificar logs'}`
    } else {
      cor = '#10b981' // verde — ativo
      texto = 'Bot ativo'
    }
  }

  return (
    <div
      title={texto}
      className="flex items-center justify-center bg-blue-700 border border-blue-400 rounded-lg px-3 py-1.5"
    >
      <span className="h-3 w-3 rounded-full" style={{ backgroundColor: cor }} />
    </div>
  )
}

function CardKPI({ titulo, valor, sub, cor }) {
  return (
    <div className="bg-white rounded-xl shadow p-5 flex flex-col gap-1 border-l-4" style={{ borderLeftColor: cor }}>
      <span className="text-xs text-gray-500 font-medium uppercase tracking-wide">{titulo}</span>
      <span className="text-3xl font-bold text-gray-800">{valor ?? '—'}</span>
      {sub && <span className="text-xs text-gray-400">{sub}</span>}
    </div>
  )
}

function CustomTooltipPie({ active, payload }) {
  if (!active || !payload?.length) return null
  const { name, value, payload: p } = payload[0]
  const total = p.total
  const pct = total ? ((value / total) * 100).toFixed(1) : 0
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow px-3 py-2 text-xs">
      <p className="font-semibold">{name}</p>
      <p>{value} visitantes ({pct}%)</p>
    </div>
  )
}

export default function Dashboard() {
  const [dados,     setDados]     = useState([])
  const [loading,   setLoading]   = useState(true)
  const [erro,      setErro]      = useState('')
  const [botStatus, setBotStatus] = useState(null)
  const nav = useNavigate()

  useEffect(() => {
    if (!sessionStorage.getItem('auth')) { nav('/'); return }
    fetchDados()
    fetchBotStatus()
    const id = setInterval(fetchBotStatus, 30_000)
    return () => clearInterval(id)
  }, [])

  async function fetchBotStatus() {
    try {
      const res = await fetch(
        `${URL}/rest/v1/bot_status?id=eq.saldaterra&select=status,detalhe,updated_at`,
        { headers: HDR }
      )
      if (!res.ok) return
      const [row] = await res.json()
      if (row) setBotStatus(row)
    } catch {
      // Falha silenciosa — semáforo mantém o último status conhecido
    }
  }

  async function fetchDados() {
    setLoading(true)
    setErro('')
    try {
      const res = await fetch(
        `${URL}/rest/v1/LISTA_ACIONAMENTOS` +
        `?select=id,visitante_nome,visitante_telefone,visitante_status,visitante_data_contato,lider,lider_telefone` +
        `&order=visitante_data_contato.asc`,
        { headers: HDR }
      )
      if (!res.ok) throw new Error(await res.text())
      setDados(await res.json())
    } catch (e) {
      setErro('Erro ao carregar dados: ' + e.message)
    } finally {
      setLoading(false)
    }
  }

  function logout() {
    sessionStorage.clear()
    nav('/')
  }

  // ── Cálculos ──────────────────────────────────────────────────────────────

  const total       = new Set(dados.map(d => d.visitante_telefone).filter(Boolean)).size
  const frequentando = dados.filter(d => (d.visitante_status ?? '').toLowerCase() === 'frequentando').length
  const pendentes    = dados.filter(d => {
    const s = (d.visitante_status ?? '').toLowerCase()
    return s === 'ativo' || s === 'esperando retorno'
  }).length
  const taxaConversao = total ? ((frequentando / total) * 100).toFixed(1) : '0.0'

  // Distribuição por status
  const contadorStatus = {}
  for (const d of dados) {
    const s = (d.visitante_status ?? 'ativo').toLowerCase()
    contadorStatus[s] = (contadorStatus[s] ?? 0) + 1
  }
  const dadosPizza = Object.entries(contadorStatus)
    .sort((a, b) => b[1] - a[1])
    .map(([status, qtd]) => ({ name: labelStatus(status), value: qtd, status, total }))

  // Top líderes com visitantes pendentes (alinhado com buscarVisitantesDoLider)
  // 'convidado' é excluído: líder já cumpriu seu papel, aguarda o visitante
  const STATUS_TERMINAL = new Set(['frequentando', 'não atende', 'lotado', 'numero_inexistente', 'convidado', 'perfil não atende'])
  const pendentesPorLider = {}
  for (const d of dados) {
    const s = (d.visitante_status ?? '').toLowerCase()
    if (!STATUS_TERMINAL.has(s)) {
      const lider = d.lider || 'Sem líder'
      pendentesPorLider[lider] = (pendentesPorLider[lider] ?? 0) + 1
    }
  }
  const dadosLideresPendentes = Object.entries(pendentesPorLider)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([lider, qtd]) => ({ lider: lider.split(' ')[0], total: qtd }))

  // Top líderes com mais conversões (frequentando)
  const conversoesPorLider = {}
  for (const d of dados) {
    if ((d.visitante_status ?? '').toLowerCase() === 'frequentando') {
      const lider = d.lider || 'Sem líder'
      conversoesPorLider[lider] = (conversoesPorLider[lider] ?? 0) + 1
    }
  }
  const dadosLideresConversao = Object.entries(conversoesPorLider)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([lider, qtd]) => ({ lider: lider.split(' ')[0], total: qtd }))

  // Cadastros por dia (últimos 30 dias)
  // O banco armazena datas em DD/MM/YYYY — converte para YYYY-MM-DD para comparar
  function parseDateBR(dt) {
    if (!dt) return null
    const p = dt.split('/')
    if (p.length === 3) return `${p[2]}-${p[1]}-${p[0]}`
    return dt
  }

  const hoje = new Date()
  const limite = new Date(hoje)
  limite.setDate(hoje.getDate() - 29)
  const cadastrosPorDia = {}
  for (let i = 0; i < 30; i++) {
    const d = new Date(limite)
    d.setDate(limite.getDate() + i)
    cadastrosPorDia[d.toISOString().slice(0, 10)] = 0
  }
  for (const d of dados) {
    const dt = parseDateBR(d.visitante_data_contato)
    if (dt && cadastrosPorDia[dt] !== undefined) {
      cadastrosPorDia[dt]++
    }
  }
  const dadosCadastros = Object.entries(cadastrosPorDia).map(([data, qtd]) => ({
    data: data.slice(5),  // MM-DD
    qtd,
  }))

  // Funil de conversão
  const funil = [
    { etapa: 'Cadastrados',    qtd: total },
    { etapa: 'Com Líder',      qtd: dados.filter(d => d.lider).length },
    { etapa: 'Convidados',     qtd: dados.filter(d => (d.visitante_status ?? '').toLowerCase() === 'convidado').length },
    { etapa: 'Frequentando',   qtd: frequentando },
  ]

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      {/* Header */}
      <header className="bg-blue-800 text-white px-6 py-4 flex items-center justify-between shadow-md flex-shrink-0">
        <div className="flex items-center gap-3">
          <img src="/icone.png" alt="Sal da Terra" className="h-10 object-contain" />
          <div>
            <h1 className="text-lg font-bold leading-tight">Igreja Sal da Terra</h1>
            <p className="text-blue-200 text-lg font-bold mt-0.5">Painel de Análises</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => nav('/pgs')}
            className="bg-blue-700 hover:bg-blue-600 border border-blue-400 text-white px-4 py-1.5 rounded-lg text-sm transition-colors"
          >
            Pequenos Grupos
          </button>
          <SemaforoBot botStatus={botStatus} />
          <button
            onClick={fetchDados}
            className="bg-blue-700 hover:bg-blue-600 border border-blue-400 text-white px-3 py-1.5 rounded-lg text-sm transition-colors"
            title="Recarregar"
          >
            ↺
          </button>
          <button
            onClick={logout}
            className="bg-blue-900 hover:bg-blue-700 border border-blue-500 text-white px-4 py-1.5 rounded-lg text-sm transition-colors"
          >
            Sair
          </button>
        </div>
      </header>

      {/* Status bar */}
      <div className="px-6 py-2 text-xs text-gray-500 flex-shrink-0">
        {loading ? 'Carregando...' : `${total} visitante(s) no total`}
        {erro && <span className="text-red-500 ml-4">{erro}</span>}
      </div>

      {/* Conteúdo */}
      {loading ? (
        <div className="flex-1 flex items-center justify-center text-gray-400">Carregando dados...</div>
      ) : (
        <main className="flex-1 px-6 pb-8 overflow-auto">

          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <CardKPI titulo="Total de Visitantes" valor={total}         cor="#3b82f6" />
            <CardKPI titulo="Frequentando"         valor={frequentando} cor="#10b981" sub="entraram no PG" />
            <CardKPI titulo="Pendentes"            valor={pendentes}    cor="#f59e0b" sub="aguardando contato" />
            <CardKPI titulo="Taxa de Conversão"    valor={`${taxaConversao}%`} cor="#8b5cf6" sub="cadastrados → frequentando" />
          </div>

          {/* Linha 1: Pizza + Funil */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">

            {/* Distribuição por Status */}
            <div className="bg-white rounded-xl shadow p-5">
              <h2 className="text-sm font-semibold text-gray-700 mb-4">Distribuição por Status</h2>
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie
                    data={dadosPizza}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {dadosPizza.map((entry, i) => (
                      <Cell key={i} fill={corStatus(entry.status)} />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltipPie />} />
                  <Legend
                    iconType="circle"
                    iconSize={8}
                    formatter={(value) => <span className="text-xs text-gray-600">{value}</span>}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>

            {/* Funil de Conversão */}
            <div className="bg-white rounded-xl shadow p-5">
              <h2 className="text-sm font-semibold text-gray-700 mb-4">Funil de Conversão</h2>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={funil} layout="vertical" margin={{ left: 10, right: 30 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="etapa" tick={{ fontSize: 11 }} width={90} />
                  <Tooltip
                    formatter={(v) => [v, 'Visitantes']}
                    contentStyle={{ fontSize: 12 }}
                  />
                  <Bar dataKey="qtd" radius={[0, 4, 4, 0]}>
                    {funil.map((_, i) => (
                      <Cell key={i} fill={['#3b82f6', '#f59e0b', '#f97316', '#10b981'][i]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Linha 2: Cadastros por dia */}
          <div className="bg-white rounded-xl shadow p-5 mb-4">
            <h2 className="text-sm font-semibold text-gray-700 mb-4">Cadastros por Dia (últimos 30 dias)</h2>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={dadosCadastros} margin={{ left: 0, right: 10 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="data"
                  tick={{ fontSize: 10 }}
                  interval={4}
                />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} width={30} />
                <Tooltip
                  formatter={(v) => [v, 'Cadastros']}
                  contentStyle={{ fontSize: 12 }}
                />
                <Line
                  type="monotone"
                  dataKey="qtd"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Linha 3: Top líderes pendentes + conversões */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

            {/* Líderes com mais pendentes */}
            <div className="bg-white rounded-xl shadow p-5">
              <h2 className="text-sm font-semibold text-gray-700 mb-4">
                Top 10 Líderes — Visitantes Pendentes
              </h2>
              {dadosLideresPendentes.length === 0 ? (
                <p className="text-xs text-gray-400">Nenhum dado disponível.</p>
              ) : (
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={dadosLideresPendentes} layout="vertical" margin={{ left: 0, right: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                    <YAxis type="category" dataKey="lider" tick={{ fontSize: 11 }} width={80} />
                    <Tooltip
                      formatter={(v) => [v, 'Pendentes']}
                      contentStyle={{ fontSize: 12 }}
                    />
                    <Bar dataKey="total" fill="#f59e0b" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* Líderes com mais conversões */}
            <div className="bg-white rounded-xl shadow p-5">
              <h2 className="text-sm font-semibold text-gray-700 mb-4">
                Top 10 Líderes — Conversões (Frequentando)
              </h2>
              {dadosLideresConversao.length === 0 ? (
                <p className="text-xs text-gray-400">Nenhum dado disponível.</p>
              ) : (
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={dadosLideresConversao} layout="vertical" margin={{ left: 0, right: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                    <YAxis type="category" dataKey="lider" tick={{ fontSize: 11 }} width={80} />
                    <Tooltip
                      formatter={(v) => [v, 'Frequentando']}
                      contentStyle={{ fontSize: 12 }}
                    />
                    <Bar dataKey="total" fill="#10b981" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

        </main>
      )}
    </div>
  )
}
