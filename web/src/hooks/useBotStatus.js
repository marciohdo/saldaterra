import { useState, useEffect } from 'react'

const URL = import.meta.env.VITE_SUPABASE_URL
const KEY = import.meta.env.VITE_SUPABASE_KEY
const HDR = {
  'Content-Type': 'application/json',
  apikey: KEY,
  Authorization: `Bearer ${KEY}`,
}

// Status do bot (heartbeat gravado pelo servidor na tabela bot_status), com polling a cada 30s.
export function useBotStatus() {
  const [botStatus, setBotStatus] = useState(null)

  useEffect(() => {
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

  return botStatus
}
