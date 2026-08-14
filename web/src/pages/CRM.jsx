import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import SemaforoBot from '../components/SemaforoBot'
import { useBotStatus } from '../hooks/useBotStatus'

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
  'perfil não atende':   '#ef4444',
  'desistiu':            '#ef4444',
  'lotado':              '#f97316',
  'numero_inexistente':  '#9ca3af',
  'esperando retorno':   '#8b5cf6',
}

const STATUS_LABELS = {
  'ativo':               'Ativo',
  'convidado':           'Convidado',
  'frequentando':        'Frequentando',
  'não atende':          'Não Atende',
  'perfil não atende':   'Perfil Não Atende',
  'desistiu':            'Desistiu',
  'lotado':              'Lotado',
  'numero_inexistente':  'Nº Inexistente',
  'esperando retorno':   'Aguardando',
}

function corStatus(s) {
  return STATUS_CORES[(s ?? '').toLowerCase()] ?? '#6b7280'
}

function labelStatus(s) {
  return STATUS_LABELS[(s ?? '').toLowerCase()] ?? (s || '—')
}

// O banco guarda "DD/MM/YYYY" ou "DD/MM/YYYY, HH:MM:SS" — converte para Date real
function parseDataContato(valor) {
  if (!valor) return null
  const [dataParte, horaParte] = valor.split(', ')
  const [d, m, y] = (dataParte ?? '').split('/').map(Number)
  if (!d || !m || !y) return null
  if (horaParte) {
    const [hh, mm, ss] = horaParte.split(':').map(Number)
    return new Date(y, m - 1, d, hh || 0, mm || 0, ss || 0)
  }
  return new Date(y, m - 1, d)
}

export default function CRM() {
  const [rows,    setRows]    = useState([])
  const [loading, setLoading] = useState(true)
  const [erro,    setErro]    = useState('')
  const [busca,   setBusca]   = useState('')
  const [statusFiltro, setStatusFiltro] = useState('todos')
  const botStatus = useBotStatus()
  const nav = useNavigate()

  useEffect(() => {
    if (!sessionStorage.getItem('auth')) { nav('/'); return }
    fetchDados()
  }, [])

  async function fetchDados() {
    setLoading(true)
    setErro('')
    try {
      const res = await fetch(
        `${URL}/rest/v1/LISTA_ACIONAMENTOS` +
        `?select=id,visitante_nome,visitante_telefone,visitante_status,visitante_data_contato,lider,lider_telefone`,
        { headers: HDR }
      )
      if (!res.ok) throw new Error(await res.text())
      const dados = await res.json()
      // Mais recente primeiro
      dados.sort((a, b) => (parseDataContato(b.visitante_data_contato) ?? 0) - (parseDataContato(a.visitante_data_contato) ?? 0))
      setRows(dados)
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

  const statusDisponiveis = [...new Set(rows.map(r => (r.visitante_status ?? 'ativo').toLowerCase()))].sort()

  const filtrado = rows.filter(r => {
    const statusOk = statusFiltro === 'todos' || (r.visitante_status ?? 'ativo').toLowerCase() === statusFiltro
    if (!statusOk) return false
    if (!busca.trim()) return true
    const alvo = busca.toLowerCase()
    return [r.visitante_nome, r.visitante_telefone, r.lider, r.lider_telefone]
      .some(v => String(v ?? '').toLowerCase().includes(alvo))
  })

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      {/* Header */}
      <header className="bg-blue-800 text-white px-6 py-4 flex items-center justify-between shadow-md flex-shrink-0">
        <div className="flex items-center gap-3">
          <img src="/icone.png" alt="Sal da Terra" className="h-10 object-contain" />
          <div>
            <h1 className="text-lg font-bold leading-tight">Igreja Sal da Terra</h1>
            <p className="text-blue-200 text-lg font-bold mt-0.5">CRM de Visitantes</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <input
            type="text"
            placeholder="Buscar visitante, líder..."
            value={busca}
            onChange={e => setBusca(e.target.value)}
            className="text-sm text-gray-800 px-3 py-1.5 rounded-lg border-0 focus:outline-none focus:ring-2 focus:ring-blue-300 w-56"
          />
          <select
            value={statusFiltro}
            onChange={e => setStatusFiltro(e.target.value)}
            className="text-sm text-gray-800 px-3 py-1.5 rounded-lg border-0 focus:outline-none focus:ring-2 focus:ring-blue-300"
          >
            <option value="todos">Todos os status</option>
            {statusDisponiveis.map(s => (
              <option key={s} value={s}>{labelStatus(s)}</option>
            ))}
          </select>
          <button
            onClick={() => nav('/dashboard')}
            className="bg-blue-700 hover:bg-blue-600 border border-blue-400 text-white px-4 py-1.5 rounded-lg text-sm transition-colors"
          >
            Análises
          </button>
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

      {/* Contagem */}
      <div className="px-6 py-2 text-xs text-gray-500 flex-shrink-0">
        {loading ? 'Carregando...' : `${filtrado.length} registro(s)${busca || statusFiltro !== 'todos' ? ` — filtrado de ${rows.length}` : ''}`}
        {erro && <span className="text-red-500 ml-4">{erro}</span>}
      </div>

      {/* Tabela */}
      <main className="flex-1 px-6 pb-6 overflow-hidden">
        <div className="overflow-auto rounded-xl shadow border border-gray-200 bg-white h-full">
          <table className="min-w-full text-sm border-collapse">
            <thead className="sticky top-0 z-10">
              <tr className="bg-blue-800 text-white">
                <th className="px-3 py-3 text-left whitespace-nowrap font-semibold text-xs tracking-wide border-r border-blue-700">Visitante</th>
                <th className="px-3 py-3 text-left whitespace-nowrap font-semibold text-xs tracking-wide border-r border-blue-700">Telefone</th>
                <th className="px-3 py-3 text-left whitespace-nowrap font-semibold text-xs tracking-wide border-r border-blue-700">Líder</th>
                <th className="px-3 py-3 text-left whitespace-nowrap font-semibold text-xs tracking-wide border-r border-blue-700">Telefone do Líder</th>
                <th className="px-3 py-3 text-left whitespace-nowrap font-semibold text-xs tracking-wide border-r border-blue-700">Data do Contato</th>
                <th className="px-3 py-3 text-left whitespace-nowrap font-semibold text-xs tracking-wide">Status</th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="text-center py-16 text-gray-400">Carregando dados...</td>
                </tr>
              ) : filtrado.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-16 text-gray-400">Nenhum registro encontrado.</td>
                </tr>
              ) : (
                filtrado.map((row, i) => (
                  <tr
                    key={row.id}
                    className={`border-b border-gray-100 last:border-b-0 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50'} hover:bg-blue-50 transition-colors`}
                  >
                    <td className="px-3 py-2 border-r border-gray-100 text-xs text-gray-800 font-medium whitespace-nowrap">
                      {row.visitante_nome || <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-3 py-2 border-r border-gray-100 text-xs text-gray-600 whitespace-nowrap">
                      {row.visitante_telefone || <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-3 py-2 border-r border-gray-100 text-xs text-gray-700 whitespace-nowrap">
                      {row.lider || <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-3 py-2 border-r border-gray-100 text-xs text-gray-600 whitespace-nowrap">
                      {row.lider_telefone || <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-3 py-2 border-r border-gray-100 text-xs text-gray-600 whitespace-nowrap">
                      {row.visitante_data_contato || <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <span
                        className="inline-block px-2 py-0.5 rounded-full text-xs font-semibold text-white"
                        style={{ backgroundColor: corStatus(row.visitante_status) }}
                      >
                        {labelStatus(row.visitante_status)}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  )
}
