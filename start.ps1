# Inicia o servidor Node.js
param([switch]$Watch)
Set-Location $PSScriptRoot

# Encerra processos anteriores para evitar conflitos de porta
Get-Process -Name "node" -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 1

Write-Host "Iniciando servidor Node.js na porta 3000..." -ForegroundColor Cyan
Write-Host "Na primeira execucao, escaneie o QR Code que aparecer com o WhatsApp." -ForegroundColor Yellow
Write-Host ""

if ($Watch) {
    node --watch src/server.js
} else {
    node src/server.js
}
