#!/bin/bash
set -euo pipefail

BACK="/Users/salvo/Development/Role_Mining/backend"
STORE="$BACK/data/storage.json"
CSV="$BACK/large_dataset_import_5000_corrected.csv"

if [ -f "$STORE" ]; then
  cp "$STORE" "$BACK/data/storage.json.backup_$(date +%Y%m%d_%H%M%S)_pre_replace"
  rm "$STORE"
fi

lsof -ti tcp:8000 | xargs kill -9 2>/dev/null || true
cd "$BACK"
"$BACK/.venv/bin/uvicorn" main:app --host 127.0.0.1 --port 8000 > /tmp/rm_backend_import_once.log 2>&1 &
PID=$!
trap "kill $PID >/dev/null 2>&1 || true; wait $PID 2>/dev/null || true" EXIT

for i in {1..60}; do
  if curl -sf "http://127.0.0.1:8000/api/health" >/dev/null; then
    break
  fi
  sleep 1
done

curl -sf "http://127.0.0.1:8000/api/health" >/dev/null

LOGIN_JSON=$(curl -s -X POST "http://127.0.0.1:8000/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}')
TOKEN=$(printf "%s" "$LOGIN_JSON" | python3 -c 'import sys,json; print((json.loads(sys.stdin.read()) or {}).get("access_token",""))')

if [ -z "$TOKEN" ]; then
  echo "LOGIN_JSON=$LOGIN_JSON"
  exit 1
fi

IMPORT_RES=$(curl -s -X POST "http://127.0.0.1:8000/api/import/csv" \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@$CSV")
CLUSTER_RES=$(curl -s "http://127.0.0.1:8000/api/kpi/drilldown?metric=cluster-quality" \
  -H "Authorization: Bearer $TOKEN")
MODEL_RES=$(curl -s "http://127.0.0.1:8000/api/kpi/drilldown?metric=model-quality" \
  -H "Authorization: Bearer $TOKEN")
USERS_RES=$(curl -s "http://127.0.0.1:8000/api/users?limit=1&offset=0" \
  -H "Authorization: Bearer $TOKEN")

python3 - <<PY
import json
imp=json.loads('''$IMPORT_RES''')
clu=json.loads('''$CLUSTER_RES''')
mod=json.loads('''$MODEL_RES''')
usr=json.loads('''$USERS_RES''')
print("import_ok",imp.get("ok"))
print("import_rows_total",imp.get("rowsTotal"))
print("import_total_users",imp.get("totalUsers"))
print("import_dup_rows",imp.get("csvDuplicateDisplayNameRows"))
print("import_auto_resolved_dup_users",imp.get("autoResolvedDuplicateUsers"))
stats=(clu.get("stats") or {})
print("cluster_missing_roles",stats.get("missingRoles"))
print("cluster_missing_department",stats.get("missingDepartment"))
print("model_zero_group_users",len(mod.get("zeroGroupsUsers") or []))
items=usr.get("items") or []
print("sample_display_name", (items[0].get("displayName") if items else None))
PY
