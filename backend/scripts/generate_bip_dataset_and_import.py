#!/usr/bin/env python3
"""
Generate a realistic consulting-company CSV for tenant BIP and import it through
the backend CSV import pipeline.
"""

import asyncio
import csv
import io
import random
import re
import sys
from collections import Counter
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Dict, List


ROOT = Path(__file__).resolve().parents[2]
BACKEND_DIR = ROOT / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from fastapi import BackgroundTasks, UploadFile  # noqa: E402

from app.db.storage import tenant_context, init_default_state  # noqa: E402
from app.server import import_csv, state, run_post_csv_snapshot_logic_background  # noqa: E402


TENANT_ID = "bip"
TENANT_DOMAIN = "bip.internal"
TARGET_USERS = 200
OUTPUT_CSV = BACKEND_DIR / "data" / "bip_consulting_users_200_autogen.csv"
RNG = random.Random(42)


REQUIRED_NAMES = [
    "Salvatore Apicella",
    "Stefano Maffei",
    "Gianluca Leone",
    "Micol Marani",
    "Santo Corrado",
    "Empio Simone",
    "Samuele Battistoni",
    "Antonio Ricci",
]


COMMON_GROUPS = [
    "INF_MAIL_READ",
    "INF_VPN_READ",
    "SYS_CONFLUENCE_READ",
    "SYS_JIRA_READ",
    "SYS_TIMESHEET_WRITE",
]


ROLE_CATALOG: List[Dict[str, object]] = [
    {
        "department": "Strategy & Transformation",
        "business_role": "Strategy Consultant",
        "groups": ["BIP_STRATEGY_CORE", "BIP_CLIENT_STEERCO", "SYS_POWERBI_READ", "SYS_SHAREPOINT_READ"],
        "lead_group": "BIP_STRATEGY_LEAD",
    },
    {
        "department": "ERP & SAP",
        "business_role": "SAP Consultant",
        "groups": ["BIP_SAP_CORE", "SYS_SAP_S4_READ", "SYS_SIGNAVIO_READ", "SYS_CONFLUENCE_WRITE"],
        "lead_group": "BIP_SAP_LEAD",
    },
    {
        "department": "Data & AI",
        "business_role": "Data Consultant",
        "groups": ["BIP_DATA_CORE", "SYS_SNOWFLAKE_READ", "SYS_DATABRICKS_READ", "SYS_POWERBI_WRITE"],
        "lead_group": "BIP_DATA_LEAD",
    },
    {
        "department": "Cybersecurity",
        "business_role": "Cybersecurity Consultant",
        "groups": ["BIP_CYBER_CORE", "SYS_SIEM_READ", "SYS_IAM_AUDIT", "SYS_VULN_MGMT_READ"],
        "lead_group": "BIP_CYBER_LEAD",
    },
    {
        "department": "Cloud & DevOps",
        "business_role": "Cloud Consultant",
        "groups": ["BIP_CLOUD_CORE", "SYS_AZURE_READ", "SYS_AWS_READ", "SYS_GITHUB_READ"],
        "lead_group": "BIP_CLOUD_LEAD",
    },
    {
        "department": "PMO & Governance",
        "business_role": "PMO Consultant",
        "groups": ["BIP_PMO_CORE", "SYS_JIRA_ADMIN", "SYS_MSPROJECT_READ", "SYS_SHAREPOINT_WRITE"],
        "lead_group": "BIP_PMO_LEAD",
    },
    {
        "department": "Finance Advisory",
        "business_role": "Finance Consultant",
        "groups": ["BIP_FINANCE_CORE", "SYS_ERP_FIN_READ", "SYS_POWERBI_READ", "SYS_CONFLUENCE_READ"],
        "lead_group": "BIP_FINANCE_LEAD",
    },
    {
        "department": "HR & Change",
        "business_role": "HR Change Consultant",
        "groups": ["BIP_HR_CORE", "SYS_WORKDAY_READ", "SYS_LMS_READ", "SYS_CONFLUENCE_WRITE"],
        "lead_group": "BIP_HR_LEAD",
    },
    {
        "department": "Application Modernization",
        "business_role": "App Modernization Consultant",
        "groups": ["BIP_APPMOD_CORE", "SYS_GITHUB_WRITE", "SYS_AZURE_DEVOPS_WRITE", "SYS_CONFLUENCE_READ"],
        "lead_group": "BIP_APPMOD_LEAD",
    },
    {
        "department": "Risk & Compliance",
        "business_role": "Risk Consultant",
        "groups": ["BIP_RISK_CORE", "SYS_GRC_READ", "SYS_AUDIT_PORTAL_READ", "SYS_POLICY_MGMT_READ"],
        "lead_group": "BIP_RISK_LEAD",
    },
]


FIRST_NAMES = [
    "Alessandro", "Marco", "Luca", "Matteo", "Davide", "Andrea", "Francesco", "Riccardo", "Giorgio", "Fabio",
    "Paolo", "Roberto", "Vincenzo", "Federico", "Emanuele", "Giovanni", "Cristian", "Daniele", "Claudio", "Simone",
    "Chiara", "Giulia", "Martina", "Valentina", "Francesca", "Ilaria", "Elena", "Sara", "Alessia", "Veronica",
    "Silvia", "Giorgia", "Laura", "Beatrice", "Anna", "Paola", "Marta", "Camilla", "Noemi", "Elisa",
]


LAST_NAMES = [
    "Rossi", "Bianchi", "Esposito", "Romano", "Gallo", "Costa", "Fontana", "Rinaldi", "Greco", "Conti",
    "Lombardi", "Barbieri", "Marino", "Colombo", "Longo", "Mancini", "Ferrari", "Martinelli", "Vitale", "Caruso",
    "Serra", "Palumbo", "Sanna", "Neri", "Ferrara", "De Luca", "Moretti", "Parisi", "Giordano", "Pellegrini",
]


def slug_username(display_name: str, used: set) -> str:
    base = re.sub(r"[^a-z0-9._-]", "", re.sub(r"\s+", ".", display_name.strip().lower()))
    if not base:
        base = "user"
    username = base
    i = 2
    while username in used:
        username = f"{base}{i}"
        i += 1
    used.add(username)
    return username


def iso_last_login() -> str:
    dt = datetime.now(timezone.utc) - timedelta(
        days=RNG.randint(0, 180),
        hours=RNG.randint(0, 23),
        minutes=RNG.randint(0, 59),
    )
    return dt.strftime("%Y-%m-%dT%H:%M:%SZ")


def choose_account_type(idx: int) -> str:
    if idx % 37 == 0:
        return "Administrative"
    if idx % 9 == 0:
        return "External"
    return "Internal"


def make_groups(role: Dict[str, object], idx: int) -> List[str]:
    groups = list(COMMON_GROUPS) + list(role["groups"])  # type: ignore[index]
    if idx % 11 == 0:
        groups.append("SYS_CLIENT_PORTAL_WRITE")
    if idx % 17 == 0:
        groups.append("INF_SECRETS_READ")
    if idx % 23 == 0:
        groups.append(str(role["lead_group"]))
    if idx % 41 == 0:
        groups.append("INF_IAM_ADMIN")
    return sorted(set(groups))


def build_rows() -> List[Dict[str, str]]:
    rows: List[Dict[str, str]] = []
    used_names = set()
    used_usernames = set()

    managers = REQUIRED_NAMES[:4]

    def add_person(display_name: str, idx: int) -> None:
        role = ROLE_CATALOG[idx % len(ROLE_CATALOG)]
        username = slug_username(display_name, used_usernames)
        groups = make_groups(role, idx)
        rows.append(
            {
                "DisplayName": display_name,
                "Username": username,
                "Department": str(role["department"]),
                "BusinessRole": str(role["business_role"]),
                "Roles": ",".join(groups),
                "AccountType": choose_account_type(idx),
                "LastLogin": iso_last_login(),
                "Email": f"{username}@{TENANT_DOMAIN}",
                "Manager": managers[idx % len(managers)],
            }
        )
        used_names.add(display_name.lower())

    for idx, name in enumerate(REQUIRED_NAMES):
        add_person(name, idx)

    idx = len(rows)
    for first in FIRST_NAMES:
        for last in LAST_NAMES:
            if len(rows) >= TARGET_USERS:
                break
            display_name = f"{first} {last}"
            if display_name.lower() in used_names:
                continue
            add_person(display_name, idx)
            idx += 1
        if len(rows) >= TARGET_USERS:
            break

    if len(rows) < TARGET_USERS:
        raise RuntimeError(f"Generated {len(rows)} users, expected {TARGET_USERS}")
    return rows


def write_csv(rows: List[Dict[str, str]], path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    headers = [
        "DisplayName",
        "Username",
        "Department",
        "BusinessRole",
        "Roles",
        "AccountType",
        "LastLogin",
        "Email",
        "Manager",
    ]
    with path.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=headers, delimiter=";")
        writer.writeheader()
        writer.writerows(rows)


async def import_into_tenant(tenant_id: str, csv_path: Path) -> Dict[str, object]:
    payload = csv_path.read_bytes()
    upload = UploadFile(filename=csv_path.name, file=io.BytesIO(payload))
    with tenant_context(tenant_id):
        # Fresh tenant baseline before loading synthetic customer data.
        state.clear()
        init_default_state(tenant_id)
        # Use BackgroundTasks container to keep endpoint behavior while avoiding
        # synchronous post-import heavy jobs in this utility run.
        bg = BackgroundTasks()
        result = await import_csv(file=upload, background_tasks=bg, username="admin")
    return result


def verify_import(tenant_id: str) -> Dict[str, object]:
    with tenant_context(tenant_id):
        users = (state.get("last_extract") or {}).get("users") or []
        by_br = Counter((u.get("businessRole") or "Unassigned") for u in users)
        names = {str(u.get("displayName") or "").strip() for u in users}
        missing = [n for n in REQUIRED_NAMES if n not in names]
        return {
            "tenant": tenant_id,
            "users": len(users),
            "business_roles": len(by_br),
            "missing_required_names": missing,
            "top_roles": by_br.most_common(8),
        }


def main() -> None:
    rows = build_rows()
    write_csv(rows, OUTPUT_CSV)
    
    tenants = [TENANT_ID]
    
    for tid in tenants:
        print(f"--- Importing into tenant: {tid} ---")
        import_result = asyncio.run(import_into_tenant(tid, OUTPUT_CSV))
        # Explicit save to ensure persistence in standalone process
        snapshot_ts = ""
        with tenant_context(tid):
            state.save()
            snapshot_ts = str((state.get("last_extract") or {}).get("ts") or "")
            print(f"Saved store for {tid} (snapshot_ts={snapshot_ts})")
        
        if tid == "bip":
            print(f"Triggering BIP re-calculation (post-snapshot logic)...")
            run_post_csv_snapshot_logic_background(
                snapshot_ts=snapshot_ts,
                actor="admin-autogen",
                touched_depts=[], # Full rebuild
                tenant_id=tid
            )
        
        verification = verify_import(tid)
        print(
            {
                "tenant": tid,
                "generated_rows": len(rows),
                "import_result": {k: v for k, v in import_result.items() if k != "details"},
                "verification": verification,
            }
        )


if __name__ == "__main__":
    main()
