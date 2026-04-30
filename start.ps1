# Inicia o servidor Node.js e o tunel Cloudflare juntos
Set-Location $PSScriptRoot

# Encerra processos anteriores de cloudflared e node para evitar conflitos
Get-Process -Name "cloudflared" -ErrorAction SilentlyContinue | Stop-Process -Force
Get-Process -Name "node" -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 1

$logFile = "$env:TEMP\cloudflared-tunnel.log"
if (Test-Path $logFile) {
    Remove-Item $logFile -Force -ErrorAction SilentlyContinue
}

Write-Host "Iniciando tunel Cloudflare..." -ForegroundColor Cyan
Start-Process -FilePath "cloudflared" -ArgumentList "tunnel --url http://localhost:3000 --logfile `"$logFile`"" -WindowStyle Hidden

# Aguarda a URL aparecer no log (até 40 segundos)
$url = $null
$tentativas = 0
while (-not $url -and $tentativas -lt 20) {
    Start-Sleep -Seconds 2
    $tentativas++
    if (Test-Path $logFile) {
        $match = Select-String -Path $logFile -Pattern "https://[a-z0-9\-]+\.trycloudflare\.com" | Select-Object -Last 1
        if ($match) {
            $url = ([regex]::Match($match.Line, "https://[a-z0-9\-]+\.trycloudflare\.com")).Value
        }
    }
}

if ($url) {
    $webhookUrl = "$url/webhook/5c697459-3a69-4009-b724-43069e591f81"
    Write-Host ""
    Write-Host "Tunel ativo!" -ForegroundColor Green
    Write-Host "URL publica : $url" -ForegroundColor Yellow
    Write-Host "Webhook URL : $webhookUrl" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Copie a Webhook URL acima e configure na Evolution API." -ForegroundColor Cyan
    Write-Host ""
} else {
    Write-Host "Nao foi possivel obter a URL do tunel. Verifique se o cloudflared esta instalado." -ForegroundColor Red
}

Write-Host "Iniciando servidor Node.js na porta 3000..." -ForegroundColor Cyan
node src/server.js
