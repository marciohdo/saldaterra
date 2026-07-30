const HEARTBEAT_LIMITE_MIN = 3

// Indicador de status do bot (verde ativo / amarelo com problema / vermelho sem heartbeat).
export default function SemaforoBot({ botStatus }) {
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
