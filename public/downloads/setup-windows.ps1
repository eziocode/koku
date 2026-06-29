# ─────────────────────────────────────────────────────────────────────────────
# Koku Setup — Windows (PowerShell)
# Run: Right-click → "Run with PowerShell"  OR  .\setup-windows.bat
# ─────────────────────────────────────────────────────────────────────────────
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Info    { Write-Host "  ▶ $args" -ForegroundColor Cyan }
function Success { Write-Host "  ✔ $args" -ForegroundColor Green }
function Err     { Write-Host "  ✖ $args" -ForegroundColor Red; Read-Host "Press Enter to exit"; exit 1 }

Write-Host ""
Write-Host "  刻 Koku — Local Setup for Windows" -ForegroundColor White
Write-Host "  ─────────────────────────────────────" -ForegroundColor DarkGray
Write-Host ""

# ── 1. Prerequisites ──────────────────────────────────────────────────────────
Info "Checking prerequisites…"

$nodePath = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodePath) { Err "Node.js not found. Install from https://nodejs.org (v20+)." }
$nodeVer = [int](node -e "process.stdout.write(process.versions.node.split('.')[0])")
if ($nodeVer -lt 20) { Err "Node.js v20+ required (found v$nodeVer)." }

$gitPath = Get-Command git -ErrorAction SilentlyContinue
if (-not $gitPath) { Err "Git not found. Install from https://git-scm.com/download/win" }

$dockerPath = Get-Command docker -ErrorAction SilentlyContinue
if (-not $dockerPath) { Err "Docker not found. Install Docker Desktop from https://www.docker.com/products/docker-desktop/" }

Success "Prerequisites OK (Node v$nodeVer, Git, Docker)"

# ── 2. Get the repo ───────────────────────────────────────────────────────────
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptDir

if (-not (Test-Path "package.json")) {
    Info "Cloning Koku repository…"
    git clone https://github.com/eziocode/koku koku-app
    Set-Location koku-app
}

# ── 3. Setup mode ─────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "  Choose a setup mode:"
Write-Host "  1) Local only  — PostgreSQL via Docker, private local login"
Write-Host "  2) Cloud       — Catalyst Cloud Scale DB + Catalyst auth"
Write-Host ""
$modeInput = Read-Host "  Enter 1 or 2 [default: 1]"
if ([string]::IsNullOrWhiteSpace($modeInput)) { $modeInput = "1" }

# Generate 32-char hex encryption key
$keyBytes = New-Object byte[] 16
[System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($keyBytes)
$encryptionKey = ($keyBytes | ForEach-Object { $_.ToString("x2") }) -join ""

if ($modeInput -eq "1") {
    Info "Configuring local mode…"

    @"
# Koku — Local Mode
LOCAL_MODE=true
NEXT_PUBLIC_LOCAL_MODE=true
DATABASE_URL=postgresql://koku:koku_password@localhost:5432/koku
ENCRYPTION_KEY=$encryptionKey
"@ | Out-File -FilePath ".env" -Encoding UTF8 -NoNewline

    Info "Starting PostgreSQL via Docker…"
    docker compose -f "public\downloads\docker-compose.yml" up -d

    Info "Waiting for PostgreSQL to be ready…"
    $retries = 20
    do {
        Start-Sleep 1
        $ready = docker exec koku-postgres pg_isready -U koku 2>$null
        $retries--
    } while ($LASTEXITCODE -ne 0 -and $retries -gt 0)
    if ($retries -eq 0) { Err "PostgreSQL did not start in time." }

} else {
    Info "Configuring cloud mode…"
    Write-Host ""
    $dbUrl = Read-Host "  Catalyst Cloud Scale DB connection string"
    $folderId = Read-Host "  Catalyst Backup Folder ID"
    Write-Host ""

    @"
# Koku — Cloud Mode (Catalyst)
LOCAL_MODE=false
NEXT_PUBLIC_LOCAL_MODE=false
DATABASE_URL=$dbUrl
CATALYST_BACKUP_FOLDER_ID=$folderId
ENCRYPTION_KEY=$encryptionKey
"@ | Out-File -FilePath ".env" -Encoding UTF8 -NoNewline
}

# ── 4. Install + migrate + build ──────────────────────────────────────────────
Info "Installing npm dependencies…"
npm install --silent

Info "Running database migrations…"
npx prisma migrate deploy

Info "Building Koku (this may take a minute)…"
npm run build

# ── Done ──────────────────────────────────────────────────────────────────────
Write-Host ""
Success "Setup complete!"
Write-Host ""
Write-Host "  Start Koku:   npm start" -ForegroundColor White
Write-Host "  Dev server:   npm run dev" -ForegroundColor White
if ($modeInput -eq "1") {
    Write-Host "  Stop Postgres: docker compose -f public\downloads\docker-compose.yml down" -ForegroundColor White
}
Write-Host ""
Read-Host "Press Enter to exit"
