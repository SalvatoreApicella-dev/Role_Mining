# Business continuity and restore drill procedure

Version: 1.0
Last updated: February 25, 2026
Owner: Platform Lead

## Purpose

This procedure defines periodic backup-restore drills and evidence required for
NIS2 continuity controls.

## Frequency

- Quarterly restore drill in isolated environment.
- Additional drill after major architecture changes.

## Drill steps

1. Select backup snapshot and note snapshot timestamp.
2. Restore data/services in isolated environment.
3. Run smoke tests and tenant isolation checks.
4. Measure effective RTO and RPO.
5. Record outcomes and remediation actions.

## Evidence template

| Drill date | System | Target RTO | Measured RTO | Target RPO | Measured RPO | Result | Evidence path |
|---|---:|---:|---:|---:|---:|---|---|
| _YYYY-MM-DD_ | _name_ | _m_ | _m_ | _m_ | _m_ | Pass/Fail | _path_ |

## Exit criteria

- Restore completed successfully.
- RTO/RPO within target or approved exception.
- Corrective actions opened for any deviation.
