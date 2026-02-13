import json
import random
from collections import Counter
from datetime import datetime, timedelta, timezone
from pathlib import Path

STORAGE_PATH = Path("/Users/salvo/Development/Role_Mining/backend/data/storage.json")
TOTAL_USERS = 2500
SEED = 42

FIRST_NAMES = [
    "Luca", "Marco", "Giulia", "Francesca", "Alessandro", "Marta", "Davide", "Elisa",
    "Paolo", "Chiara", "Andrea", "Sara", "Matteo", "Valentina", "Stefano", "Irene",
    "Giorgio", "Federica", "Simone", "Laura", "Antonio", "Silvia", "Roberto", "Anna",
]

LAST_NAMES = [
    "Rossi", "Bianchi", "Verdi", "Russo", "Ferrari", "Esposito", "Romano", "Colombo",
    "Ricci", "Marino", "Greco", "Bruno", "Gallo", "Conti", "De Luca", "Costa",
    "Giordano", "Mancini", "Rizzo", "Lombardi", "Moretti", "Barbieri", "Fontana", "Santoro",
]

DEPARTMENTS = [
    "Engineering",
    "Platform",
    "Security",
    "IT Operations",
    "Data & AI",
    "Product",
    "QA",
    "Customer Success",
    "Finance",
    "HR",
]

DEPT_BASE_GROUPS = {
    "Engineering": ["APP_GITLAB_DEV", "APP_JIRA_DEV", "APP_CONFLUENCE_RW"],
    "Platform": ["PLT_K8S_RW", "PLT_TERRAFORM_RW", "APP_GITHUB_ENTERPRISE"],
    "Security": ["SEC_SIEM_RW", "SEC_VAULT_RW", "SEC_AUDIT_READ"],
    "IT Operations": ["ITSM_SERVICE_DESK", "IT_ENDPOINT_MGMT", "IT_MONITORING_RW"],
    "Data & AI": ["DATA_LAKE_RW", "BI_POWERUSER", "ML_EXPERIMENTS_RW"],
    "Product": ["APP_JIRA_PRODUCT", "APP_CONFLUENCE_RW", "APP_FIGMA_RW"],
    "QA": ["APP_TESTRAIL_RW", "APP_JIRA_QA", "CI_CD_READ"],
    "Customer Success": ["CRM_SALESFORCE_RW", "SUPPORT_ZENDESK_RW", "APP_CONFLUENCE_RO"],
    "Finance": ["ERP_FINANCE_RW", "DWH_FINANCE_RO", "APP_CONFLUENCE_RO"],
    "HR": ["HRIS_WORKDAY_RW", "PAYROLL_CORE_RW", "APP_CONFLUENCE_RO"],
}

ROLE_OPTIONS = [
    "Junior Engineer",
    "Engineer",
    "Senior Engineer",
    "Lead Engineer",
    "Staff Engineer",
    "Manager",
    "Director",
    "Analyst",
    "Specialist",
]

ROLE_GROUPS = {
    "Junior Engineer": ["VPN_STANDARD", "CODE_READ", "CLOUD_DEV_READ"],
    "Engineer": ["VPN_STANDARD", "CODE_RW", "CLOUD_DEV_RW"],
    "Senior Engineer": ["VPN_STANDARD", "CODE_RW", "CLOUD_PROD_READ"],
    "Lead Engineer": ["VPN_STANDARD", "CODE_RW", "CLOUD_PROD_RW"],
    "Staff Engineer": ["VPN_STANDARD", "CODE_RW", "ARCH_DOCS_RW"],
    "Manager": ["VPN_STANDARD", "APP_JIRA_MGMT", "APP_CONFLUENCE_RW"],
    "Director": ["VPN_EXEC", "FIN_DASHBOARD_RO", "APP_CONFLUENCE_RW"],
    "Analyst": ["VPN_STANDARD", "BI_STANDARD", "DATA_EXPORT_RO"],
    "Specialist": ["VPN_STANDARD", "APP_DOMAIN_SPECIALIST", "APP_CONFLUENCE_RW"],
}

COMMON_GROUPS = ["ALL_EMPLOYEES", "SSO_MFA_ENFORCED", "EMAIL_O365", "VPN_STANDARD"]

ACCOUNT_TYPE_WEIGHTS = [
    ("Internal", 0.84),
    ("Technical", 0.09),
    ("Administrative", 0.03),
    ("External", 0.03),
    ("Service", 0.01),
]


def weighted_choice(options):
    r = random.random()
    cumulative = 0.0
    for value, weight in options:
        cumulative += weight
        if r <= cumulative:
            return value
    return options[-1][0]


def generate_last_login():
    # 30% stale (>365 days), 65% fresh (<=365 days), 5% never logged in.
    r = random.random()
    now = datetime.now(timezone.utc)
    if r < 0.05:
        return None
    if r < 0.35:
        days = random.randint(366, 1100)
    else:
        days = random.randint(0, 365)
    return (now - timedelta(days=days)).isoformat()


def generate_user(idx: int):
    first = random.choice(FIRST_NAMES)
    last = random.choice(LAST_NAMES)
    display_name = f"{first} {last}"

    department = random.choice(DEPARTMENTS)
    role = random.choice(ROLE_OPTIONS)
    account_type = weighted_choice(ACCOUNT_TYPE_WEIGHTS)
    username = f"{first.lower()}.{last.lower().replace(' ', '')}.{idx}"

    groups = set(COMMON_GROUPS)
    groups.update(DEPT_BASE_GROUPS[department])
    groups.update(ROLE_GROUPS[role])

    # Add realistic optional groups
    if department in {"Engineering", "Platform", "Data & AI"} and random.random() < 0.35:
        groups.add("ONCALL_PAGERDUTY")
    if department == "Security" and random.random() < 0.45:
        groups.add("SEC_INCIDENT_RESPONSE")
    if department in {"Finance", "HR"} and random.random() < 0.40:
        groups.add("REPORTING_SENSITIVE_RO")
    if random.random() < 0.20:
        groups.add("REMOTE_WORKERS")
    if account_type == "Administrative":
        groups.add("ADMIN_CONSOLE_ACCESS")
    if account_type == "External":
        groups.discard("CLOUD_PROD_RW")
        groups.add("EXTERNAL_LIMITED_ACCESS")
    if account_type == "Service":
        groups = {"ALL_EMPLOYEES", "SVC_AUTOMATION", "SVC_ROTATING_SECRET", "SVC_API_RW"}

    user = {
        "username": username,
        "displayName": display_name,
        "groups": sorted(groups),
        "department": department,
        "businessRole": role,
        "excluded": False,
        "lastLogin": generate_last_login(),
        "accountType": account_type,
    }
    return user


def build_ad_candidates(users):
    out = []
    for u in users:
        out.append(
            {
                "candidateId": f"ad:{u['username']}",
                "source": "ad",
                "displayName": u.get("displayName", ""),
                "businessRole": u.get("businessRole", ""),
                "roles": u.get("groups", []),
                "rawLine": f"AD:{u.get('username')}|{u.get('displayName')}|{','.join(u.get('groups') or [])}",
            }
        )
    return out


def main():
    random.seed(SEED)

    if not STORAGE_PATH.exists():
        raise FileNotFoundError(f"Storage non trovato: {STORAGE_PATH}")

    with STORAGE_PATH.open("r", encoding="utf-8") as f:
        state = json.load(f)

    users = [generate_user(i) for i in range(TOTAL_USERS)]
    all_groups = sorted({g for u in users for g in (u.get("groups") or [])})
    ad_candidates = build_ad_candidates(users)
    now_iso = datetime.now(timezone.utc).isoformat()

    state["last_extract"] = {
        "ou": "OU=Users,DC=enterpriseit,DC=local",
        "users": users,
        "groups": all_groups,
        "ts": now_iso,
        "source": "ad",
    }

    state["ingest_sources"] = state.get("ingest_sources", {})
    state["ingest_sources"]["ad"] = ad_candidates
    state["ingest_candidates"] = ad_candidates
    state["choice_by_displayName"] = state.get("choice_by_displayName", {})
    state["last_rejects"] = []
    state["last_ingest_stats"] = {
        "source": "ad",
        "rowsTotal": TOTAL_USERS,
        "rowsKept": TOTAL_USERS,
        "duplicateDisplayName": 0,
        "missingDepartment": 0,
        "missingBusinessRole": 0,
        "missingDisplayName": 0,
        "missingUsername": 0,
        "ts": now_iso,
    }
    state["mining_dirty"] = True

    # Keep role mapping coherent with generated users
    state["user_business_role"] = {u["username"]: u["businessRole"] for u in users}

    with STORAGE_PATH.open("w", encoding="utf-8") as f:
        json.dump(state, f, indent=2, ensure_ascii=False)

    stale = 0
    fresh = 0
    never = 0
    now = datetime.now(timezone.utc)
    for u in users:
        ll = u.get("lastLogin")
        if not ll:
            never += 1
            continue
        dt = datetime.fromisoformat(ll.replace("Z", "+00:00"))
        if (now - dt).days > 365:
            stale += 1
        else:
            fresh += 1

    dept_counts = Counter(u["department"] for u in users)
    acct_counts = Counter(u["accountType"] for u in users)

    print(f"Seed AD completato: {TOTAL_USERS} utenti")
    print(f"Gruppi unici: {len(all_groups)}")
    print(f"LastLogin fresh<=365d: {fresh}, stale>365d: {stale}, never: {never}")
    print("Top dipartimenti:", dict(dept_counts.most_common(5)))
    print("Account types:", dict(acct_counts))


if __name__ == "__main__":
    main()
