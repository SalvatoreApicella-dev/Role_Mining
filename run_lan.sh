#!/usr/bin/env bash
set -euo pipefail

ROOT="/Users/salvo/Development/Role_Mining"
BACK="$ROOT/backend"
FRONT="$ROOT/frontend"
BACK_LOG="$ROOT/backend_manual.log"
FRONT_LOG="$ROOT/frontend_manual.log"
NODE_PATH="/Users/salvo/.nvm/versions/node/v24.13.0/bin"

kill_port() {
  local p="$1"
  lsof -ti tcp:"$p" | xargs kill -9 2>/dev/null || true
}

kill_port 8000
kill_port 5173

nohup /bin/zsh -lc "cd '$BACK'; '$BACK/.venv/bin/python' -m uvicorn main:app --host 0.0.0.0 --port 8000 --timeout-keep-alive 120 --timeout-graceful-shutdown 30" >"$BACK_LOG" 2>&1 &
nohup /bin/zsh -lc "export PATH=$NODE_PATH:\$PATH; cd '$FRONT'; node node_modules/vite/bin/vite.js --host 0.0.0.0 --port 5173 --strictPort" >"$FRONT_LOG" 2>&1 &

for _ in {1..30}; do
  curl -sf "http://127.0.0.1:8000/api/health" >/dev/null && break
  sleep 1
done

for _ in {1..30}; do
  curl -sf "http://127.0.0.1:5173" >/dev/null && break
  sleep 1
done

IP="$(ifconfig | awk '/inet / && $2 != "127.0.0.1" {print $2; exit}')"
if [ -z "${IP:-}" ]; then
  IP="127.0.0.1"
fi

echo "LAN Frontend: http://$IP:5173"
echo "LAN Backend : http://$IP:8000/api/health"
echo "Logs:"
echo "  $BACK_LOG"
echo "  $FRONT_LOG"
