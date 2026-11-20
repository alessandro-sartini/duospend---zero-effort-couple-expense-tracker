<#
  DuoSpend - Avvio sicuro con Cloudflare Quick Tunnel (HTTPS) per test da smartphone.

  Sicurezza:
  - Il server ascolta SOLO su 127.0.0.1: invisibile alla rete di casa e a Internet.
  - cloudflared apre una connessione IN USCITA verso Cloudflare: nessuna porta aperta sul router,
    il tuo IP di casa non viene esposto; ping/DDoS colpiscono Cloudflare, non te.
  - Modalita' production: rotte /api/dev, login sviluppatore e Vite dev server disattivati.
  - Accesso consentito solo agli account Google autorizzati (owner + partner).
  - Chiudendo lo script (Ctrl+C) tunnel e server vengono fermati: l'URL smette di esistere.
#>

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

$port = 3000
$prodEnvFile = Join-Path $repoRoot '.env.production.local'
$devEnvFile = Join-Path $repoRoot '.env.development.local'
$logsDir = Join-Path $repoRoot 'logs'
New-Item -ItemType Directory -Path $logsDir -Force | Out-Null
$serverOutLog = Join-Path $logsDir 'server.out.log'
$serverErrLog = Join-Path $logsDir 'server.err.log'
$tunnelLog = Join-Path $logsDir 'tunnel.log'

function Read-EnvValue([string]$file, [string]$key) {
  if (-not (Test-Path $file)) { return '' }
  foreach ($line in Get-Content $file) {
    if ($line -match "^\s*$key\s*=\s*(.*)$") {
      return $Matches[1].Trim().Trim('"').Trim("'")
    }
  }
  return ''
}

function New-RandomSecret([int]$bytesCount = 36) {
  $bytes = New-Object byte[] $bytesCount
  $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  $rng.GetBytes($bytes)
  $rng.Dispose()
  return ([Convert]::ToBase64String($bytes)).TrimEnd('=').Replace('+', '-').Replace('/', '_')
}

Write-Host ''
Write-Host '=== DuoSpend - Tunnel HTTPS sicuro ===' -ForegroundColor Cyan

# 1. cloudflared presente in PATH o nei percorsi standard Windows/WinGet?
$cloudflaredCmd = Get-Command cloudflared -ErrorAction SilentlyContinue
$cloudflaredBin = if ($cloudflaredCmd) { $cloudflaredCmd.Source } else { '' }
if (-not $cloudflaredBin) {
  $candidatePaths = @(
    (Join-Path $env:ProgramFiles 'cloudflared\cloudflared.exe'),
    (Join-Path ${env:ProgramFiles(x86)} 'cloudflared\cloudflared.exe'),
    (Join-Path $env:LOCALAPPDATA 'Microsoft\WinGet\Links\cloudflared.exe')
  )
  foreach ($candidate in $candidatePaths) {
    if ($candidate -and (Test-Path $candidate)) {
      $cloudflaredBin = $candidate
      break
    }
  }
}
if (-not $cloudflaredBin) {
  Write-Host 'cloudflared non trovato. Installalo con:' -ForegroundColor Yellow
  Write-Host '  winget install --id Cloudflare.cloudflared -e' -ForegroundColor White
  Write-Host 'Poi rilancia: npm run tunnel'
  exit 1
}

# 2. Porta libera? (controllo diretto TCP indipendente dalla lingua di sistema)
function Test-LocalPortOpen([int]$targetPort, [int]$timeoutMs = 500) {
  $tcp = $null
  try {
    $tcp = New-Object System.Net.Sockets.TcpClient
    $connectTask = $tcp.ConnectAsync('127.0.0.1', $targetPort)
    return ($connectTask.Wait($timeoutMs) -and $tcp.Connected)
  } catch {
    return $false
  } finally {
    if ($tcp) { $tcp.Dispose() }
  }
}

if (Test-LocalPortOpen $port 300) {
  Write-Host "La porta $port e' gia' in uso (forse 'npm run dev' e' ancora attivo). Chiudilo e riprova." -ForegroundColor Red
  exit 1
}

# 3. File .env.production.local (creato una sola volta, ignorato da git)
if (-not (Test-Path $prodEnvFile)) {
  Write-Host 'Creo .env.production.local con segreti nuovi...' -ForegroundColor Yellow
  $clientId = Read-EnvValue $devEnvFile 'VITE_GOOGLE_CLIENT_ID'
  $geminiKey = Read-EnvValue $devEnvFile 'GEMINI_API_KEY'
  if (-not $clientId) { $clientId = Read-Host 'VITE_GOOGLE_CLIENT_ID' }
  if (-not $geminiKey) { $geminiKey = Read-Host 'GEMINI_API_KEY' }
  $ownerEmail = (Read-EnvValue $devEnvFile 'DUOSPEND_OWNER_EMAIL').ToLower()
  if (-not $ownerEmail -or $ownerEmail -notmatch '^[^\s@]+@[^\s@]+\.[^\s@]+$') {
    $ownerEmail = (Read-Host 'DUOSPEND_OWNER_EMAIL (email Google del titolare)').Trim().ToLower()
  }
  $webhookSecret = New-RandomSecret

  @(
    '# Generato da scripts/secure-tunnel.ps1 - NON committare (ignorato da .gitignore)'
    "VITE_GOOGLE_CLIENT_ID=$clientId"
    "GEMINI_API_KEY=$geminiKey"
    "DUOSPEND_OWNER_EMAIL=$ownerEmail"
    "DUOSPEND_WEBHOOK_SECRET=$webhookSecret"
    'HOST=127.0.0.1'
    "PORT=$port"
  ) | Set-Content -Path $prodEnvFile -Encoding UTF8

  # Permessi file: solo l'utente corrente
  icacls $prodEnvFile /inheritance:r /grant:r "$($env:USERNAME):(R,W)" | Out-Null
  Write-Host 'Creato. Il segreto webhook per MacroDroid e'' in .env.production.local' -ForegroundColor Green
}

# 4. Build di produzione (Vite legge VITE_GOOGLE_CLIENT_ID da .env.production.local)
Write-Host 'Build di produzione in corso...' -ForegroundColor Cyan
$env:NODE_ENV = 'production'
npm run build
if ($LASTEXITCODE -ne 0) { Write-Host 'Build fallita.' -ForegroundColor Red; exit 1 }

# 5. Avvio server solo su loopback con log persistenti su file
$env:HOST = '127.0.0.1'
$env:PORT = "$port"
Set-Content -Path $serverOutLog -Value "=== Avvio DuoSpend Server $(Get-Date -Format o) ===" -Encoding UTF8
Set-Content -Path $serverErrLog -Value "=== Errori DuoSpend Server $(Get-Date -Format o) ===" -Encoding UTF8
Set-Content -Path $tunnelLog -Value "=== Avvio Cloudflare Tunnel $(Get-Date -Format o) ===" -Encoding UTF8

Write-Host "Avvio server su http://127.0.0.1:$port (non visibile in rete locale)..." -ForegroundColor Cyan
Write-Host "Log salvati in: logs/server.out.log, logs/server.err.log, logs/tunnel.log" -ForegroundColor DarkGray
$server = Start-Process -FilePath 'npm.cmd' -ArgumentList 'start' -PassThru -WindowStyle Hidden -RedirectStandardOutput $serverOutLog -RedirectStandardError $serverErrLog

try {
  $ready = $false
  for ($i = 0; $i -lt 40; $i++) {
    Start-Sleep -Milliseconds 750
    if (Test-LocalPortOpen $port 1000) {
      $ready = $true
      break
    }
  }
  if (-not $ready) {
    if (Test-Path $serverErrLog) { Get-Content $serverErrLog -Tail 30 | Write-Host -ForegroundColor Red }
    if (Test-Path $serverOutLog) { Get-Content $serverOutLog -Tail 20 | Write-Host }
    throw 'Il server non risponde: controlla logs/server.err.log.'
  }

  Write-Host ''
  Write-Host 'Server pronto. Avvio tunnel Cloudflare (HTTP/2)...' -ForegroundColor Green
  Write-Host 'Cerca nei log la riga con  https://<nome-casuale>.trycloudflare.com' -ForegroundColor Yellow
  Write-Host 'Premi Ctrl+C per chiudere tunnel e server.' -ForegroundColor Yellow
  Write-Host ''

  $prevErrorPref = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    & $cloudflaredBin tunnel --no-autoupdate --protocol http2 --url "http://127.0.0.1:$port" 2>&1 |
      ForEach-Object {
        $line = $_.ToString()
        Write-Host $line
        Add-Content -Path $tunnelLog -Value $line -Encoding UTF8
      }
  } finally {
    $ErrorActionPreference = $prevErrorPref
  }
}
finally {
  Write-Host ''
  Write-Host 'Arresto server DuoSpend...' -ForegroundColor Cyan
  if ($server -and -not $server.HasExited) {
    taskkill /PID $server.Id /T /F | Out-Null
  }
  Write-Host 'Tunnel e server chiusi. Nessun servizio resta esposto.' -ForegroundColor Green
}
