from typing import Any, Dict, List, Tuple
from collections import defaultdict


def duplicate_candidate_from_user_row(user: Dict[str, Any], display_name: str) -> Dict[str, Any]:
    return {
        "candidateId": f"user:{user.get('username')}",
        "source": "current",
        "displayName": display_name,
        "department": user.get("department"),
        "businessRole": user.get("businessRole"),
        "roles": user.get("groups") or [],
        "lastLogin": user.get("lastLogin"),
    }


def duplicate_resolution_items_from_users(users: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    by_display_name = defaultdict(list)
    for u in (users or []):
        dn = str(u.get("displayName") or u.get("display_name") or "").strip()
        if dn:
            by_display_name[dn].append(u)

    items: List[Dict[str, Any]] = []
    for dn, rows in by_display_name.items():
        if len(rows) <= 1:
            continue
        chosen = duplicate_candidate_from_user_row(rows[0], dn)
        alternatives = [duplicate_candidate_from_user_row(alt, dn) for alt in rows[1:]]
        items.append(
            {
                "displayName": dn,
                "chosenCandidateId": chosen["candidateId"],
                "autoChosenCandidateId": chosen["candidateId"],
                "chosen": chosen,
                "alternatives": alternatives,
                "count": len(rows),
                "autoReason": None,
            }
        )
    return items


def duplicate_extra_rows(duplicate_items: List[Dict[str, Any]]) -> int:
    return sum(max(0, int(x.get("count") or 0) - 1) for x in (duplicate_items or []))


def duplicate_reject_count(rejects: List[Dict[str, Any]]) -> int:
    return sum(
        1
        for r in (rejects or [])
        if "Duplicate displayName" in str((r or {}).get("reason") or "")
    )


def effective_duplicate_displayname_count(
    ingest: Dict[str, Any],
    duplicate_items: List[Dict[str, Any]],
    rejects: List[Dict[str, Any]],
) -> int:
    ingest_dup = int((ingest or {}).get("duplicateDisplayName") or 0)
    return max(ingest_dup, duplicate_extra_rows(duplicate_items), duplicate_reject_count(rejects))


def display_name_for_user(u: Dict[str, Any]) -> str:
    return str(u.get("displayName") or u.get("display_name") or u.get("username") or "").strip()


def users_missing_field(users: List[Dict[str, Any]], field_name: str) -> List[Dict[str, str]]:
    out: List[Dict[str, str]] = []
    for u in (users or []):
        if str(u.get(field_name) or "").strip():
            continue
        out.append({"username": str(u.get("username") or ""), "displayName": display_name_for_user(u)})
    return out


def dedupe_user_rows(rows: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    seen = set()
    for r in (rows or []):
        key = (str(r.get("username") or "").lower(), str(r.get("displayName") or "").lower())
        if key in seen:
            continue
        seen.add(key)
        out.append(r)
    return out


def allowed_identity_case_ids(connector_type: str, identity_cases_all: List[Dict[str, Any]]) -> set:
    if connector_type == "sap":
        return {
            "invalid_identity_keys",
            "identity_collisions",
            "businessrole_vocab_drift",
            "import_reject_rate",
        }
    if connector_type == "ad":
        return {
            "invalid_identity_keys",
            "identity_collisions",
            "invalid_lastlogon",
            "department_vocab_drift",
            "orphan_references",
            "inactive_source_mismatch",
            "import_reject_rate",
        }
    if connector_type == "csv":
        return {
            "invalid_identity_keys",
            "identity_collisions",
            "invalid_lastlogon",
            "department_vocab_drift",
            "businessrole_vocab_drift",
            "orphan_references",
            "inactive_source_mismatch",
            "import_reject_rate",
            "csv_peer_value_outlier",
            "csv_peer_missing_critical",
        }
    return {c.get("id") for c in identity_cases_all}


def build_cluster_quality_summary_cards(
    connector_type: str,
    stats: Dict[str, Any],
    identity_cases: List[Dict[str, Any]],
) -> Tuple[set, List[Dict[str, Any]]]:
    total_rows = {"id": "rows_total", "label": "Total Rows", "count": int(stats.get("rowsTotal") or 0)}
    duplicates = {
        "id": "duplicates",
        "label": "Duplicates",
        "count": int(stats.get("duplicateDisplayName") or 0),
        "sectionType": "Duplicates",
    }
    missing_department = {
        "id": "missing_department",
        "label": "Missing Department",
        "count": int(stats.get("missingDepartment") or 0),
        "sectionType": "Missing Department",
    }
    missing_business_role = {
        "id": "missing_business_role",
        "label": "Missing Business Role",
        "count": int(stats.get("missingBusinessRole") or 0),
        "sectionType": "Missing Business Role",
    }
    identity_integrity = {
        "id": "identity_integrity",
        "label": "Identity Integrity",
        "count": int(stats.get("identityIntegrityIssues") or 0),
        "sectionType": "Identity Integrity",
    }

    if connector_type == "sap":
        visible_types = {"Duplicates", "Missing Business Role", "Identity Integrity"}
        cards = [total_rows, duplicates, missing_business_role, identity_integrity]
        return visible_types, cards

    if connector_type == "ad":
        visible_types = {"Duplicates", "Missing Department", "Identity Integrity"}
        cards = [total_rows, duplicates, missing_department, identity_integrity]
        return visible_types, cards

    if connector_type == "csv":
        outlier_case = next((c for c in identity_cases if c.get("id") == "csv_peer_value_outlier"), {"count": 0})
        missing_case = next((c for c in identity_cases if c.get("id") == "csv_peer_missing_critical"), {"count": 0})
        visible_types = {"Duplicates", "Missing Department", "Missing Business Role", "Identity Integrity"}
        cards = [
            total_rows,
            duplicates,
            missing_department,
            missing_business_role,
            {
                "id": "csv_peer_value_outlier",
                "label": "Peer Dirty Values",
                "count": int(outlier_case.get("count") or 0),
                "sectionType": "Identity Integrity",
            },
            {
                "id": "csv_peer_missing_critical",
                "label": "Peer Critical Missing",
                "count": int(missing_case.get("count") or 0),
                "sectionType": "Identity Integrity",
            },
        ]
        return visible_types, cards

    visible_types = {"Duplicates", "Missing Department", "Missing Business Role", "Identity Integrity"}
    cards = [total_rows, duplicates, missing_department, missing_business_role, identity_integrity]
    return visible_types, cards

