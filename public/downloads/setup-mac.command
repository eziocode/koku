#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Koku Setup — macOS
# Double-click this file or run: bash setup-mac.command
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail
cd "$(dirname "$0")"          # run from the folder where this script lives

BOLD="\033[1m"; RESET="\033[0m"; GREEN="\033[32m"; RED="\033[31m"; CYAN="\033[36m"
info()    { echo -e "${CYAN}▶ $*${RESET}"; }
success() { echo -e "${GREEN}✔ $*${RESET}"; }
error()   { echo -e "${RED}✖ $*${RESET}"; exit 1; }

echo -e "${BOLD}"
echo "  刻 Koku — Local Setup for macOS"
echo "  ─────────────────────────────────"
echo -e "${RESET}"

# ── 1. Prerequisites ──────────────────────────────────────────────────────────
info "Checking prerequisites…"

if ! command -v node &>/dev/null; then
  error "Node.js not found. Install from https://nodejs.org (v20 or later)."
fi
NODE_VER=$(node -e "process.stdout.write(process.versions.node.split('.')[0])")
[ "$NODE_VER" -lt 20 ] && error "Node.js v20+ required (found v${NODE_VER})."

if ! command -v git &>/dev/null; then
  error "Git not found. Install Xcode Command Line Tools: xcode-select --install"
fi

if ! command -v docker &>/dev/null; then
  error "Docker not found. Install Docker Desktop from https://www.docker.com/products/docker-desktop/"
fi

success "Prerequisites OK (Node v${NODE_VER}, Git, Docker)"

# ── 2. Get the repo ───────────────────────────────────────────────────────────
if [ ! -f "package.json" ]; then
  info "Cloning Koku repository…"
  git clone https://github.com/eziocode/koku koku-app
  cd koku-app
fi

# ── 3. Setup mode ─────────────────────────────────────────────────────────────
echo ""
echo "  Choose a setup mode:"
echo "  1) Local only  — PostgreSQL via Docker, private local login"
echo "  2) Cloud       — Catalyst Cloud Scale DB + Catalyst auth"
echo ""
read -rp "  Enter 1 or 2 [default: 1]: " MODE_INPUT
MODE="${MODE_INPUT:-1}"

ENCRYPTION_KEY=$(openssl rand -hex 16)

if [ "$MODE" = "1" ]; then
  # ── Local mode ──────────────────────────────────────────────────────────────
  info "Configuring local mode…"

  cat > .env <<EOF
# Koku — Local Mode
LOCAL_MODE=true
NEXT_PUBLIC_LOCAL_MODE=true
DATABASE_URL=postgresql://koku:koku_password@localhost:5432/koku
ENCRYPTION_KEY=${ENCRYPTION_KEY}
EOF

  info "Starting PostgreSQL via Docker…"
  docker compose -f public/downloads/docker-compose.yml up -d

  info "Waiting for PostgreSQL to be ready…"
  RETRIES=20
  until docker exec koku-postgres pg_isready -U koku &>/dev/null || [ "$RETRIES" -eq 0 ]; do
    sleep 1; RETRIES=$((RETRIES - 1))
  done
  [ "$RETRIES" -eq 0 ] && error "PostgreSQL did not start in time."

else
  # ── Cloud mode ───────────────────────────────────────────────────────────────
  info "Configuring cloud mode…"
  echo ""
  read -rp "  Catalyst Cloud Scale DB connection string: " DB_URL
  read -rp "  Catalyst Backup Folder ID: " FOLDER_ID
  echo ""

  cat > .env <<EOF
# Koku — Cloud Mode (Catalyst)
LOCAL_MODE=false
NEXT_PUBLIC_LOCAL_MODE=false
DATABASE_URL=${DB_URL}
CATALYST_BACKUP_FOLDER_ID=${FOLDER_ID}
ENCRYPTION_KEY=${ENCRYPTION_KEY}
EOF
fi

# ── 4. Install dependencies ───────────────────────────────────────────────────
info "Installing npm dependencies…"
npm install --silent

# ── 5. Database migrations ────────────────────────────────────────────────────
info "Running database migrations…"
npx prisma migrate deploy

# ── 6. Build ──────────────────────────────────────────────────────────────────
info "Building Koku (this may take a minute)…"
npm run build

# ── Done ──────────────────────────────────────────────────────────────────────
echo ""
success "Setup complete!"
echo ""
echo "  Start Koku:     npm start"
echo "  Dev server:     npm run dev"
[ "$MODE" = "1" ] && echo "  Stop Postgres:  docker compose -f public/downloads/docker-compose.yml down"
echo ""
