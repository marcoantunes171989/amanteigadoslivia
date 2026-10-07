# Launcher DEV local do Amanteigados Livia (somente Windows, ambiente DEV).
#
# Sobe o "vercel dev" em 127.0.0.1:3100 usando o PostgreSQL 18 local (banco amanteigados_dev,
# role amanteigados_dev_app). A senha da role fica em um blob DPAPI do usuario Windows atual,
# fora do repositorio, e so existe no ambiente do processo durante a execucao.
#
# Garantias:
#  - nao imprime a senha nem o ADMIN_SESSION_SECRET, nao os passa como argumento, nao usa PGPASSWORD nem .env;
#  - ADMIN_SESSION_SECRET vem de blob DPAPI separado (admin-session-secret.dpapi), mesmo padrao da senha do banco;
#  - nao grava a senha em disco em texto puro, em log ou em variavel persistente;
#  - nao chama Vercel remoto (vercel dev local, sem vercel env pull).
#
# Codigos de saida:
#   0  DEV ja estava ativo e saudavel na porta 3100 (nada duplicado)
#   1  vercel dev encerrou ou falhou durante a execucao
#   2  raiz do projeto invalida
#   3  pg_isready nao encontrado
#   10 PostgreSQL indisponivel dentro do prazo
#   20 porta 3100 ocupada por processo nao reconhecido (conflito; nada foi encerrado)
#   30 blob DPAPI ausente
#   31 blob DPAPI nao pode ser decifrado (usuario Windows diferente ou arquivo corrompido)
#   32 blob DPAPI do ADMIN_SESSION_SECRET ausente
#   33 blob DPAPI do ADMIN_SESSION_SECRET invalido (nao decifra ou tem menos de 32 bytes)

param(
  [int]$PostgresWaitSeconds = 180,
  [int]$ServerStartSeconds = 120
)

$ErrorActionPreference = 'Stop'

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$Port = 3100
$PgIsReady = 'C:\Program Files\PostgreSQL\18\bin\pg_isready.exe'
$PgHost = '127.0.0.1'
$PgPort = 5432
$AppDataDir = Join-Path $env:LOCALAPPDATA 'AmanteigadosLivia\dev'
$LogDir = Join-Path $AppDataDir 'logs'
$SecretFile = Join-Path $AppDataDir 'db-password.dpapi'
$AdminSecretFile = Join-Path $AppDataDir 'admin-session-secret.dpapi'
$LauncherLog = Join-Path $LogDir 'dev-local.log'
$MaxLauncherLogBytes = 5MB
$MaxVercelLogFiles = 20
$DbSettings = [ordered]@{
  DATABASE_HOST = '127.0.0.1'
  DATABASE_PORT = '5432'
  DATABASE_NAME = 'amanteigados_dev'
  DATABASE_USER = 'amanteigados_dev_app'
}

function Write-Log([string]$Message) {
  $line = '{0} {1}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Message
  Add-Content -LiteralPath $LauncherLog -Value $line -Encoding UTF8
  Write-Output $line
}

function Stop-LauncherWith([int]$Code, [string]$Message) {
  Write-Log $Message
  exit $Code
}

# Garante diretorios locais e rotaciona o log do launcher quando passa do limite.
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
if ((Test-Path -LiteralPath $LauncherLog) -and ((Get-Item -LiteralPath $LauncherLog).Length -gt $MaxLauncherLogBytes)) {
  Move-Item -LiteralPath $LauncherLog -Destination "$LauncherLog.1" -Force
}

if (-not ((Test-Path -LiteralPath (Join-Path $ProjectRoot 'package.json')) -and (Test-Path -LiteralPath (Join-Path $ProjectRoot 'vercel.json')))) {
  Stop-LauncherWith 2 "Raiz do projeto invalida: $ProjectRoot"
}
if (-not (Test-Path -LiteralPath $PgIsReady)) {
  Stop-LauncherWith 3 "pg_isready nao encontrado em $PgIsReady"
}

# 1) Aguarda PostgreSQL com prazo finito.
Write-Log "Aguardando PostgreSQL em ${PgHost}:${PgPort} (prazo ${PostgresWaitSeconds}s)"
$pgDeadline = (Get-Date).AddSeconds($PostgresWaitSeconds)
$pgReady = $false
while ((Get-Date) -lt $pgDeadline) {
  & $PgIsReady -h $PgHost -p $PgPort -t 3 | Out-Null
  if ($LASTEXITCODE -eq 0) { $pgReady = $true; break }
  Start-Sleep -Seconds 5
}
if (-not $pgReady) {
  Stop-LauncherWith 10 "PostgreSQL indisponivel em ${PgHost}:${PgPort} apos ${PostgresWaitSeconds}s"
}
Write-Log 'PostgreSQL disponivel'

# 2) Verifica a porta 3100 antes de iniciar.
$listener = Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue | Select-Object -First 1
if ($listener) {
  $owner = Get-CimInstance Win32_Process -Filter "ProcessId=$($listener.OwningProcess)" -ErrorAction SilentlyContinue
  $ownerCmd = if ($owner) { [string]$owner.CommandLine } else { '' }
  $looksLikeVercelDev = ($ownerCmd -match 'vercel') -and ($ownerCmd -match "dev --listen 127\.0\.0\.1:$Port")
  $healthy = $false
  if ($looksLikeVercelDev) {
    try {
      $probe = Invoke-WebRequest -Uri "http://127.0.0.1:$Port/produtos" -UseBasicParsing -TimeoutSec 10
      $healthy = ($probe.StatusCode -eq 200) -and ($probe.Content -match 'Amanteigados')
    } catch {
      $healthy = $false
    }
  }
  if ($healthy) {
    Stop-LauncherWith 0 "DEV ja ativo e saudavel em 127.0.0.1:$Port (PID $($listener.OwningProcess)); nada iniciado"
  }
  Stop-LauncherWith 20 "CONFLITO: porta $Port ocupada por PID $($listener.OwningProcess) ($($owner.Name)) nao reconhecido como DEV saudavel; nada foi encerrado"
}

# 3) Decifra a senha via DPAPI (usuario Windows atual) somente em memoria.
if (-not (Test-Path -LiteralPath $SecretFile)) {
  Stop-LauncherWith 30 "Blob DPAPI ausente: $SecretFile"
}

$bstr = [IntPtr]::Zero
$plainPassword = $null
try {
  $secure = ConvertTo-SecureString -String ((Get-Content -LiteralPath $SecretFile -Raw).Trim())
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  $plainPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
} catch {
  Stop-LauncherWith 31 'Falha ao decifrar o blob DPAPI (usuario Windows diferente ou arquivo corrompido)'
} finally {
  if ($bstr -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
}

# Variaveis apenas no escopo do processo; a DATABASE_URL, se existir no usuario, nao deve competir com DATABASE_HOST.
foreach ($key in $DbSettings.Keys) {
  [Environment]::SetEnvironmentVariable($key, $DbSettings[$key], 'Process')
}
[Environment]::SetEnvironmentVariable('DATABASE_URL', $null, 'Process')
[Environment]::SetEnvironmentVariable('APP_AMBIENTE', 'development', 'Process')
[Environment]::SetEnvironmentVariable('DATABASE_PASSWORD', $plainPassword, 'Process')
$plainPassword = $null

# 3b) Decifra ADMIN_SESSION_SECRET via DPAPI (mesmo padrao da senha) somente em memoria.
# Falha fechada: sem blob valido o launcher nao sobe o DEV (sem fallback inseguro).
if (-not (Test-Path -LiteralPath $AdminSecretFile)) {
  Stop-LauncherWith 32 "Blob DPAPI do ADMIN_SESSION_SECRET ausente: $AdminSecretFile"
}

$adminBstr = [IntPtr]::Zero
$adminSecret = $null
try {
  $adminSecure = ConvertTo-SecureString -String ((Get-Content -LiteralPath $AdminSecretFile -Raw).Trim())
  $adminBstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($adminSecure)
  $adminSecret = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($adminBstr)
} catch {
  Stop-LauncherWith 33 'Falha ao decifrar o blob DPAPI do ADMIN_SESSION_SECRET (usuario Windows diferente ou arquivo corrompido)'
} finally {
  if ($adminBstr -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($adminBstr) }
}

# Valida o tamanho sem exibir o valor: base64 de pelo menos 32 bytes aleatorios.
$adminValid = $false
try {
  $adminRaw = [Convert]::FromBase64String($adminSecret)
  $adminValid = ($adminRaw.Length -ge 32)
  [Array]::Clear($adminRaw, 0, $adminRaw.Length)
} catch {
  $adminValid = $false
}
if (-not $adminValid) {
  $adminSecret = $null
  Stop-LauncherWith 33 'Blob DPAPI do ADMIN_SESSION_SECRET invalido (segredo ausente ou menor que 32 bytes)'
}
[Environment]::SetEnvironmentVariable('ADMIN_SESSION_SECRET', $adminSecret, 'Process')
$adminSecret = $null

# 4) Logs do vercel dev por execucao, com limite de arquivos antigos.
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$outLog = Join-Path $LogDir "vercel-dev-$stamp.out.log"
$errLog = Join-Path $LogDir "vercel-dev-$stamp.err.log"
Get-ChildItem -LiteralPath $LogDir -Filter 'vercel-dev-*.log' |
  Sort-Object LastWriteTime -Descending |
  Select-Object -Skip $MaxVercelLogFiles |
  Remove-Item -Force

# 5) Inicia vercel dev local. cmd.exe permite redirecionar stdout/stderr do vercel.cmd do npm.
Write-Log "Iniciando vercel dev --listen 127.0.0.1:$Port (logs: $outLog)"
$proc = $null
try {
  $proc = Start-Process -FilePath 'cmd.exe' `
    -ArgumentList @('/d', '/c', 'vercel', 'dev', '--listen', "127.0.0.1:$Port") `
    -WorkingDirectory $ProjectRoot -WindowStyle Hidden -PassThru `
    -RedirectStandardOutput $outLog -RedirectStandardError $errLog
  # O filho ja herdou o ambiente; a senha e o segredo admin saem do processo launcher imediatamente.
  [Environment]::SetEnvironmentVariable('DATABASE_PASSWORD', $null, 'Process')
  [Environment]::SetEnvironmentVariable('ADMIN_SESSION_SECRET', $null, 'Process')

  $serverDeadline = (Get-Date).AddSeconds($ServerStartSeconds)
  $serverUp = $false
  while ((Get-Date) -lt $serverDeadline -and -not $proc.HasExited) {
    if (Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue) { $serverUp = $true; break }
    Start-Sleep -Seconds 2
  }
  if ($proc.HasExited) {
    Write-Log "vercel dev encerrou antes de ouvir a porta $Port (codigo $($proc.ExitCode)); veja $errLog"
    exit 1
  }
  if (-not $serverUp) {
    Write-Log "vercel dev nao abriu a porta $Port em ${ServerStartSeconds}s; encerrando o processo iniciado"
    exit 1
  }
  Write-Log "vercel dev ouvindo em 127.0.0.1:$Port (PID $($proc.Id))"

  $proc.WaitForExit()
  Write-Log "vercel dev encerrou (codigo $($proc.ExitCode)); tratado como falha para reinicio pela Task Scheduler"
  exit 1
} finally {
  [Environment]::SetEnvironmentVariable('DATABASE_PASSWORD', $null, 'Process')
  [Environment]::SetEnvironmentVariable('ADMIN_SESSION_SECRET', $null, 'Process')
  if ($proc -and -not $proc.HasExited) {
    # Encerra somente a arvore do processo iniciado por este launcher.
    & taskkill.exe /PID $proc.Id /T /F | Out-Null
  }
}
