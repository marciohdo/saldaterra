import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

const USERS = { secretaria: 'Sal@2026' }

export default function Login() {
  const [usuario, setUsuario] = useState('')
  const [senha, setSenha]     = useState('')
  const [erro, setErro]       = useState('')
  const nav = useNavigate()

  function handleSubmit(e) {
    e.preventDefault()
    if (USERS[usuario] === senha) {
      sessionStorage.setItem('auth', '1')
      nav('/pgs')
    } else {
      setErro('Usuário ou senha incorretos.')
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-700 to-blue-900 flex items-center justify-center">
      <div className="bg-white rounded-2xl shadow-2xl p-10 w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-blue-800">Igreja Sal da Terra</h1>
          <p className="text-gray-500 text-sm mt-1">Gestão de Pequenos Grupos</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Usuário</label>
            <input
              className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              value={usuario}
              onChange={e => { setUsuario(e.target.value); setErro('') }}
              autoFocus
              autoComplete="username"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Senha</label>
            <input
              type="password"
              className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              value={senha}
              onChange={e => { setSenha(e.target.value); setErro('') }}
              autoComplete="current-password"
            />
          </div>

          {erro && (
            <p className="text-red-500 text-sm text-center bg-red-50 py-2 rounded-lg">{erro}</p>
          )}

          <button
            type="submit"
            className="w-full bg-blue-700 hover:bg-blue-800 text-white font-semibold py-2.5 rounded-lg transition-colors"
          >
            Entrar
          </button>
        </form>
      </div>
    </div>
  )
}
