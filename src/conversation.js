// Histórico de conversas em memória por número de telefone
const histories   = new Map(); // phone → [{role, content}]
const lastActivity = new Map(); // phone → Date
const saved        = new Set();  // phones cujos dados já foram salvos no Supabase

const MAX = parseInt(process.env.MAX_HISTORY_MESSAGES || '20');

function get(phone) {
  return histories.get(phone) || [];
}

function push(phone, role, content) {
  const history = get(phone);
  history.push({ role, content });
  if (history.length > MAX) history.splice(0, history.length - MAX);
  histories.set(phone, history);
  lastActivity.set(phone, new Date());
}

function clear(phone) {
  histories.delete(phone);
  lastActivity.delete(phone);
  saved.delete(phone);
}

function getLastActivity(phone) {
  return lastActivity.get(phone) || null;
}

function markSaved(phone) {
  saved.add(phone);
}

function isSaved(phone) {
  return saved.has(phone);
}

// Retorna phones ativos que não responderam há mais de X milissegundos
function getInactive(thresholdMs) {
  const now = Date.now();
  const inactive = [];
  for (const [phone, time] of lastActivity.entries()) {
    if (!isSaved(phone) && now - time.getTime() > thresholdMs) {
      inactive.push(phone);
    }
  }
  return inactive;
}

module.exports = { get, push, clear, getLastActivity, markSaved, isSaved, getInactive };
