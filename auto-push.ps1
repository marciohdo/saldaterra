# auto-push.ps1 — monitora o projeto e faz commit+push automatico quando arquivos mudam
param(
    [string]$ProjectPath = "C:\Users\mholiveira\OneDrive - MC3 Consultoria Empresarial Ltda\Documentos\Projetos\outros\IA\saldaterra"
)

Write-Host "[auto-push] Monitorando: $ProjectPath" -ForegroundColor Cyan

$watcher = New-Object System.IO.FileSystemWatcher
$watcher.Path = $ProjectPath
$watcher.IncludeSubdirectories = $true
$watcher.EnableRaisingEvents = $true
$watcher.NotifyFilter = [System.IO.NotifyFilters]::LastWrite -bor [System.IO.NotifyFilters]::FileName

# Debounce: aguarda 10s de inatividade antes de commitar
$timer = New-Object System.Timers.Timer
$timer.Interval = 10000
$timer.AutoReset = $false

$action = {
    $timer.Stop()
    $timer.Start()
}

$timerAction = {
    $timer.Stop()
    Set-Location $ProjectPath
    $status = git status --porcelain
    if ($status) {
        $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
        git add .
        git commit -m "auto: $timestamp"
        git push origin main
        Write-Host "[auto-push] Commit e push feitos em $timestamp" -ForegroundColor Green
    }
}

Register-ObjectEvent $watcher Changed -Action $action | Out-Null
Register-ObjectEvent $watcher Created -Action $action | Out-Null
Register-ObjectEvent $watcher Deleted -Action $action | Out-Null
Register-ObjectEvent $watcher Renamed -Action $action | Out-Null
Register-ObjectEvent $timer Elapsed -Action $timerAction | Out-Null

Write-Host "[auto-push] Aguardando mudancas... (Ctrl+C para parar)" -ForegroundColor Yellow
while ($true) { Start-Sleep -Seconds 1 }
