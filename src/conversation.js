// Histórico de conversas em memória (por número de telefone)
const histories = new Map();
const MAX = parseInt(process.env.MAX_HISTORY_MESSAGES || '20');

function get(phone) {
  return histories.get(phone) || [];
}

function push(phone, role, content) {
  const history = get(phone);
  history.push({ role, content });
  if (history.length > MAX) history.splice(0, history.length - MAX);
  histories.set(phone, history);
}

function clear(phone) {
  histories.delete(phone);
}

module.exports = { get, push, clear };
