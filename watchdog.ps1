$ErrorActionPreference = "Continue"
$ProgressPreference = "SilentlyContinue"
$Root = $PSScriptRoot
Set-Location $Root
if (Test-Path -LiteralPath (Join-Path $Root "DISABLED")) { exit 0 }

$LogDir = Join-Path $Root "logs"
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
$BootLog = Join-Path $LogDir "watchdog.log"
$OutLog = Join-Path $LogDir "deck.out.log"
$ErrLog = Join-Path $LogDir "deck.err.log"
$Heart = Join-Path $Root "cache\heartbeat.json"
$Port = 47331
$HealthUrl = "http://127.0.0.1:$Port/api/health"

$mutex = $null
try {
  $mutex = New-Object System.Threading.Mutex($false, "Global\OFDeckWatchdog")
  if (-not $mutex.WaitOne(0)) { exit 0 }
} catch {
  $mutex = $null
}

function Write-Boot([string]$Message) {
  $line = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')  $Message"
  Add-Content -Path $BootLog -Value $line -Encoding UTF8
}

function Rotate-Log([string]$Path) {
  if (-not (Test-Path -LiteralPath $Path)) { return }
  if ((Get-Item -LiteralPath $Path).Length -lt 8MB) { return }
  $bak = "$Path.1"
  if (Test-Path -LiteralPath $bak) { Remove-Item -LiteralPath $bak -Force -ErrorAction SilentlyContinue }
  Move-Item -LiteralPath $Path -Destination $bak -Force -ErrorAction SilentlyContinue
}

function Test-PortOpen([int]$ListenPort) {
  try {
    $client = New-Object System.Net.Sockets.TcpClient
    $async = $client.BeginConnect("127.0.0.1", $ListenPort, $null, $null)
    $ok = $async.AsyncWaitHandle.WaitOne(800)
    if ($ok -and $client.Connected) {
      $client.EndConnect($async)
      $client.Close()
      return $true
    }
    $client.Close()
  } catch {
    return $false
  }
  return $false
}

function Test-Health {
  try {
    $res = Invoke-WebRequest -Uri $HealthUrl -UseBasicParsing -TimeoutSec 4
    return $res.StatusCode -eq 200
  } catch {
    return $false
  }
}

function Read-Heart {
  if (-not (Test-Path -LiteralPath $Heart)) { return $null }
  try {
    return Get-Content -LiteralPath $Heart -Raw | ConvertFrom-Json
  } catch {
    return $null
  }
}

function Stop-Deck {
  $beat = Read-Heart
  if ($beat -and $beat.pid) {
    Stop-Process -Id ([int]$beat.pid) -Force -ErrorAction SilentlyContinue
  }
  Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
    ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }
  Start-Sleep -Seconds 1
}

function Start-Deck {
  $node = (Get-Command node -ErrorAction SilentlyContinue).Source
  if (-not $node) { $node = "C:\Program Files\nodejs\node.exe" }
  if (-not (Test-Path -LiteralPath $node)) {
    Write-Boot "ERROR: node introuvable"
    return
  }
  Rotate-Log $OutLog
  Rotate-Log $ErrLog
  Rotate-Log $BootLog
  try {
    Start-Process -FilePath $node -ArgumentList ".\server.js" -WorkingDirectory $Root -WindowStyle Hidden -RedirectStandardOutput $OutLog -RedirectStandardError $ErrLog
    Write-Boot "started node .\server.js"
  } catch {
    Write-Boot "ERROR start: $($_.Exception.Message)"
  }
}

$machinePath = [System.Environment]::GetEnvironmentVariable("Path", "Machine")
$userPath = [System.Environment]::GetEnvironmentVariable("Path", "User")
$env:Path = "$machinePath;$userPath"

try {
  $portUp = Test-PortOpen $Port
  $healthy = $false
  if ($portUp) { $healthy = Test-Health }

  if (-not ($portUp -and $healthy)) {
    if ($portUp) {
      Write-Boot "port $Port ouvert mais sante KO - relance"
    } else {
      Write-Boot "port $Port ferme - relance"
    }
    Stop-Deck
    Start-Deck
  }
} finally {
  if ($mutex) {
    try { $mutex.ReleaseMutex() | Out-Null } catch {}
    try { $mutex.Dispose() } catch {}
  }
}
