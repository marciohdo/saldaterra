// Mapeia messageId da enquete → visitanteId
// Mantido em memória; persiste enquanto o servidor estiver rodando.
const map = new Map();

// Registra um poll: messageId → visitanteId
function registerPollVisitante(messageId, visitanteId) {
  map.set(messageId, visitanteId);
}

// Retorna o visitanteId associado ao poll (ou null se não encontrado)
function getVisitanteByPoll(messageId) {
  return map.get(messageId) ?? null;
}

module.exports = { registerPollVisitante, getVisitanteByPoll };
