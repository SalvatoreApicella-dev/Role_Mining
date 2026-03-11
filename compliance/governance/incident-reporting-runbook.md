# Incident reporting runbook (NIS2 timing)

Version: 1.0
Last updated: February 25, 2026
Owner: Security Manager

## Purpose

This runbook defines the minimum operational flow to meet NIS2 incident timing:

1. Early warning within 24 hours.
2. Detailed notification within 72 hours.
3. Final report within one month.

## Severity model

- `SEV-1`: confirmed service compromise or major business impact.
- `SEV-2`: high risk event with partial impact.
- `SEV-3`: contained event with low impact.

## Roles

- Incident Commander (IC): coordinates response.
- Technical Lead: drives containment/eradication/recovery.
- Compliance Lead: prepares regulator notifications.
- Communications Lead: internal and external messaging.

## 0-24h actions (early warning)

1. Open incident ticket with UTC timestamps.
2. Freeze volatile evidence (logs, traces, auth events, config snapshots).
3. Classify severity and impacted assets/tenants.
4. Send early warning package to competent authority.

Minimum early warning content:

- Incident ID and discovery timestamp.
- Initial impact and scope.
- Temporary mitigation in place.
- Contact point.

## 24-72h actions (detailed report)

1. Publish root-cause hypothesis and confidence level.
2. Quantify affected services, data categories, and tenant exposure.
3. Document containment and recovery actions.
4. Submit detailed notification.

## 72h-1 month actions (final report)

1. Confirm root cause.
2. Confirm full remediation and residual risk.
3. List corrective/preventive actions with owners and due dates.
4. Archive all evidence in `compliance/evidence/governance/<date>/`.

## Evidence checklist

- Timeline file with UTC timestamps.
- Decision log and owner approvals.
- Notification copies (24h/72h/final).
- Technical forensics summary.
- CAPA list (corrective and preventive actions).
