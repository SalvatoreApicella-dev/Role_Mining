# Supply chain security procedure

Version: 1.0
Last updated: February 25, 2026
Owner: Engineering Manager

## Purpose

This procedure governs third-party risk controls for dependencies, build
artifacts, and external providers.

## Mandatory controls

1. Generate SBOM for every release candidate.
2. Run SAST/SCA/secret scans on each release branch.
3. Block release on policy violations (`compliance/policy.json`).
4. Record supplier criticality and contact/escalation data.
5. Require contractual security clauses for critical suppliers.

## Operational steps

1. Execute `compliance/scripts/run_compliance_checks.sh` in strict mode.
2. Archive outputs under `compliance/evidence/reports/` and signed bundle path.
3. Review `summary.json` and verify `status=passed`.
4. If failed, open remediation ticket and re-run after fix.

## Supplier register minimum fields

- Supplier name.
- Service/product and business dependency.
- Data processed.
- Incident notification SLA.
- Security certification/attestation.
- Contract renewal date.

## Exceptions

Any exception requires:

- Risk owner approval.
- Expiry date.
- Compensating controls.
- Reference ticket.
