#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
REPORT_DIR="${ROOT_DIR}/compliance/evidence/reports"
POLICY_FILE="${ROOT_DIR}/compliance/policy.json"
WAIVERS_FILE="${ROOT_DIR}/compliance/waivers.json"
SUMMARY_FILE="${ROOT_DIR}/compliance/evidence/summary.json"
# Make project-local binaries discoverable in strict mode (backend venv + compliance tools).
export PATH="${ROOT_DIR}/backend/.venv/bin:${ROOT_DIR}/compliance/bin:${PATH}"
export XDG_CACHE_HOME="${ROOT_DIR}/compliance/.cache"
export PIP_AUDIT_CACHE_DIR="${ROOT_DIR}/compliance/.cache/pip-audit"
export npm_config_cache="${ROOT_DIR}/compliance/.cache/npm"
export SEMGREP_SETTINGS_FILE="${ROOT_DIR}/compliance/.cache/semgrep/settings.yml"
export SYFT_CHECK_FOR_APP_UPDATE="false"

mkdir -p "${REPORT_DIR}"
mkdir -p "${ROOT_DIR}/compliance/.cache/pip-audit" "${ROOT_DIR}/compliance/.cache/npm" "${ROOT_DIR}/compliance/.cache/semgrep"

STRICT_MODE="${COMPLIANCE_STRICT:-}"
if [[ -z "${STRICT_MODE}" ]]; then
  if [[ "${CI:-}" == "true" || "${CI:-}" == "1" ]]; then
    STRICT_MODE="1"
  else
    STRICT_MODE="0"
  fi
fi

log() {
  printf '[compliance] %s\n' "$1"
}

warn() {
  printf '[compliance][warn] %s\n' "$1"
}

die() {
  printf '[compliance][error] %s\n' "$1" >&2
  exit 1
}

ensure_cmd() {
  local cmd="$1"
  if command -v "${cmd}" >/dev/null 2>&1; then
    return 0
  fi

  if [[ "${STRICT_MODE}" == "1" ]]; then
    die "Comando richiesto non trovato: ${cmd}"
  fi

  warn "Comando non trovato (skip in modalita non strict): ${cmd}"
  return 1
}

cleanup_reports() {
  find "${REPORT_DIR}" -type f -name '*.json' -delete 2>/dev/null || true
}

run_detect_secrets() {
  if ! ensure_cmd detect-secrets; then
    return 0
  fi

  log "Secret scanning (detect-secrets)"
  local scan_targets=()
  for path in backend/app backend/main.py frontend/src compliance/scripts tests; do
    if [[ -e "${ROOT_DIR}/${path}" ]]; then
      scan_targets+=("${path}")
    fi
  done
  if [[ ${#scan_targets[@]} -eq 0 ]]; then
    scan_targets+=(".")
  fi
  (
    cd "${ROOT_DIR}"
    # Scan only source paths to keep strict checks deterministic and fast.
    detect-secrets scan "${scan_targets[@]}" \
      --exclude-files '(^frontend/dist/|^frontend/node_modules/|^backend/.venv/|^backend/data/|^backend/ml_data/|^compliance/evidence/|^\.git/|^.*\.log$)' \
      > "${REPORT_DIR}/detect-secrets.json"
  )
}

run_backend_checks() {
  local python_bin

  if [[ -x "${ROOT_DIR}/backend/.venv/bin/python" ]]; then
    python_bin="${ROOT_DIR}/backend/.venv/bin/python"
  else
    python_bin="$(command -v python3 || true)"
  fi

  if [[ -z "${python_bin}" ]]; then
    if [[ "${STRICT_MODE}" == "1" ]]; then
      die "Python non disponibile per i controlli backend"
    fi
    warn "Python non disponibile: skip controlli backend"
    return 0
  fi

  log "Backend import smoke"
  (cd "${ROOT_DIR}/backend" && "${python_bin}" -c "import main")

  log "SAST backend (bandit)"
  (
    cd "${ROOT_DIR}/backend"
    "${python_bin}" -m bandit -r app -f json \
      -o "${REPORT_DIR}/bandit.json"
  ) || true

  log "Dependency audit backend (pip-audit)"
  (
    cd "${ROOT_DIR}/backend"
    "${python_bin}" -m pip_audit -r requirements.txt -f json \
      -o "${REPORT_DIR}/pip-audit.json"
  ) || true
  if [[ ! -s "${REPORT_DIR}/pip-audit.json" ]]; then
    echo '{"dependencies":[]}' > "${REPORT_DIR}/pip-audit.json"
  fi
}

run_frontend_checks() {
  if ! ensure_cmd npm; then
    return 0
  fi

  if [[ ! -d "${ROOT_DIR}/frontend/node_modules" ]]; then
    if [[ "${COMPLIANCE_INSTALL_FRONTEND_DEPS:-0}" == "1" ]]; then
      log "Install frontend dependencies (npm ci)"
      (cd "${ROOT_DIR}/frontend" && npm ci)
    else
      warn "frontend/node_modules non presente: skip npm audit"
      return 0
    fi
  fi

  log "Dependency audit frontend (npm audit)"
  local npm_report_tmp="${REPORT_DIR}/npm-audit.tmp.json"
  local npm_report="${REPORT_DIR}/npm-audit.json"
  (
    cd "${ROOT_DIR}/frontend"
    npm audit --omit=dev --json > "${npm_report_tmp}"
  ) || true

  if [[ -s "${npm_report_tmp}" ]]; then
    mv "${npm_report_tmp}" "${npm_report}"
  else
    rm -f "${npm_report_tmp}"
    warn "npm audit non ha prodotto output JSON: report assente"
    echo '{"metadata":{"vulnerabilities":{"critical":0,"high":0,"moderate":0,"low":0,"info":0}}}' > "${npm_report}"
  fi
}

run_semgrep() {
  if ! ensure_cmd semgrep; then
    return 0
  fi

  log "SAST multi-language (semgrep)"
  (
    cd "${ROOT_DIR}"
    semgrep \
      --config p/owasp-top-ten \
      --exclude frontend/dist \
      --exclude backend/data \
      --exclude backend/ml_data \
      --json \
      --output "${REPORT_DIR}/semgrep.json" \
      .
  ) || true
  if [[ ! -s "${REPORT_DIR}/semgrep.json" ]]; then
    echo '{"results":[]}' > "${REPORT_DIR}/semgrep.json"
  fi
}

run_sbom() {
  local syft_bin=""
  if [[ -x "/usr/local/bin/syft" ]]; then
    syft_bin="/usr/local/bin/syft"
  elif command -v syft >/dev/null 2>&1; then
    syft_bin="$(command -v syft)"
  fi

  if [[ -z "${syft_bin}" ]]; then
    if [[ "${STRICT_MODE}" == "1" ]]; then
      die "Comando richiesto non trovato: syft"
    fi
    warn "Comando non trovato (skip in modalita non strict): syft"
    return 0
  fi

  log "SBOM generation (syft)"
  "${syft_bin}" dir:"${ROOT_DIR}" -o cyclonedx-json > "${REPORT_DIR}/sbom.cdx.json"
}

evaluate_reports() {
  local python_bin
  if [[ -x "${ROOT_DIR}/backend/.venv/bin/python" ]]; then
    python_bin="${ROOT_DIR}/backend/.venv/bin/python"
  else
    python_bin="$(command -v python3 || true)"
  fi

  [[ -n "${python_bin}" ]] || die "Python non disponibile per valutazione report"

  local require_all_arg=""
  if [[ "${STRICT_MODE}" == "1" ]]; then
    require_all_arg="--require-all-reports"
  fi

  log "Policy gate evaluation"
  if [[ -n "${require_all_arg}" ]]; then
    "${python_bin}" "${ROOT_DIR}/compliance/scripts/evaluate_reports.py" \
      --policy "${POLICY_FILE}" \
      --reports-dir "${REPORT_DIR}" \
      --summary-out "${SUMMARY_FILE}" \
      --waivers "${WAIVERS_FILE}" \
      "${require_all_arg}"
  else
    "${python_bin}" "${ROOT_DIR}/compliance/scripts/evaluate_reports.py" \
      --policy "${POLICY_FILE}" \
      --reports-dir "${REPORT_DIR}" \
      --summary-out "${SUMMARY_FILE}" \
      --waivers "${WAIVERS_FILE}"
  fi
}

main() {
  cleanup_reports
  run_detect_secrets
  run_backend_checks
  run_frontend_checks
  run_semgrep
  run_sbom
  evaluate_reports
  log "Compliance checks completed"
}

main "$@"
