# Audit trail evidence index

Version: 1.0
Last updated: February 25, 2026
Owner: Compliance Lead

## Purpose

This index lists the evidence artifacts used to demonstrate NIS2 control
operation.

## Current evidence set

| Control area | Artifact | Path | Date | Status |
|---|---|---|---|---|
| Technical compliance gate | Summary JSON | `compliance/evidence/summary.json` | 2026-02-25 | Available |
| Secret scanning | detect-secrets report | `compliance/evidence/reports/detect-secrets.json` | 2026-02-25 | Available |
| SAST backend | Bandit report | `compliance/evidence/reports/bandit.json` | 2026-02-25 | Available |
| SBOM | CycloneDX JSON | `compliance/evidence/reports/sbom.cdx.json` | 2026-02-25 | Available |
| Incident reporting procedure | Runbook | `compliance/governance/incident-reporting-runbook.md` | 2026-02-25 | Available |
| Supply chain procedure | Process document | `compliance/governance/supply-chain-security-procedure.md` | 2026-02-25 | Available |
| Training register | Register template | `compliance/governance/training-and-awareness-register.md` | 2026-02-25 | Available |
| BCP/DR drill procedure | Process document | `compliance/governance/business-continuity-drill-procedure.md` | 2026-02-25 | Available |

## Missing execution evidence to collect

- Signed incident drill execution record.
- Completed training attendance records.
- Completed restore drill record with measured RTO/RPO.
- Supplier register with signed review.
