#!/usr/bin/env bash
# ==============================================================================
# Wayaz - Production Pre-Deployment Build Script
# ==============================================================================
# Builds backend static files and the frontend Next.js bundle locally, then
# (with --deploy) rsyncs build artifacts + source to the DirectAdmin panel,
# restarts both apps, and verifies live health.
#
# Usage:
#   scripts/build-production.sh            Build + verify only (local, safe)
#   scripts/build-production.sh --deploy   Build, rsync, restart, verify live
#
# Deploy config: gitignored .env.deploy at the repo root (see .env.deploy.sample).
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

usage() {
  sed -n '3,13p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
}

DEPLOY=false
for arg in "$@"; do
  case "$arg" in
    --deploy) DEPLOY=true ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown option: $arg (only --deploy is supported)"; echo; usage; exit 1 ;;
  esac
done

# Load the deploy target from the gitignored .env.deploy BEFORE the slow build,
# so a missing/incomplete config fails in a second rather than minutes.
if $DEPLOY; then
  DEPLOY_ENV="$ROOT_DIR/.env.deploy"
  if [ ! -f "$DEPLOY_ENV" ]; then
    echo "ERROR: missing $DEPLOY_ENV"
    echo "Copy the template and fill in your panel details:"
    echo "  cp .env.deploy.sample .env.deploy"
    exit 1
  fi
  # shellcheck source=/dev/null
  . "$DEPLOY_ENV"
  for var in WAYAZ_SSH_USER WAYAZ_SSH_HOST WAYAZ_SSH_PORT WAYAZ_DEPLOY_PATH; do
    if [ -z "${!var:-}" ]; then
      echo "ERROR: $var is not set in .env.deploy (see .env.deploy.sample)"
      exit 1
    fi
  done
fi

if $DEPLOY; then TOTAL=4; else TOTAL=3; fi

echo "=== 1/$TOTAL: Checking Backend Django Setup ==="
cd "$ROOT_DIR/backend"
if [ ! -f ".env" ]; then
  if [ -f ".env.production" ]; then
    echo "Creating backend/.env from .env.production..."
    cp .env.production .env
  fi
fi

echo "Running Django check..."
uv run python manage.py check

echo "Running Django collectstatic..."
uv run python manage.py collectstatic --noinput

echo "=== 2/$TOTAL: Building Frontend Next.js Bundle ==="
cd "$ROOT_DIR/frontend"
if [ ! -f ".env.production" ]; then
  echo "Missing frontend/.env.production! Copying sample..."
  cp .env.production.sample .env.production
fi

echo "Building Next.js application..."
HAS_DEV_ENV=false
if [ -f ".env.local" ]; then
  HAS_DEV_ENV=true
  mv .env.local .env.local.dev
fi

trap 'if [ "$HAS_DEV_ENV" = true ]; then mv .env.local.dev .env.local; fi' EXIT

NODE_ENV=production npm run build

if [ "$HAS_DEV_ENV" = true ]; then
  mv .env.local.dev .env.local
  HAS_DEV_ENV=false
fi

echo "=== 3/$TOTAL: Verifying Production Entrypoints ==="
node -c "$ROOT_DIR/frontend/server.js"
cd "$ROOT_DIR/backend"
uv run python -c "import passenger_wsgi; print('Backend passenger_wsgi initialized successfully.')"

if [ "$DEPLOY" = false ]; then
  echo ""
  echo "=== SUCCESS: Production files are ready for DirectAdmin deployment! ==="
  echo "(re-run with --deploy to upload, restart, and verify automatically)"
  exit 0
fi

# ==============================================================================
# Deploy: sync build artifacts + source to the panel, restart, verify.
# ==============================================================================
echo "=== 4/4: Deploying to DirectAdmin panel ==="

SSH_KEY="${WAYAZ_SSH_KEY:-$HOME/.ssh/wayaz_deploy}"

SSH_OPTS=(-p "$WAYAZ_SSH_PORT" -o BatchMode=yes -o ConnectTimeout=15)
if [ -n "$SSH_KEY" ]; then
  if [ ! -f "$SSH_KEY" ]; then
    echo "ERROR: deploy key not found: $SSH_KEY"
    echo "Create one and install it on the panel:"
    echo "  ssh-keygen -t ed25519 -f ~/.ssh/wayaz_deploy -N ''"
    echo "  ssh-copy-id -p $WAYAZ_SSH_PORT -i ~/.ssh/wayaz_deploy $WAYAZ_SSH_USER@$WAYAZ_SSH_HOST"
    exit 1
  fi
  SSH_OPTS+=(-i "$SSH_KEY")
fi
RSYNC_SSH="ssh ${SSH_OPTS[*]}"
REMOTE="$WAYAZ_SSH_USER@$WAYAZ_SSH_HOST"
REMOTE_ROOT="$REMOTE:$WAYAZ_DEPLOY_PATH"

# 1) Source tree mirror. No --delete: files that only exist on the panel
#    (env files, node_modules, media, logs, runtime tmp) are always kept.
#    docs/ is excluded on purpose: it holds gitignored plans and credentials
#    that must never leave this machine.
echo "Syncing source tree -> $REMOTE_ROOT ..."
rsync -az -e "$RSYNC_SSH" \
  --exclude '.git/' \
  --exclude 'docs/' \
  --exclude '.env' --exclude '.env.*' \
  --exclude 'node_modules/' \
  --exclude '.venv/' \
  --exclude '.next/' \
  --exclude 'staticfiles/' \
  --exclude 'media/' \
  --exclude '__pycache__/' --exclude '*.pyc' \
  --exclude '*.log' --exclude 'tmp/' \
  --exclude 'tsconfig.tsbuildinfo' \
  "$ROOT_DIR/" "$REMOTE_ROOT/"

# 2) Fresh Next.js build (generated output, so stale chunks are deleted;
#    the panel's runtime .next/cache is excluded and therefore protected).
echo "Syncing Next.js build -> $REMOTE_ROOT/frontend/.next ..."
rsync -az --delete -e "$RSYNC_SSH" --exclude 'cache/' \
  "$ROOT_DIR/frontend/.next/" "$REMOTE_ROOT/frontend/.next/"

# 3) Collected static files (generated output).
echo "Syncing collected static files -> $REMOTE_ROOT/backend/staticfiles ..."
rsync -az --delete -e "$RSYNC_SSH" \
  "$ROOT_DIR/backend/staticfiles/" "$REMOTE_ROOT/backend/staticfiles/"

# Dependencies are installed ON the panel (its own Node runtime / virtualenv)
# — never rsync node_modules across Node ABIs. Just warn on drift.
local_lock="$(sha256sum "$ROOT_DIR/frontend/package-lock.json" | cut -d' ' -f1)"
remote_lock="$(ssh "${SSH_OPTS[@]}" "$REMOTE" \
  "sha256sum ~/$WAYAZ_DEPLOY_PATH/frontend/package-lock.json 2>/dev/null" \
  | cut -d' ' -f1 || :)"
if [ -n "$remote_lock" ] && [ "$local_lock" != "$remote_lock" ]; then
  echo "WARNING: frontend dependencies changed — run npm install for the app"
  echo "         (DirectAdmin -> Node.js Apps -> Install dependencies)"
fi
local_reqs="$(sha256sum "$ROOT_DIR/backend/requirements.txt" | cut -d' ' -f1)"
remote_reqs="$(ssh "${SSH_OPTS[@]}" "$REMOTE" \
  "sha256sum ~/$WAYAZ_DEPLOY_PATH/backend/requirements.txt 2>/dev/null" \
  | cut -d' ' -f1 || :)"
if [ -n "$remote_reqs" ] && [ "$local_reqs" != "$remote_reqs" ]; then
  echo "WARNING: backend dependencies changed — pip install -r requirements.txt"
  echo "         inside the panel's virtualenv for this app"
fi

# Passenger/LiteSpeed pick up changes only after a restart; touching
# tmp/restart.txt in each app root is the panel's restart trigger.
echo "Restarting apps (touch tmp/restart.txt)..."
ssh "${SSH_OPTS[@]}" "$REMOTE" \
  "touch ~/$WAYAZ_DEPLOY_PATH/frontend/tmp/restart.txt ~/$WAYAZ_DEPLOY_PATH/backend/tmp/restart.txt"

echo "Verifying live endpoints..."
verified=false
store_code=000
health_code=000
for _ in $(seq 1 20); do
  store_code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 \
    -A 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36' \
    https://wayaz.co.ke/ || :)"
  health_code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 \
    -A 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36' \
    https://api.wayaz.co.ke/api/health/ || :)"
  if [ "$store_code" = "200" ] && [ "$health_code" = "200" ]; then
    verified=true
    break
  fi
  sleep 3
done

if [ "$verified" = false ]; then
  echo "ERROR: post-deploy verification failed"
  echo "       (storefront=$store_code, api health=$health_code)"
  echo "Check logs on the panel:"
  echo "  tail -40 ~/$WAYAZ_DEPLOY_PATH/frontend/stderr.log"
  echo "  tail -40 ~/$WAYAZ_DEPLOY_PATH/backend/stderr.log"
  exit 1
fi

echo "Storefront: $store_code   API health: $health_code"
echo ""
echo "=== SUCCESS: Deployed and verified live! ==="
