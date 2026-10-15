#!/usr/bin/env bash
# ==============================================================================
# Wayaz - Production Pre-Deployment Build Script
# ==============================================================================
# Builds both backend static files and frontend Next.js bundle locally,
# ensuring zero errors before uploading files to DirectAdmin.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "=== 1/3: Checking Backend Django Setup ==="
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

echo "=== 2/3: Building Frontend Next.js Bundle ==="
cd "$ROOT_DIR/frontend"
if [ ! -f ".env.production" ]; then
  echo "Missing frontend/.env.production! Copying sample..."
  cp .env.production.sample .env.production
fi

echo "Building Next.js application..."
npm run build

echo "=== 3/3: Verifying Production Entrypoints ==="
node -c "$ROOT_DIR/frontend/server.js"
cd "$ROOT_DIR/backend"
uv run python -c "import passenger_wsgi; print('Backend passenger_wsgi initialized successfully.')"

echo ""
echo "=== SUCCESS: Production files are ready for DirectAdmin deployment! ==="
