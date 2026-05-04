import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

const URL  = import.meta.env.VITE_SUPABASE_URL
const KEY  = import.meta.env.VITE_SUPABASE_KEY
const HDR  = {
  'Content-Type': 'application/json',
  apikey: KEY,
  Authorization: `Bearer ${KEY}`,
}

const COLUMNS = [
  { key: 'LIDER',         label: 'Líder',        w: 180 },
  { key: 'CONTATO',       label: 'Contato',       w: 130 },
  { key: 'CONTATO_1',     label: 'Contato 2',     w: 130 },
  { key: 'CO-LIDER',      label: 'Co-Líder',      w: 150 },
  { key: 'CIDADE',        label: 'Cidade',        w: 120 },
  { key: 'BAIRRO',        label: 'Bairro',        w: 140 },
  { key: 'ENDEREÇO',      label: 'Endereço',      w: 220 },
  { key: 'DIA DO PG',     label: 'Dia do PG',     w: 120 },
  { key: 'HORARIO',       label: 'Horário',       w: 90  },
  { key: 'REDE',          label: 'Rede',          w: 110 },
  { key: 'PERFIL',        label: 'Perfil',        w: 110 },
  { key: 'IGREJA',        label: 'Igreja',        w: 80  },
  { key: 'Capacidade',    label: 'Capacidade',    w: 100 },
  { key: 'Faixa Etária',  label: 'Faixa Etária',  w: 110 },
  { key: 'Qtde part.',    label: 'Qtde Part.',    w: 90  },
]

const EMPTY_ROW = Object.fromEntries(COLUMNS.map(c => [c.key, '']))

export default function PGs() {
  const [rows,    setRows]    = useState([])
  const [editing, setEditing] = useState({})
  const [loading, setLoading] = useState(true)
  const [erro,    setErro]    = useState('')
  const [busca,   setBusca]   = useState('')
  const nav = useNavigate()

  useEffect(() => {
    if (!sessionStorage.getItem('auth')) { nav('/'); return }
    fetchPGs()
  }, [])

  async function fetchPGs() {
    setLoading(true)
    setErro('')
    try {
      const res = await fetch(`${URL}/rest/v1/LISTA_PGS?select=*&order=LIDER.asc`, { headers: HDR })
      if (!res.ok) throw new Error(await res.text())
      setRows(await res.json())
    } catch (e) {
      setErro('Erro ao carregar dados: ' + e.message)
    } finally {
      setLoading(false)
    }
  }

  function startEdit(row) {
    setEditing(prev => ({ ...prev, [row.id]: { ...row } }))
  }

  function cancelEdit(id) {
    if (String(id).startsWith('new_')) {
      setRows(prev => prev.filter(r => r.id !== id))
    }
    setEditing(prev => { const n = { ...prev }; delete n[id]; return n })
  }

  function updateField(id, key, value) {
    setEditing(prev => ({ ...prev, [id]: { ...prev[id], [key]: value } }))
  }

  async function saveRow(id) {
    const row     = editing[id]
    const isNew   = String(id).startsWith('new_')
    const body    = { ...row }
    delete body.id
    // Data_atu automático
    body.Data_atu = new Date().toISOString()

    try {
      const endpoint = isNew
        ? `${URL}/rest/v1/LISTA_PGS`
        : `${URL}/rest/v1/LISTA_PGS?id=eq.${id}`
      const res = await fetch(endpoint, {
        method:  isNew ? 'POST' : 'PATCH',
        headers: { ...HDR, Prefer: 'return=representation' },
        body:    JSON.stringify(body),
      })
      if (!res.ok) throw new Error(await res.text())
      cancelEdit(id)
      fetchPGs()
    } catch (e) {
      alert('Erro ao salvar: ' + e.message)
    }
  }

  async function deleteRow(id) {
    if (!confirm('Tem certeza que deseja excluir este PG?')) return
    try {
      const res = await fetch(`${URL}/rest/v1/LISTA_PGS?id=eq.${id}`, {
        method:  'DELETE',
        headers: { ...HDR, Prefer: 'return=minimal' },
      })
      if (!res.ok) throw new Error(await res.text())
      setRows(prev => prev.filter(r => r.id !== id))
      cancelEdit(id)
    } catch (e) {
      alert('Erro ao excluir: ' + e.message)
    }
  }

  function addRow() {
    const tempId = `new_${Date.now()}`
    const nova   = { id: tempId, ...EMPTY_ROW }
    setRows(prev => [nova, ...prev])
    setEditing(prev => ({ ...prev, [tempId]: nova }))
  }

  function logout() {
    sessionStorage.clear()
    nav('/')
  }

  const filtrado = busca.trim()
    ? rows.filter(r =>
        COLUMNS.some(c => String(r[c.key] ?? '').toLowerCase().includes(busca.toLowerCase()))
      )
    : rows

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      {/* Header */}
      <header className="bg-blue-800 text-white px-6 py-4 flex items-center justify-between shadow-md flex-shrink-0">
        <div className="flex items-center gap-3">
          <img src="/icone.png" alt="Sal da Terra" className="h-10 object-contain" />
          <div>
            <h1 className="text-lg font-bold leading-tight">Igreja Sal da Terra</h1>
            <p className="text-blue-200 text-xs mt-0.5">Cadastro de Pequenos Grupos</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <input
            type="text"
            placeholder="Buscar..."
            value={busca}
            onChange={e => setBusca(e.target.value)}
            className="text-sm text-gray-800 px-3 py-1.5 rounded-lg border-0 focus:outline-none focus:ring-2 focus:ring-blue-300 w-48"
          />
          <button
            onClick={addRow}
            className="bg-green-500 hover:bg-green-600 text-white px-4 py-1.5 rounded-lg font-semibold text-sm transition-colors"
          >
            + Novo PG
          </button>
          <button
            onClick={fetchPGs}
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
        {loading ? 'Carregando...' : `${filtrado.length} registro(s)${busca ? ` — filtrado de ${rows.length}` : ''}`}
        {erro && <span className="text-red-500 ml-4">{erro}</span>}
      </div>

      {/* Tabela */}
      <main className="flex-1 px-6 pb-6 overflow-hidden">
        <div className="overflow-auto rounded-xl shadow border border-gray-200 bg-white h-full">
          <table className="min-w-full text-sm border-collapse">
            <thead className="sticky top-0 z-10">
              <tr className="bg-blue-800 text-white">
                {COLUMNS.map(c => (
                  <th
                    key={c.key}
                    style={{ minWidth: c.w }}
                    className="px-3 py-3 text-left whitespace-nowrap font-semibold text-xs tracking-wide border-r border-blue-700 last:border-r-0"
                  >
                    {c.label}
                  </th>
                ))}
                <th className="px-3 py-3 text-center whitespace-nowrap font-semibold text-xs tracking-wide sticky right-0 bg-blue-800">
                  Ações
                </th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={COLUMNS.length + 1} className="text-center py-16 text-gray-400">
                    Carregando dados...
                  </td>
                </tr>
              ) : filtrado.length === 0 ? (
                <tr>
                  <td colSpan={COLUMNS.length + 1} className="text-center py-16 text-gray-400">
                    Nenhum registro encontrado.
                  </td>
                </tr>
              ) : (
                filtrado.map((row, i) => {
                  const isEditing = !!editing[row.id]
                  const data      = editing[row.id] ?? row
                  const isNew     = String(row.id).startsWith('new_')
                  return (
                    <tr
                      key={row.id}
                      className={`
                        border-b border-gray-100 last:border-b-0
                        ${isEditing ? 'bg-blue-50' : i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}
                        hover:bg-blue-50 transition-colors
                      `}
                    >
                      {COLUMNS.map(c => (
                        <td key={c.key} className="px-2 py-1.5 border-r border-gray-100 last:border-r-0">
                          {isEditing ? (
                            <input
                              className="w-full border border-blue-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
                              style={{ minWidth: Math.max((c.w ?? 80) - 20, 60) }}
                              value={data[c.key] ?? ''}
                              onChange={e => updateField(row.id, c.key, e.target.value)}
                            />
                          ) : (
                            <span className="block whitespace-nowrap text-xs text-gray-700">
                              {row[c.key] || <span className="text-gray-300">—</span>}
                            </span>
                          )}
                        </td>
                      ))}

                      {/* Coluna de ações — sticky direita */}
                      <td className="px-3 py-1.5 text-center whitespace-nowrap sticky right-0 bg-inherit shadow-[-4px_0_6px_-2px_rgba(0,0,0,0.06)]">
                        {isEditing ? (
                          <div className="flex gap-1 justify-center">
                            <button
                              onClick={() => saveRow(row.id)}
                              className="bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded text-xs font-semibold transition-colors"
                            >
                              Salvar
                            </button>
                            <button
                              onClick={() => cancelEdit(row.id)}
                              className="bg-gray-400 hover:bg-gray-500 text-white px-3 py-1 rounded text-xs font-semibold transition-colors"
                            >
                              Cancelar
                            </button>
                          </div>
                        ) : (
                          <div className="flex gap-1 justify-center">
                            <button
                              onClick={() => startEdit(row)}
                              className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded text-xs font-semibold transition-colors"
                            >
                              Editar
                            </button>
                            <button
                              onClick={() => deleteRow(row.id)}
                              className="bg-red-500 hover:bg-red-600 text-white px-3 py-1 rounded text-xs font-semibold transition-colors"
                            >
                              Deletar
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  )
}
