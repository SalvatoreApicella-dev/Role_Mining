# NIS2 gap remediation report

Date: February 25, 2026
Scope: technical security gate + compliance evidence package.

## Objective

This report documents remediation of previously identified blocking gaps:

1. Security gate failed (secrets + medium SAST findings).
2. Missing closure evidence with successful re-test.
3. Incomplete governance/procedural evidence package.

## Gap 1 remediation: security gate findings

### Actions implemented

- Removed plaintext seeded system credentials from tenant default storage.
- Migrated system-user authentication to hashed credentials (`password_hash`)
  with PBKDF2-HMAC-SHA256 and constant-time verification.
- Added URL scheme validation (`http/https` only) before outbound HTTP calls.
- Mitigated Bandit B310 findings using validated paths and controlled `urlopen`
  usage.

### Key files updated

- `backend/app/db/storage.py`
- `backend/app/server.py`

### Verification result

`COMPLIANCE_STRICT=1 compliance/scripts/run_compliance_checks.sh`

- Exit code: `0`
- `compliance/evidence/summary.json`: `"status": "passed"`
- `detect_secrets_total`: `0`
- `bandit_medium`: `0`

## Gap 2 remediation: closure evidence + green re-test

### Re-tests executed

- `tests/test_kpi.py` + `tests/test_kpi_integration.py`: pass
- `frontend/src/tests/kpi.test.jsx`: pass
- Compliance strict gate: pass

### Evidence paths

- `compliance/evidence/summary.json`
- `compliance/evidence/test-runs/rerun-2026-02-25-v4/compliance_strict_after_fix.out`
- `compliance/evidence/test-runs/rerun-2026-02-25-v4/pytest_root_suite_after_fix.out`
- `compliance/evidence/test-runs/rerun-2026-02-25-v4/frontend_vitest_kpi_after_fix.out`

## Gap 3 remediation: governance/procedural artifacts

### Artifacts created

- Incident reporting runbook:
  `compliance/governance/incident-reporting-runbook.md`
- Supply chain security procedure:
  `compliance/governance/supply-chain-security-procedure.md`
- Training and awareness register template:
  `compliance/governance/training-and-awareness-register.md`
- Business continuity/restore drill procedure:
  `compliance/governance/business-continuity-drill-procedure.md`
- Audit evidence index:
  `compliance/governance/audit-trail-evidence-index.md`

### Status

- Governance framework documents: created and versioned.
- Execution records (signed drill/training/supplier review): still to be
  produced by operational owners.

## Can it pass NIS2 now?

Technical gate perspective: **yes, now green**.

Full NIS2 compliance assertion: **not automatically guaranteed by code only**.
It still requires operational execution evidence and management sign-off for
organizational controls (incident drills, training completion, supplier review,
BCP drill records).

## Final assessment

- Blocking technical gaps: **closed**.
- Blocking evidence gap for code security controls: **closed**.
- Organizational/procedural readiness: **materially improved** with formal
  artifacts, pending execution records.
