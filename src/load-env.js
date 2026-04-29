// Carrega o arquivo .env sem dependência de pacotes externos
const fs = require('fs');
const path = require('path');

const envPath = path.resolve(__dirname, '..', '.env');
if (!fs.existsSync(envPath)) return;

for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const idx = trimmed.indexOf('=');
  if (idx === -1) continue;
  const key = trimmed.slice(0, idx).trim();
  const value = trimmed.slice(idx + 1).trim();
  if (!(key in process.env)) process.env[key] = value;
}
