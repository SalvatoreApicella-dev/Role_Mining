import json
import random
from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import List, Optional, Dict, Any

# -----------------------------------------------------------------------------
# Target constraints
# -----------------------------------------------------------------------------
TOTAL_USERS = 5000
DUPLICATE_USERS = 100
STALE_USERS = 200
ZERO_GROUP_USERS = 123
MISSING_DEPT_USERS = 100
ADMIN_USERS = 232
SERVICE_USERS = 252
TARGET_GROUPS = 200
TARGET_DEPARTMENTS = 40
SEED = 20260212

ROOT = Path("/Users/salvo/Development/Role_Mining")
STORAGE_PATH = ROOT / "backend" / "data" / "storage.json"
KB_PATH = ROOT / "backend" / "ml_data" / "knowledge_base.json"

FIRST_NAMES = [
    "Luca", "Marco", "Giulia", "Francesca", "Alessandro", "Marta", "Davide", "Elisa",
    "Paolo", "Chiara", "Andrea", "Sara", "Matteo", "Valentina", "Stefano", "Irene",
    "Giorgio", "Federica", "Simone", "Laura", "Antonio", "Silvia", "Roberto", "Anna",
]
LAST_NAMES = [
    "Rossi", "Bianchi", "Verdi", "Russo", "Ferrari", "Esposito", "Romano", "Colombo",
    "Ricci", "Marino", "Greco", "Bruno", "Gallo", "Conti", "Costa", "Giordano",
    "Mancini", "Rizzo", "Lombardi", "Moretti", "Barbieri", "Fontana", "Santoro", "Leone",
]

DEPARTMENTS = [
    "Engineering Backend", "Engineering Frontend", "Engineering Mobile", "Engineering QA",
    "Platform SRE", "Platform DevOps", "Cloud Infrastructure", "Network Operations",
    "Security SOC", "Security GRC", "Security IAM", "Data Engineering",
    "Data Science", "Analytics BI", "Product Management", "Product Design",
    "IT Helpdesk", "IT Operations", "Workplace IT", "PMO",
    "R&D AI", "R&D Innovation", "Support L1", "Support L2",
    "Customer Success Enterprise", "Customer Success SMB", "Sales Enterprise", "Sales SMB",
    "Marketing Digital", "Marketing Content", "Finance Controlling", "Finance AP",
    "Finance AR", "HR Talent", "HR Payroll", "Legal Compliance",
    "Procurement", "Executive Office", "Internal Audit", "Business Applications",
]

assert len(DEPARTMENTS) == TARGET_DEPARTMENTS

# 20 app domains + 20 infra domains, each with 5 levels = 200 groups
APP_DOMAINS = [
    "JIRA", "CONFLUENCE", "GITLAB", "GITHUB", "ARGOCD", "K8S", "AWS", "AZURE", "GCP", "SERVICENOW",
    "OKTA", "WORKDAY", "SAP", "SALESFORCE", "POWERBI", "SNOWFLAKE", "DATADOG", "SPLUNK", "ZENDESK", "JENKINS",
]
INF_DOMAINS = [
    "VPN", "BASTION", "DBAAS", "STORAGE", "SECRETS", "CI", "CD", "ARTIFACTORY", "BACKUP", "IAM",
    "NETWORK", "FIREWALL", "DNS", "MAIL", "FILESHARE", "EDR", "SIEM", "MDM", "ERP", "CRM",
]
LEVELS = ["VIEW", "READ", "WRITE", "ADMIN", "ALL"]

GROUPS = [f"SYS_{d}_{lvl}" for d in APP_DOMAINS for lvl in LEVELS] + [f"INF_{d}_{lvl}" for d in INF_DOMAINS for lvl in LEVELS]
assert len(GROUPS) == TARGET_GROUPS

ROLE_BY_DEPT = {
    "Engineering Backend": "Backend Engineer",
    "Engineering Frontend": "Frontend Engineer",
    "Engineering Mobile": "Mobile Engineer",
    "Engineering QA": "QA Engineer",
    "Platform SRE": "SRE Engineer",
    "Platform DevOps": "DevOps Engineer",
    "Cloud Infrastructure": "Cloud Engineer",
    "Network Operations": "Network Engineer",
    "Security SOC": "SOC Analyst",
    "Security GRC": "GRC Specialist",
    "Security IAM": "IAM Specialist",
    "Data Engineering": "Data Engineer",
    "Data Science": "Data Scientist",
    "Analytics BI": "BI Analyst",
    "Product Management": "Product Manager",
    "Product Design": "Product Designer",
    "IT Helpdesk": "IT Support",
    "IT Operations": "IT Ops Specialist",
    "Workplace IT": "Workplace Specialist",
    "PMO": "PMO Analyst",
    "R&D AI": "AI Researcher",
    "R&D Innovation": "Innovation Engineer",
    "Support L1": "Support Agent L1",
    "Support L2": "Support Agent L2",
    "Customer Success Enterprise": "CSM Enterprise",
    "Customer Success SMB": "CSM SMB",
    "Sales Enterprise": "Sales Executive",
    "Sales SMB": "Sales Representative",
    "Marketing Digital": "Digital Marketer",
    "Marketing Content": "Content Specialist",
    "Finance Controlling": "Controller",
    "Finance AP": "AP Specialist",
    "Finance AR": "AR Specialist",
    "HR Talent": "Talent Partner",
    "HR Payroll": "Payroll Specialist",
    "Legal Compliance": "Compliance Analyst",
    "Procurement": "Procurement Specialist",
    "Executive Office": "Executive Assistant",
    "Internal Audit": "Internal Auditor",
    "Business Applications": "Business Apps Analyst",
}

DEPT_PROFILE = {
    "Engineering Backend": ["JIRA", "CONFLUENCE", "GITLAB", "AWS", "K8S", "JENKINS"],
    "Engineering Frontend": ["JIRA", "CONFLUENCE", "GITHUB", "AWS", "JENKINS"],
    "Engineering Mobile": ["JIRA", "CONFLUENCE", "GITHUB", "AWS", "JENKINS"],
    "Engineering QA": ["JIRA", "CONFLUENCE", "JENKINS", "K8S"],
    "Platform SRE": ["K8S", "ARGOCD", "AWS", "AZURE", "GCP", "DATADOG", "SPLUNK"],
    "Platform DevOps": ["JENKINS", "ARGOCD", "K8S", "AWS", "AZURE", "GCP", "ARTIFACTORY", "CI", "CD"],
    "Cloud Infrastructure": ["AWS", "AZURE", "GCP", "K8S", "DATADOG", "SECRETS"],
    "Network Operations": ["NETWORK", "FIREWALL", "DNS", "VPN", "BASTION", "SIEM"],
    "Security SOC": ["SPLUNK", "SIEM", "EDR", "OKTA", "IAM", "FIREWALL"],
    "Security GRC": ["SPLUNK", "SIEM", "CONFLUENCE", "SERVICENOW"],
    "Security IAM": ["OKTA", "IAM", "SECRETS", "SERVICENOW"],
    "Data Engineering": ["SNOWFLAKE", "POWERBI", "AWS", "GCP", "DBAAS"],
    "Data Science": ["SNOWFLAKE", "POWERBI", "AWS", "GCP", "JIRA", "CONFLUENCE"],
    "Analytics BI": ["POWERBI", "SNOWFLAKE", "SAP"],
    "Product Management": ["JIRA", "CONFLUENCE", "POWERBI"],
    "Product Design": ["JIRA", "CONFLUENCE"],
    "IT Helpdesk": ["SERVICENOW", "MDM", "MAIL", "FILESHARE", "OKTA"],
    "IT Operations": ["SERVICENOW", "MDM", "EDR", "VPN", "FILESHARE", "MAIL"],
    "Workplace IT": ["MDM", "MAIL", "FILESHARE", "OKTA", "SERVICENOW"],
    "PMO": ["JIRA", "CONFLUENCE", "POWERBI"],
    "R&D AI": ["AWS", "GCP", "SNOWFLAKE", "JIRA", "CONFLUENCE"],
    "R&D Innovation": ["JIRA", "CONFLUENCE", "AWS", "AZURE"],
    "Support L1": ["ZENDESK", "SERVICENOW", "CONFLUENCE", "MAIL"],
    "Support L2": ["ZENDESK", "SERVICENOW", "SPLUNK", "CONFLUENCE"],
    "Customer Success Enterprise": ["SALESFORCE", "ZENDESK", "CONFLUENCE"],
    "Customer Success SMB": ["SALESFORCE", "ZENDESK"],
    "Sales Enterprise": ["SALESFORCE", "CRM", "POWERBI"],
    "Sales SMB": ["SALESFORCE", "CRM"],
    "Marketing Digital": ["SALESFORCE", "POWERBI", "CONFLUENCE"],
    "Marketing Content": ["CONFLUENCE", "JIRA"],
    "Finance Controlling": ["SAP", "ERP", "POWERBI", "FILESHARE"],
    "Finance AP": ["SAP", "ERP", "FILESHARE"],
    "Finance AR": ["SAP", "ERP", "FILESHARE"],
    "HR Talent": ["WORKDAY", "CONFLUENCE", "FILESHARE"],
    "HR Payroll": ["WORKDAY", "SAP", "FILESHARE"],
    "Legal Compliance": ["CONFLUENCE", "FILESHARE", "SERVICENOW"],
    "Procurement": ["SAP", "ERP", "SERVICENOW"],
    "Executive Office": ["POWERBI", "CONFLUENCE", "FILESHARE"],
    "Internal Audit": ["SPLUNK", "POWERBI", "SAP", "CONFLUENCE"],
    "Business Applications": ["SERVICENOW", "SAP", "SALESFORCE", "WORKDAY", "JIRA"],
}


def group_name(domain: str, level: str, prefix: str = "SYS") -> str:
    return f"{prefix}_{domain}_{level}"


def first_last(idx: int) -> tuple[str, str]:
    return FIRST_NAMES[idx % len(FIRST_NAMES)], LAST_NAMES[(idx * 7) % len(LAST_NAMES)]


def duplicate_display_name(pair_idx: int) -> str:
    first = FIRST_NAMES[pair_idx % len(FIRST_NAMES)]
    last = LAST_NAMES[(pair_idx * 3) % len(LAST_NAMES)]
    return f"{first} {last}"


def unique_display_name(idx: int) -> str:
    first, last = first_last(idx)
    return f"{first} {last}_{idx}"


def username_from_display(display_name: str, idx: int) -> str:
    base = display_name.lower().replace(" ", ".").replace("-", "")
    base = "".join(ch for ch in base if ch.isalnum() or ch == ".")
    return f"{base}.{idx}"


def pick_account_type(idx: int, admin_set: set[int], service_set: set[int]) -> str:
    if idx in service_set:
        return "Service"
    if idx in admin_set:
        return "Administrative"
    r = random.random()
    if r < 0.78:
        return "Internal"
    if r < 0.92:
        return "Technical"
    return "External"


def level_for_type(account_type: str, domain: str) -> str:
    # Least privilege defaults by type
    if account_type == "Service":
        return random.choice(["WRITE", "ADMIN"])
    if account_type == "Administrative":
        return random.choice(["ADMIN", "ALL"])
    if account_type == "External":
        return random.choice(["VIEW", "READ"])
    if domain in {"K8S", "AWS", "AZURE", "GCP", "SECRETS", "IAM", "FIREWALL"}:
        return random.choice(["READ", "WRITE"])
    return random.choice(["VIEW", "READ", "WRITE"])


def build_groups_for_user(idx: int, department: Optional[str], account_type: str, zero_group: bool) -> List[str]:
    if zero_group:
        return []

    base_dept = department or "Engineering Backend"
    domains = DEPT_PROFILE.get(base_dept, ["JIRA", "CONFLUENCE", "SERVICENOW"])

    groups = set()
    # Core access by department profile
    for d in domains[:6]:
        prefix = "INF" if d in INF_DOMAINS else "SYS"
        lvl = level_for_type(account_type, d)
        groups.add(group_name(d, lvl, prefix=prefix))

    # Common enterprise baselines
    groups.add("INF_VPN_READ")
    groups.add("INF_MAIL_READ")
    groups.add("SYS_CONFLUENCE_READ")

    # Type-specific constraints
    if account_type == "External":
        groups.discard("INF_FIREWALL_ADMIN")
        groups.discard("INF_IAM_ADMIN")
        groups.discard("SYS_SAP_ADMIN")
    elif account_type == "Administrative":
        groups.add("INF_IAM_ADMIN")
        groups.add("INF_SECRETS_ADMIN")
    elif account_type == "Service":
        groups.add("INF_CI_WRITE")
        groups.add("INF_CD_WRITE")

    # Occasional intentional redundancy to train redundancy detection
    if idx % 9 == 0 and "SYS_AWS_READ" in groups:
        groups.add("SYS_AWS_ALL")
    if idx % 11 == 0 and "SYS_JIRA_READ" in groups:
        groups.add("SYS_JIRA_ADMIN")
    if idx % 13 == 0 and "INF_VPN_READ" in groups:
        groups.add("INF_VPN_ALL")

    return sorted(groups)


def build_knowledge_base() -> Dict[str, Any]:
    redundancy_rules = {}
    for d in APP_DOMAINS:
        redundancy_rules[f"SYS_{d}_ALL"] = [f"SYS_{d}_ADMIN", f"SYS_{d}_WRITE", f"SYS_{d}_READ", f"SYS_{d}_VIEW"]
        redundancy_rules[f"SYS_{d}_ADMIN"] = [f"SYS_{d}_WRITE", f"SYS_{d}_READ", f"SYS_{d}_VIEW"]
        redundancy_rules[f"SYS_{d}_WRITE"] = [f"SYS_{d}_READ", f"SYS_{d}_VIEW"]
        redundancy_rules[f"SYS_{d}_READ"] = [f"SYS_{d}_VIEW"]
    for d in INF_DOMAINS:
        redundancy_rules[f"INF_{d}_ALL"] = [f"INF_{d}_ADMIN", f"INF_{d}_WRITE", f"INF_{d}_READ", f"INF_{d}_VIEW"]
        redundancy_rules[f"INF_{d}_ADMIN"] = [f"INF_{d}_WRITE", f"INF_{d}_READ", f"INF_{d}_VIEW"]
        redundancy_rules[f"INF_{d}_WRITE"] = [f"INF_{d}_READ", f"INF_{d}_VIEW"]
        redundancy_rules[f"INF_{d}_READ"] = [f"INF_{d}_VIEW"]

    hierarchy_patterns = [
        {"root": "_ALL", "supersedes": ["_ADMIN", "_WRITE", "_READ", "_VIEW"]},
        {"root": "_ADMIN", "supersedes": ["_WRITE", "_READ", "_VIEW"]},
        {"root": "_WRITE", "supersedes": ["_READ", "_VIEW"]},
        {"root": "_READ", "supersedes": ["_VIEW"]},
    ]

    account_type_policies = {
        "External": ["_ADMIN", "_ALL", "SECRETS", "FIREWALL", "IAM"],
        "Service": ["WORKDAY", "PAYROLL", "HR", "EXECUTIVE"],
        "BlueCollar": ["_ADMIN", "_ALL", "K8S", "AWS", "AZURE", "GCP"],
        "Contractor": ["PAYROLL", "HR", "SECRETS", "IAM"],
    }

    role_definitions = {
        "Backend Engineer": ["SYS_GITLAB_WRITE", "SYS_JIRA_WRITE", "SYS_AWS_WRITE", "SYS_K8S_READ"],
        "Frontend Engineer": ["SYS_GITHUB_WRITE", "SYS_JIRA_WRITE", "SYS_CONFLUENCE_WRITE"],
        "SRE Engineer": ["SYS_K8S_ADMIN", "SYS_AWS_ADMIN", "SYS_DATADOG_ADMIN", "SYS_SPLUNK_READ"],
        "DevOps Engineer": ["SYS_JENKINS_ADMIN", "SYS_ARGOCD_ADMIN", "INF_CI_WRITE", "INF_CD_WRITE"],
        "SOC Analyst": ["SYS_SPLUNK_WRITE", "INF_SIEM_WRITE", "INF_EDR_READ", "INF_FIREWALL_READ"],
        "Data Engineer": ["SYS_SNOWFLAKE_WRITE", "SYS_AWS_WRITE", "INF_DBAAS_WRITE", "SYS_POWERBI_READ"],
        "Data Scientist": ["SYS_SNOWFLAKE_READ", "SYS_POWERBI_WRITE", "SYS_AWS_READ"],
        "IT Support": ["SYS_SERVICENOW_WRITE", "INF_MDM_WRITE", "INF_MAIL_READ", "INF_FILESHARE_READ"],
        "Controller": ["SYS_SAP_WRITE", "INF_ERP_WRITE", "SYS_POWERBI_READ"],
        "Payroll Specialist": ["SYS_WORKDAY_WRITE", "SYS_SAP_READ", "INF_FILESHARE_READ"],
        "Administrator": ["INF_IAM_ADMIN", "INF_SECRETS_ADMIN", "SYS_OKTA_ADMIN"],
        "Service Account": ["INF_CI_WRITE", "INF_CD_WRITE", "INF_SECRETS_ADMIN"],
    }

    # department_norms are token-based hints used by smart detector
    department_norms = {
        "Engineering": ["GIT", "JIRA", "CONFLUENCE", "AWS", "K8S", "JENKINS"],
        "Platform": ["K8S", "ARGOCD", "AWS", "AZURE", "GCP", "DATADOG", "SPLUNK"],
        "Security": ["SPLUNK", "SIEM", "EDR", "FIREWALL", "IAM", "OKTA"],
        "Data": ["SNOWFLAKE", "POWERBI", "DBAAS", "AWS", "GCP"],
        "IT": ["SERVICENOW", "MDM", "MAIL", "FILESHARE", "OKTA"],
        "Finance": ["SAP", "ERP", "POWERBI", "FILESHARE"],
        "HR": ["WORKDAY", "FILESHARE", "CONFLUENCE"],
        "Sales": ["SALESFORCE", "CRM", "POWERBI"],
        "Customer Success": ["ZENDESK", "SALESFORCE", "CONFLUENCE"],
        "Support": ["ZENDESK", "SERVICENOW", "SPLUNK"],
    }

    return {
        "metadata": {
            "version": "2.0-enterprise-it",
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "description": "Enterprise IT knowledge base for redundancy and least-privilege detection",
            "source": "Synthetic AD-like enterprise dataset",
        },
        "redundancy_rules": redundancy_rules,
        "hierarchy_patterns": hierarchy_patterns,
        "account_type_policies": account_type_policies,
        "role_definitions": role_definitions,
        "department_norms": department_norms,
    }


def build_ad_candidates(users: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    out = []
    for u in users:
        out.append(
            {
                "candidateId": f"ad:{u['username']}",
                "source": "ad",
                "displayName": u["displayName"],
                "businessRole": u["businessRole"],
                "roles": u["groups"],
                "rawLine": f"AD:{u['username']}|{u['displayName']}|{','.join(u['groups'])}",
            }
        )
    return out


def main():
    random.seed(SEED)
    if not STORAGE_PATH.exists():
        raise FileNotFoundError(f"Storage non trovato: {STORAGE_PATH}")

    # Build disjoint cohorts
    idx_all = list(range(TOTAL_USERS))
    dup_set = set(idx_all[0:DUPLICATE_USERS])
    stale_start = DUPLICATE_USERS
    stale_set = set(idx_all[stale_start:stale_start + STALE_USERS])
    zero_start = stale_start + STALE_USERS
    zero_set = set(idx_all[zero_start:zero_start + ZERO_GROUP_USERS])
    miss_start = zero_start + ZERO_GROUP_USERS
    miss_set = set(idx_all[miss_start:miss_start + MISSING_DEPT_USERS])
    admin_start = miss_start + MISSING_DEPT_USERS
    admin_set = set(idx_all[admin_start:admin_start + ADMIN_USERS])
    service_start = admin_start + ADMIN_USERS
    service_set = set(idx_all[service_start:service_start + SERVICE_USERS])

    users = []
    for idx in idx_all:
        if idx in dup_set:
            dn = duplicate_display_name(idx // 2)
        else:
            dn = unique_display_name(idx)

        department = None if idx in miss_set else DEPARTMENTS[idx % len(DEPARTMENTS)]
        account_type = pick_account_type(idx, admin_set, service_set)
        role = "Administrator" if account_type == "Administrative" else "Service Account" if account_type == "Service" else ROLE_BY_DEPT.get(department or "Engineering Backend", "Engineer")
        groups = build_groups_for_user(idx, department, account_type, idx in zero_set)

        now = datetime.now(timezone.utc)
        if idx in stale_set:
            last_login = (now - timedelta(days=random.randint(366, 900))).isoformat()
        else:
            last_login = (now - timedelta(days=random.randint(1, 240))).isoformat()

        users.append(
            {
                "username": username_from_display(dn, idx),
                "displayName": dn,
                "groups": groups,
                "department": department,
                "businessRole": role,
                "excluded": False,
                "lastLogin": last_login,
                "accountType": account_type,
            }
        )

    # Ensure all 200 groups are present at least once (excluding zero-group users)
    group_holders = [u for u in users if u["groups"]]
    present = {g for u in group_holders for g in u["groups"]}
    missing_groups = [g for g in GROUPS if g not in present]
    for i, g in enumerate(missing_groups):
        holder = group_holders[i % len(group_holders)]
        holder["groups"] = sorted(set(holder["groups"]) | {g})

    all_groups = sorted({g for u in users for g in u["groups"]})
    ad_candidates = build_ad_candidates(users)
    now_iso = datetime.now(timezone.utc).isoformat()

    with STORAGE_PATH.open("r", encoding="utf-8") as f:
        state = json.load(f)

    # Persist AD-like dataset
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
    state["choice_by_displayName"] = {}
    state["last_rejects"] = []
    state["last_ingest_stats"] = {
        "source": "ad",
        "rowsTotal": TOTAL_USERS,
        "rowsKept": TOTAL_USERS,
        "duplicateDisplayName": DUPLICATE_USERS,
        "missingDepartment": MISSING_DEPT_USERS,
        "missingBusinessRole": 0,
        "missingDisplayName": 0,
        "missingUsername": 0,
        "ts": now_iso,
    }
    state["user_business_role"] = {u["username"]: u["businessRole"] for u in users}
    state["mining_dirty"] = True
    state["mining_processing"] = False
    state["mining_status"] = "idle"

    with STORAGE_PATH.open("w", encoding="utf-8") as f:
        json.dump(state, f, indent=2, ensure_ascii=False)

    # Train "internal intelligence" artifacts: knowledge base + BRDB + classifier + matrix/kpi
    kb = build_knowledge_base()
    with KB_PATH.open("w", encoding="utf-8") as f:
        json.dump(kb, f, indent=2, ensure_ascii=False)

    # Import backend runtime and trigger internal learning/recalculation synchronously
    import main as backend_main  # noqa

    backend_main.state["last_extract"] = {
        "ou": "OU=Users,DC=enterpriseit,DC=local",
        "users": users,
        "groups": all_groups,
        "ts": now_iso,
        "source": "ad",
    }
    backend_main.state["mining_dirty"] = True
    backend_main.state["mining_processing"] = False
    backend_main.state["mining_status"] = "idle"

    # BRDB rebuild from current AD-like assignments
    backend_main.brdb_rebuild()
    backend_main.state["brdb_calculated"] = True
    backend_main.state["brdb_min_confidence"] = backend_main.BRDB_MIN_CONF
    backend_main.state["brdb_last_update"] = datetime.now(timezone.utc).isoformat()

    # Train account classifier from generated labels
    training_data = []
    for u in users:
        training_data.append(
            {
                "display_name": u.get("displayName", ""),
                "ou": u.get("department") or "",
                "employee_type": u.get("accountType") or "",
                "account_type": u.get("accountType") or "Internal",
            }
        )
    ml_res = backend_main.ml_engine.train_classifier(training_data, force=True)

    # Recalculate matrix + KPI synchronously
    res = backend_main.run_role_mining(backend_main.active_users(users), n_clusters=8, role_support=0.6)
    display_names = {u["username"]: u["displayName"] for u in users if u.get("username")}
    backend_main.state.update(
        {
            "last_mining": {
                "clusters": res.get("clusters", []),
                "matrix": res.get("matrix", {}),
                "kpi": res.get("kpi", {}),
                "groups": res.get("groups", []),
                "displayNames": display_names,
                "ts": datetime.now(timezone.utc).isoformat(),
                "status": "ready",
            },
            "mining_dirty": False,
            "mining_processing": False,
            "mining_status": "ready",
        }
    )

    # Optional: precompute AI detection snapshot with new KB
    backend_main.state["last_ai_detection"] = backend_main.run_smart_ai_detection(
        backend_main.active_users(users),
        res.get("matrix", {}),
    )

    # Final verification report
    name_counts = Counter(u["displayName"] for u in users)
    dup_users = sum(1 for u in users if name_counts[u["displayName"]] > 1)
    stale = 0
    now = datetime.now(timezone.utc)
    for u in users:
        dt = datetime.fromisoformat(str(u["lastLogin"]).replace("Z", "+00:00"))
        if (now - dt).days > 365:
            stale += 1
    zero_groups = sum(1 for u in users if len(u.get("groups") or []) == 0)
    missing_dept = sum(1 for u in users if not (u.get("department") or "").strip())
    admin = sum(1 for u in users if u.get("accountType") == "Administrative")
    service = sum(1 for u in users if u.get("accountType") == "Service")
    dept_count = len({u.get("department") for u in users if (u.get("department") or "").strip()})

    print(f"users={len(users)}")
    print(f"dup_users={dup_users} stale={stale} zero_groups={zero_groups} missing_dept={missing_dept}")
    print(f"admin={admin} service={service}")
    print(f"unique_departments={dept_count} unique_groups={len(all_groups)}")
    print(f"kb_rules={len(kb['redundancy_rules'])} kb_hierarchy={len(kb['hierarchy_patterns'])}")
    print(f"ml_train_success={ml_res.get('success')} samples={ml_res.get('samples')}")
    print(f"matrix_users={len((res.get('matrix') or {}))} clusters={len((res.get('clusters') or []))}")
    print(f"kpi_totalUsers={res.get('kpi', {}).get('totalUsers')} modelQuality={res.get('kpi', {}).get('modelQuality')}")


if __name__ == "__main__":
    main()
