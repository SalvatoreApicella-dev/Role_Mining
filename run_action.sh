#!/usr/bin/env bash
set -euo pipefail

ROOT="/Users/salvo/Development/Role_Mining"
BACKEND_DIR="$ROOT/backend"
FRONTEND_DIR="$ROOT/frontend"
BACKEND_VENV="$BACKEND_DIR/.venv"
BACKEND_LOG="$ROOT/backend_manual.log"
FRONTEND_LOG="$ROOT/frontend_manual.log"
APP_URL="http://localhost:5173"
BACKEND_URL="http://127.0.0.1:8000"
BACKEND_PORT="8000"
FRONTEND_PORT="5173"

command -v python3 >/dev/null 2>&1 || { echo "python3 non trovato"; exit 1; }
command -v curl >/dev/null 2>&1 || { echo "curl non trovato"; exit 1; }
command -v lsof >/dev/null 2>&1 || { echo "lsof non trovato"; exit 1; }

if ! command -v npm >/dev/null 2>&1; then
  if [ -s "$HOME/.nvm/nvm.sh" ]; then
    # shellcheck disable=SC1090
    source "$HOME/.nvm/nvm.sh"
    nvm use 24.13.0 >/dev/null 2>&1 || nvm use --lts >/dev/null 2>&1 || true
  fi
fi

command -v npm >/dev/null 2>&1 || { echo "npm non trovato (installa Node via nvm)"; exit 1; }

mkdir -p "$ROOT"

if [ ! -d "$BACKEND_VENV" ]; then
  python3 -m venv "$BACKEND_VENV"
fi

source "$BACKEND_VENV/bin/activate"
if ! python - <<'PY'
import importlib.util
import sys
mods = ["fastapi", "uvicorn", "numpy", "sklearn", "jwt", "openpyxl"]
missing = [m for m in mods if importlib.util.find_spec(m) is None]
sys.exit(1 if missing else 0)
PY
then
  pip install -r "$BACKEND_DIR/requirements.txt"
fi
deactivate

if [ ! -d "$FRONTEND_DIR/node_modules" ]; then
  (cd "$FRONTEND_DIR" && npm install)
fi

cleanup_port() {
  local port="$1"
  local pids
  pids="$(lsof -ti tcp:"$port" || true)"
  if [ -n "$pids" ]; then
    kill $pids >/dev/null 2>&1 || true
    sleep 1
    pids="$(lsof -ti tcp:"$port" || true)"
    if [ -n "$pids" ]; then
      kill -9 $pids >/dev/null 2>&1 || true
    fi
  fi
}

# Pulizia preventiva processi bloccati sulle porte note
cleanup_port "$BACKEND_PORT"
cleanup_port "$FRONTEND_PORT"

nohup bash -lc "cd '$BACKEND_DIR' && '$BACKEND_VENV/bin/uvicorn' main:app --host 127.0.0.1 --port $BACKEND_PORT" \
  >"$BACKEND_LOG" 2>&1 &

nohup bash -lc "source '$HOME/.nvm/nvm.sh' 2>/dev/null || true; nvm use 24.13.0 >/dev/null 2>&1 || true; cd '$FRONTEND_DIR' && npm run dev" \
  >"$FRONTEND_LOG" 2>&1 &

for _ in {1..60}; do
  if curl -sf "$BACKEND_URL/api/health" >/dev/null; then
    break
  fi
  sleep 1
done

if ! curl -sf "$BACKEND_URL/api/health" >/dev/null; then
  echo "Backend non raggiungibile su $BACKEND_URL"
  echo "Controlla log: $BACKEND_LOG"
  exit 1
fi

for _ in {1..60}; do
  if curl -sf "$APP_URL" >/dev/null; then
    break
  fi
  sleep 1
done

if ! curl -sf "$APP_URL" >/dev/null; then
  echo "Frontend non raggiungibile su $APP_URL"
  echo "Controlla log: $FRONTEND_LOG"
  exit 1
fi

open -a "Google Chrome" "$APP_URL"
echo "App avviata: $APP_URL"
echo "Backend log: $BACKEND_LOG"
echo "Frontend log: $FRONTEND_LOG"
