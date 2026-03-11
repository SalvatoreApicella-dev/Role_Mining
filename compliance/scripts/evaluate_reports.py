#!/usr/bin/env python3
"""Evaluate compliance reports against policy thresholds."""

from __future__ import annotations

import argparse
import json
import sys
from datetime import date
from pathlib import Path
from typing import Any


def load_json(path: Path, parse_errors: list[str]) -> Any:
    try:
        with path.open("r", encoding="utf-8") as handle:
            return json.load(handle)
    except (OSError, json.JSONDecodeError) as exc:
        parse_errors.append(f"{path.name}: {exc}")
        return {}


def parse_detect_secrets(data: Any) -> int:
    results = data.get("results", {}) if isinstance(data, dict) else {}
    if not isinstance(results, dict):
        return 0
    return sum(len(items) for items in results.values() if isinstance(items, list))


def parse_bandit(data: Any) -> dict[str, int]:
    counts = {"low": 0, "medium": 0, "high": 0}
    results = data.get("results", []) if isinstance(data, dict) else []
    for finding in results:
        severity = str(finding.get("issue_severity", "")).upper()
        if severity == "LOW":
            counts["low"] += 1
        elif severity == "MEDIUM":
            counts["medium"] += 1
        elif severity == "HIGH":
            counts["high"] += 1
    return counts


def parse_pip_audit(data: Any) -> int:
    # Current format: {"dependencies":[{"vulns":[...]}], ...}
    if isinstance(data, dict):
        dependencies = data.get("dependencies", [])
        total = 0
        for dep in dependencies:
            vulns = dep.get("vulns") or dep.get("vulnerabilities") or []
            if isinstance(vulns, list):
                total += len(vulns)
        # Fallback for older formats.
        vulnerabilities = data.get("vulnerabilities", [])
        if isinstance(vulnerabilities, list):
            total = max(total, len(vulnerabilities))
        return total

    if isinstance(data, list):
        return len(data)

    return 0


def parse_npm_audit(data: Any) -> dict[str, int]:
    defaults = {"critical": 0, "high": 0, "moderate": 0, "low": 0, "info": 0}
    if not isinstance(data, dict):
        return defaults

    metadata = data.get("metadata", {})
    vulnerabilities = metadata.get("vulnerabilities", {})
    if not isinstance(vulnerabilities, dict):
        return defaults

    counts = defaults.copy()
    for key in counts:
        value = vulnerabilities.get(key, 0)
        try:
            counts[key] = int(value)
        except (TypeError, ValueError):
            counts[key] = 0
    return counts


def parse_semgrep(data: Any) -> dict[str, int]:
    counts = {"error": 0, "warning": 0, "info": 0}
    results = data.get("results", []) if isinstance(data, dict) else []
    for finding in results:
        extra = finding.get("extra", {}) if isinstance(finding, dict) else {}
        severity = str(extra.get("severity", finding.get("severity", ""))).upper()
        if severity == "ERROR":
            counts["error"] += 1
        elif severity == "WARNING":
            counts["warning"] += 1
        elif severity == "INFO":
            counts["info"] += 1
    return counts


def parse_iso_date(raw: str) -> date | None:
    try:
        return date.fromisoformat(raw)
    except ValueError:
        return None


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Evaluate compliance reports")
    parser.add_argument("--policy", required=True, type=Path)
    parser.add_argument("--reports-dir", required=True, type=Path)
    parser.add_argument("--summary-out", required=True, type=Path)
    parser.add_argument(
        "--waivers",
        type=Path,
        default=None,
        help="JSON file for documented temporary risk acceptances.",
    )
    parser.add_argument(
        "--require-all-reports",
        action="store_true",
        help="Fail if one of the core reports is missing.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()

    parse_errors: list[str] = []
    policy = load_json(args.policy, parse_errors)
    if not isinstance(policy, dict):
        parse_errors.append(f"{args.policy.name}: policy content must be a JSON object")
        policy = {}

    reports_dir = args.reports_dir

    report_files = {
        "detect_secrets": reports_dir / "detect-secrets.json",
        "bandit": reports_dir / "bandit.json",
        "pip_audit": reports_dir / "pip-audit.json",
        "npm_audit": reports_dir / "npm-audit.json",
        "semgrep": reports_dir / "semgrep.json",
    }

    missing_reports = [name for name, path in report_files.items() if not path.exists()]
    failures: list[str] = []

    metrics: dict[str, Any] = {
        "detect_secrets_total": 0,
        "bandit": {"low": 0, "medium": 0, "high": 0},
        "pip_audit_vulnerabilities": 0,
        "npm_audit": {"critical": 0, "high": 0, "moderate": 0, "low": 0, "info": 0},
        "semgrep": {"error": 0, "warning": 0, "info": 0},
    }

    if report_files["detect_secrets"].exists():
        metrics["detect_secrets_total"] = parse_detect_secrets(
            load_json(report_files["detect_secrets"], parse_errors)
        )

    if report_files["bandit"].exists():
        metrics["bandit"] = parse_bandit(
            load_json(report_files["bandit"], parse_errors)
        )

    if report_files["pip_audit"].exists():
        metrics["pip_audit_vulnerabilities"] = parse_pip_audit(
            load_json(report_files["pip_audit"], parse_errors)
        )

    if report_files["npm_audit"].exists():
        metrics["npm_audit"] = parse_npm_audit(
            load_json(report_files["npm_audit"], parse_errors)
        )

    if report_files["semgrep"].exists():
        metrics["semgrep"] = parse_semgrep(
            load_json(report_files["semgrep"], parse_errors)
        )

    checks = {
        "detect_secrets_total": {
            "value": metrics["detect_secrets_total"],
            "threshold": int(policy.get("max_detect_secrets", 0)),
        },
        "bandit_high": {
            "value": metrics["bandit"]["high"],
            "threshold": int(policy.get("max_bandit_high", 0)),
        },
        "bandit_medium": {
            "value": metrics["bandit"]["medium"],
            "threshold": int(policy.get("max_bandit_medium", 0)),
        },
        "pip_audit_vulnerabilities": {
            "value": metrics["pip_audit_vulnerabilities"],
            "threshold": int(policy.get("max_pip_audit_vulnerabilities", 0)),
        },
        "npm_high": {
            "value": metrics["npm_audit"]["high"],
            "threshold": int(policy.get("max_npm_high", 0)),
        },
        "npm_critical": {
            "value": metrics["npm_audit"]["critical"],
            "threshold": int(policy.get("max_npm_critical", 0)),
        },
        "semgrep_error": {
            "value": metrics["semgrep"]["error"],
            "threshold": int(policy.get("max_semgrep_error", 0)),
        },
    }

    waivers_data: dict[str, Any] = {"waivers": []}
    if args.waivers:
        if args.waivers.exists():
            loaded_waivers = load_json(args.waivers, parse_errors)
            if isinstance(loaded_waivers, dict):
                waivers_data = loaded_waivers
            else:
                parse_errors.append(
                    f"{args.waivers.name}: waivers content must be a JSON object"
                )
        else:
            parse_errors.append(f"{args.waivers.name}: file not found")

    raw_waivers = waivers_data.get("waivers", [])
    if not isinstance(raw_waivers, list):
        parse_errors.append("waivers: expected list")
        raw_waivers = []

    waiver_lookup: dict[str, dict[str, Any]] = {}
    expired_waivers: list[dict[str, Any]] = []
    for index, waiver in enumerate(raw_waivers):
        if not isinstance(waiver, dict):
            parse_errors.append(f"waivers[{index}]: expected object")
            continue

        metric = waiver.get("metric")
        expires_on = waiver.get("expires_on")
        max_allowed = waiver.get("max_allowed")
        owner = waiver.get("owner")
        ticket = waiver.get("ticket")
        justification = waiver.get("justification")

        if not isinstance(metric, str) or not metric:
            parse_errors.append(f"waivers[{index}].metric: required non-empty string")
            continue
        if not isinstance(expires_on, str):
            parse_errors.append(f"waivers[{index}].expires_on: required ISO date string")
            continue
        expiry = parse_iso_date(expires_on)
        if expiry is None:
            parse_errors.append(f"waivers[{index}].expires_on: invalid ISO date")
            continue
        if not isinstance(max_allowed, int):
            parse_errors.append(f"waivers[{index}].max_allowed: required integer")
            continue
        if not isinstance(owner, str) or not owner.strip():
            parse_errors.append(f"waivers[{index}].owner: required non-empty string")
            continue
        if not isinstance(ticket, str) or not ticket.strip():
            parse_errors.append(f"waivers[{index}].ticket: required non-empty string")
            continue
        if not isinstance(justification, str) or not justification.strip():
            parse_errors.append(
                f"waivers[{index}].justification: required non-empty string"
            )
            continue

        normalized = {
            "metric": metric,
            "expires_on": expires_on,
            "max_allowed": max_allowed,
            "owner": owner,
            "ticket": ticket,
            "justification": justification,
        }

        if expiry < date.today():
            expired_waivers.append(normalized)
            continue

        waiver_lookup[metric] = normalized

    waived_failures: list[dict[str, Any]] = []
    for check_name, check_info in checks.items():
        value = int(check_info["value"])
        threshold = int(check_info["threshold"])
        if value <= threshold:
            continue

        waiver = waiver_lookup.get(check_name)
        if waiver and value <= int(waiver["max_allowed"]):
            waived_failures.append(
                {
                    "metric": check_name,
                    "value": value,
                    "threshold": threshold,
                    "waiver": waiver,
                }
            )
            continue

        failures.append(f"{check_name}: value={value} threshold={threshold}")

    if args.require_all_reports and missing_reports:
        failures.append(
            "missing_reports: " + ", ".join(sorted(missing_reports))
        )

    if parse_errors:
        failures.append("parse_errors: " + " | ".join(parse_errors))

    summary = {
        "status": "failed" if failures else "passed",
        "metrics": metrics,
        "checks": checks,
        "policy": policy,
        "missing_reports": sorted(missing_reports),
        "parse_errors": parse_errors,
        "waived_failures": waived_failures,
        "expired_waivers": expired_waivers,
        "failures": failures,
    }

    args.summary_out.parent.mkdir(parents=True, exist_ok=True)
    with args.summary_out.open("w", encoding="utf-8") as handle:
        json.dump(summary, handle, indent=2, sort_keys=True)
        handle.write("\n")

    print("[compliance] status:", summary["status"])
    print("[compliance] missing_reports:", ", ".join(summary["missing_reports"]) or "none")
    if waived_failures:
        print("[compliance] waived failures:")
        for item in waived_failures:
            waiver = item["waiver"]
            print(
                "[compliance]   - "
                f"{item['metric']} value={item['value']} threshold={item['threshold']} "
                f"(waiver max={waiver['max_allowed']}, expires={waiver['expires_on']}, "
                f"owner={waiver['owner']}, ticket={waiver['ticket']})"
            )
    if expired_waivers:
        print("[compliance] expired waivers:")
        for waiver in expired_waivers:
            print(
                "[compliance]   - "
                f"{waiver['metric']} expired={waiver['expires_on']} "
                f"(owner={waiver['owner']}, ticket={waiver['ticket']})"
            )
    if failures:
        print("[compliance] failed checks:")
        for failure in failures:
            print(f"[compliance]   - {failure}")
        return 1

    print("[compliance] all policy checks passed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
