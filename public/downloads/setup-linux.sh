#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Koku Setup — Linux
# Run: bash setup-linux.sh
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail
cd "$(dirname "$(realpath "$0")")"

BOLD="\033[1m"; RESET="\033[0m"; GREEN="\033[32m"; RED="\033[31m"; CYAN="\033[36m"
info()    { echo -e "${CYAN}▶ $*${RESET}"; }
success() { echo -e "${GREEN}✔ $*${RESET}"; }
error()   { echo -e "${RED}✖ $*${RESET}"; exit 1; }

echo -e "${BOLD}"
echo "  刻 Koku — Local Setup for Linux"
echo "  ─────────────────────────────────"
echo -e "${RESET}"

# ── 1. Prerequisites ──────────────────────────────────────────────────────────
info "Checking prerequisites…"

if ! command -v node &>/dev/null; then
  error "Node.js not found. Install from https://nodejs.org or via nvm (v20+)."
fi
NODE_VER=$(node -e "process.stdout.write(process.versions.node.split('.')[0])")
[ "$NODE_VER" -lt 20 ] && error "Node.js v20+ required (found v${NODE_VER})."

if ! command -v git &>/dev/null; then
  error "Git not found. Install with: sudo apt install git  OR  sudo dnf install git"
fi

if ! command -v docker &>/dev/null; then
  error "Docker not found. See https://docs.docker.com/engine/install/"
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

# Generate random encryption key using /dev/urandom if openssl unavailable
if command -v openssl &>/dev/null; then
  ENCRYPTION_KEY=$(openssl rand -hex 16)
else
  ENCRYPTION_KEY=$(head -c 16 /dev/urandom | od -An -tx1 | tr -d ' \n')
fi

if [ "$MODE" = "1" ]; then
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

# ── 4. Install + migrate + build ──────────────────────────────────────────────
info "Installing npm dependencies…"
npm install --silent

info "Running database migrations…"
npx prisma migrate deploy

info "Building Koku…"
npm run build

# ── Done ──────────────────────────────────────────────────────────────────────
echo ""
success "Setup complete!"
echo ""
echo "  Start Koku:     npm start"
echo "  Dev server:     npm run dev"
[ "$MODE" = "1" ] && echo "  Stop Postgres:  docker compose -f public/downloads/docker-compose.yml down"
echo ""
