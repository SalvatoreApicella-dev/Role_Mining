import os
import time
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple

import jwt
import numpy as np
from fastapi import Depends, FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field
from sklearn.cluster import AgglomerativeClustering
from fastapi import UploadFile, File

import csv, io, re
try:
    from ldap3 import ALL, NTLM, SIMPLE, Connection, Server
except Exception:
    Connection = None  # type: ignore


APP_TITLE = "Role Mining API"
JWT_SECRET = os.getenv("JWT_SECRET", "dev-secret")
JWT_EXPIRE_MINUTES = int(os.getenv("JWT_EXPIRE_MINUTES", "240"))
MOCK_AD = os.getenv("MOCK_AD", "1") == "1"


from openpyxl import load_workbook
from collections import defaultdict

import re
from collections import defaultdict
from fastapi import HTTPException



# Cache dell’ultima esecuzione (serve per drilldown)

BROAD_MARKERS = {"all", "tutti", "tutte", "full", "global", "everyone", "any"}

def _tokens(s: str) -> list[str]:
    s = (s or "").lower()
    s = re.sub(r"[^a-z0-9]+", " ", s)
    return [t for t in s.split() if t]

def _family_key(role_name: str) -> str:
    toks = _tokens(role_name)
    return toks[0] if toks else ""

def _is_broad(role_name: str) -> bool:
    toks = set(_tokens(role_name))
    return any(m in toks for m in BROAD_MARKERS)

def _matrix_user_roles(matrix: dict, username: str) -> set[str]:
    row = (matrix or {}).get(username) or {}
    return {r for r, v in row.items() if int(v) == 1}

def build_overprivileged_items(matrix: dict, top_pct: float = 10.0) -> dict:
    users = state.get("last_extract", {}).get("users") or []
    br_by_user = {u.get("username"): u.get("businessRole", "Unassigned") for u in users if u.get("username")}
    role_meta = state.get("role_meta", {}) or {}

    items = []
    for uname, row in (matrix or {}).items():
        actual = sorted([r for r, v in (row or {}).items() if int(v) == 1])

        br = br_by_user.get(uname, "Unassigned")
        expected = set((role_meta.get(br, {}) or {}).get("groups", []) or [])

        excess = sorted(set(actual) - expected)
        if not excess:
            continue  # SOLO over

        items.append({
        "username": uname,
        "groups": actual,          # tutti
        "overGroups": excess,      # solo eccesso
        "groupCount": len(excess), # numero eccessid
        
        "isOverprivileged": True,
        })
    items.sort(key=lambda r: r["groupCount"], reverse=True)
    return {"threshold": 1, "items": items}

import random

def generate_unique_color(existing_colors):
    """Genera un colore RRGGBB univoco rispetto a quelli esistenti"""
    existing = set(existing_colors)
    attempts = 0
    while attempts < 100:
        r = random.randint(80, 255)   # evita colori troppo scuri
        g = random.randint(80, 255)
        b = random.randint(80, 255)
        color = f"{r:02x}{g:02x}{b:02x}".upper()
        if color not in existing:
            return color
        attempts += 1
    return "6AA6FF"  # fallback

# Lista colori predefiniti (per i primi 12 ruoli)
PREDEFINED_COLORS = [
    "00B4FF", "FF9F1C", "71FFB2", "FF6B6B", "9B59B6", "3498DB",
    "F39C12", "1ABC9C", "E74C3C", "9B59B6", "3498DB", "F1C40F"
]

def build_ai_detection_items(matrix: dict) -> list[dict]:
    items = []
    for uname, row in (matrix or {}).items():
        roles = [r for r, v in (row or {}).items() if int(v) == 1]

        fam = defaultdict(list)
        for r in roles:
            k = _family_key(r)
            if k:
                fam[k].append(r)

        for family, rs in fam.items():
            broad = [r for r in rs if _is_broad(r)]
            specific = [r for r in rs if not _is_broad(r)]
            if broad and specific:
                items.append({
                    "username": uname,
                    "family": family,
                    "redundantRoles": sorted(broad),
                    "keptRoles": sorted(specific),
                    "redundantCount": len(broad),
                })

    items.sort(key=lambda x: x["redundantCount"], reverse=True)
    return items

def build_cluster_quality_items(clusters: list, matrix: dict) -> list[dict]:
    """
    Drilldown “Cluster Quality”: ordina gli elementi che peggiorano la qualità del cluster.
    Assunzione minima: ogni cluster ha 'users' (lista username) e 'roleGroups' (lista gruppi del cluster).
    """
    out = []
    for c_idx, c in enumerate(clusters or []):
        users = c.get("users") or c.get("members") or []
        role_groups = set(c.get("roleGroups") or [])
        if not users or not role_groups:
            continue

        user_items = []
        for u in users:
            u_roles = _matrix_user_roles(matrix, u)
            missing = sorted(list(role_groups - u_roles))
            extra = sorted(list(u_roles - role_groups))
            denom = max(1, len(role_groups) + len(u_roles))
            distance = round((len(missing) + len(extra)) / denom, 4)  # più alto = più “sporco”

            user_items.append({
                "username": u,
                "distance": distance,
                "missingFromRole": missing,
                "extraVsRole": extra,
            })

        user_items.sort(key=lambda r: r["distance"], reverse=True)
        avg_distance = round(sum(x["distance"] for x in user_items) / max(1, len(user_items)), 4)

        out.append({
            "clusterIndex": c_idx,
            "clusterName": c.get("name") or f"Cluster {c_idx}",
            "avgDistance": avg_distance,
            "worstUsers": user_items[:50],  # top 50 driver
        })

    out.sort(key=lambda r: r["avgDistance"], reverse=True)
    return out




# ----------------------------
# In-memory "DB"
# ----------------------------




state: Dict[str, Any] = {
    "connector": {
        "server": "mock",
        "bind_user": "",
        "bind_password": "",
        "base_dn": "",
        "auth": "SIMPLE",  # SIMPLE | NTLM
    },
    "last_extract": {
        "ou": "",
        "users": [],   # [{username, displayName, groups:[...]}]
        "groups": [],  # list of unique groups
        "ts": None,
    },
    "last_mining": {
        "clusters": [],  # [{clusterId, members:[usernames], roleGroups:[...], purity}]
        "matrix": {},    # {username: {group:0/1}}
        "kpi": {},
        "ts": None,
    },
    "logs": [],  # [{ts, level, message}]
    
}

state.setdefault("last_rolemining_result", None)
state.setdefault("ingest_sources", {})          # es: {"ad":[...], "csv":[...], "xlsx":[...]}
state.setdefault("ingest_candidates", [])       # flatten di ingest_sources
state.setdefault("choice_by_displayName", {})   # displayName -> candidateId scelto
state.setdefault("mining_dirty", True)
state.setdefault("last_mining_params", {"n_clusters": None, "role_support": 0.6})

# ----------------------------
# Internal DB: auto-mapping Group -> BusinessRole
# ----------------------------
state.setdefault("brdb_group_stats", {})   # group -> {BR: count}
state.setdefault("brdb_token_stats", {})   # token -> {BR: count}
state.setdefault("brdb_cache", {})         # group -> {role, confidence, evidence, ts}
state.setdefault("brdb_ready", False)      # flag rebuild


# --- Business Roles (in-memory) ---
state["user_business_role"] = {
    "alice": "IT",
    "bob": "IT",
    "carol": "IT",
    "dave": "IT",
    "erin": "HR",
    "frank": "HR",
}

def apply_business_roles(users: List[Dict[str, Any]]) -> None:
    """Add businessRole field to each user based on state mapping."""
    m = state.get("user_business_role", {})
    for u in users:
        u["businessRole"] = m.get(u["username"], "Unassigned")
        # =============================================================================
# BRDB (NO AI): learning DB + inference engine
# =============================================================================
from collections import defaultdict
from datetime import datetime, timezone
import re
from typing import Dict, Any, List, Tuple

BRDB_MIN_CONF = 0.70  # soglia per auto-assegnare

BRDB_STOP_TOKENS = {
    "grp", "group", "role", "access", "users", "user", "team", "dl",
    "sec", "security", "global", "all", "everyone"
}

def brdb_norm_group(g: str) -> str:
    return (g or "").strip()

def brdb_tokens(g: str) -> List[str]:
    s = (g or "").lower()
    s = re.sub(r"[^a-z0-9]+", " ", s)
    toks = [t for t in s.split() if len(t) >= 2 and t not in BRDB_STOP_TOKENS]
    return toks[:20]

def brdb_inc_stat(stats: Dict[str, Dict[str, int]], key: str, br: str, inc: int) -> None:
    if not key or not br:
        return
    stats.setdefault(key, {})
    stats[key][br] = int(stats[key].get(br, 0)) + int(inc)

def brdb_rebuild() -> None:
    """
    Ricostruisce il DB interno usando:
    - user_business_role + last_extract.users(groups)
    - role_meta (template BR->groups) con peso maggiore
    """
    state.setdefault("brdb_group_stats", {})
    state.setdefault("brdb_token_stats", {})
    state.setdefault("brdb_cache", {})

    group_stats: Dict[str, Dict[str, int]] = {}
    token_stats: Dict[str, Dict[str, int]] = {}

    # 1) training da utenti assegnati
    user_br = state.get("user_business_role", {}) or {}
    users = (state.get("last_extract") or {}).get("users") or []
    for u in users:
        uname = u.get("username")
        br = (user_br.get(uname) or u.get("businessRole") or "").strip()
        if not br:
            continue
        for g in (u.get("groups") or []):
            g0 = brdb_norm_group(g)
            brdb_inc_stat(group_stats, g0, br, 1)
            for t in brdb_tokens(g0):
                brdb_inc_stat(token_stats, t, br, 1)

    # 2) training forte da template role_meta
    role_meta = state.get("role_meta") or {}
    for br, meta in role_meta.items():
        br = (br or "").strip()
        for g in (meta.get("groups") or []):
            g0 = brdb_norm_group(g)
            brdb_inc_stat(group_stats, g0, br, 4)     # peso alto
            for t in brdb_tokens(g0):
                brdb_inc_stat(token_stats, t, br, 2)

    state["brdb_group_stats"] = group_stats
    state["brdb_token_stats"] = token_stats
    state["brdb_cache"] = {}
    state["brdb_ready"] = True

def brdb_ensure_ready() -> None:
    if not state.get("brdb_ready"):
        brdb_rebuild()

def brdb_infer_group(group: str) -> Dict[str, Any]:
    """
    Predice BR per un singolo gruppo.
    """
    brdb_ensure_ready()

    g0 = brdb_norm_group(group)
    if not g0:
        return {"role": "Unassigned", "confidence": 0.0, "evidence": {"reason": "empty_group"}}

    cache = state.get("brdb_cache") or {}
    if g0 in cache:
        return cache[g0]

    group_stats = (state.get("brdb_group_stats") or {}).get(g0) or {}
    token_stats = state.get("brdb_token_stats") or {}

    scores = defaultdict(float)

    # segnale forte: gruppo già visto
    tot_g = sum(group_stats.values())
    if tot_g:
        for br, c in group_stats.items():
            scores[br] += 2.5 * (c / tot_g)

    # segnale debole: token del nome
    toks = brdb_tokens(g0)
    for t in toks:
        ts = token_stats.get(t) or {}
        tot_t = sum(ts.values())
        if not tot_t:
            continue
        for br, c in ts.items():
            scores[br] += 1.0 * (c / tot_t)

    if not scores:
        out = {"role": "Unassigned", "confidence": 0.0, "evidence": {"reason": "no_stats"}}
        state["brdb_cache"][g0] = out
        return out

    best_role, best_score = max(scores.items(), key=lambda x: x[1])
    sum_scores = sum(scores.values()) or 1.0
    conf = float(best_score / sum_scores)

    out = {
        "role": best_role,
        "confidence": round(conf, 3),
        "evidence": {
            "scoresTop": sorted(scores.items(), key=lambda x: x[1], reverse=True)[:5],
            "groupSeen": group_stats,
            "tokens": toks,
        },
        "ts": datetime.now(timezone.utc).isoformat(),
    }
    state["brdb_cache"][g0] = out
    return out

def brdb_infer_groupset(groups: List[str]) -> Dict[str, Any]:
    """
    Predice BR per un insieme di gruppi (utente/riga CSV) aggregando le predizioni per gruppo.
    """
    groups = [brdb_norm_group(g) for g in (groups or []) if brdb_norm_group(g)]
    if not groups:
        return {"role": "Unassigned", "confidence": 0.0, "evidence": {"reason": "no_groups"}}

    weights = defaultdict(float)
    details = []
    for g in groups[:50]:
        s = brdb_infer_group(g)
        details.append({"group": g, **s})
        weights[s["role"]] += float(s.get("confidence", 0.0) or 0.0)

    best_role, best_w = max(weights.items(), key=lambda x: x[1])
    total = sum(weights.values()) or 1.0
    conf = float(best_w / total)

    return {
        "role": best_role,
        "confidence": round(conf, 3),
        "evidence": {"weights": dict(weights), "details": details[:25]},
    }

def brdb_learn_assignment(br: str, groups: List[str], weight: int = 5) -> None:
    """
    Aggiorna incrementale il DB interno quando hai una assegnazione 'vera' (CSV con BR o assegnazione manuale).
    """
    brdb_ensure_ready()

    br = (br or "").strip()
    if not br:
        return
    for g in (groups or []):
        g0 = brdb_norm_group(g)
        brdb_inc_stat(state["brdb_group_stats"], g0, br, weight)
        for t in brdb_tokens(g0):
            brdb_inc_stat(state["brdb_token_stats"], t, br, max(1, weight // 2))

    # invalida cache
    state["brdb_cache"] = {}


def _mk_candidate(*, source: str, candidate_id: str, display_name: str, business_role: str, roles: list[str], raw: str) -> dict:
    return {
        "candidateId": candidate_id,
        "source": source,
        "displayName": (display_name or "").strip(),
        "businessRole": (business_role or "").strip(),
        "roles": roles or [],
        "rawLine": raw or "",
    }

def rebuild_ingest_candidates() -> None:
    src = state.get("ingest_sources") or {}
    flat = []
    for _, items in src.items():
        flat.extend(items or [])
    state["ingest_candidates"] = flat

def apply_duplicate_displayname_resolution() -> None:
    """
    Applica la scelta: per ogni displayName duplicato, rende 'attivo' solo il candidato scelto.
    Effetto pratico: marca excluded=True sugli utenti non scelti (così spariscono da role mining e lista utenti).
    """
    choice = state.get("choice_by_displayName") or {}
    candidates = state.get("ingest_candidates") or []

    # build: displayName -> [candidate]
    by_dn = defaultdict(list)
    for c in candidates:
        dn = (c.get("displayName") or "").strip()
        if dn:
            by_dn[dn].append(c)

    # indicizza utenti attuali per displayName
    users = state.get("last_extract", {}).get("users") or []
    users_by_dn = defaultdict(list)
    for u in users:
        dn = (u.get("displayName") or "").strip()
        if dn:
            users_by_dn[dn].append(u)

    # reset excluded
    for u in users:
        if "excluded" in u:
            u["excluded"] = False

    # applica scelta sui duplicati
    for dn, rows in by_dn.items():
        if len(rows) <= 1:
            continue

        chosen_id = choice.get(dn) or rows[0].get("candidateId")  # default: prima
        chosen = next((r for r in rows if r.get("candidateId") == chosen_id), rows[0])

        # qui assumiamo: gli utenti "a sistema" sono identificati dal displayName (come nella tua richiesta)
        # => lasciamo attivo un solo user per quel displayName
        same_dn_users = users_by_dn.get(dn) or []
        if len(same_dn_users) <= 1:
            # se esiste un solo user a sistema, facciamo override dei campi con quelli del candidato scelto
            if same_dn_users:
                u0 = same_dn_users[0]
                u0["businessRole"] = chosen.get("businessRole") or u0.get("businessRole", "")
                u0["groups"] = sorted(set(chosen.get("roles") or u0.get("groups") or []))
            continue

        # se ci sono più user a sistema con lo stesso displayName, ne lasciamo attivo solo 1
        # (scelta semplice: il primo della lista resta attivo e viene “aggiornato” col candidato scelto)
        keep = same_dn_users[0]
        keep["businessRole"] = chosen.get("businessRole") or keep.get("businessRole", "")
        keep["groups"] = sorted(set(chosen.get("roles") or keep.get("groups") or []))

        for u in same_dn_users[1:]:
            u["excluded"] = True

    # aggiorna anche il mapping BR per coerenza UI
    apply_business_roles(users)


from datetime import datetime, timezone

def _merge_users_into_last_extract(new_users: list[dict], *, ou: str):
    state.setdefault("last_extract", {"ou": "", "users": [], "groups": [], "ts": None})
    base_users = state["last_extract"]["users"]

    by_username = {u.get("username"): u for u in base_users if u.get("username")}

    for nu in (new_users or []):
        uname = nu.get("username")
        if not uname:
            continue

        if uname in by_username:
            u = by_username[uname]
            # aggiorna displayName (se presente) e fai merge gruppi
            if nu.get("displayName"):
                u["displayName"] = nu["displayName"]
            ug = set(u.get("groups") or [])
            ug.update(nu.get("groups") or [])
            u["groups"] = sorted(ug)
        else:
            base_users.append(nu)
            by_username[uname] = nu

    # riallinea campi derivati
    apply_business_roles(base_users)
    state["last_extract"]["ou"] = ou
    state["last_extract"]["groups"] = recompute_groups_from_users(base_users)
    state["last_extract"]["ts"] = datetime.now(timezone.utc).isoformat()


import numpy as np
from typing import Any, Dict, List, Optional

def compute_over_threshold(matrix: Dict[str, Dict[str, int]], pct: float = 0.10) -> Optional[int]:
    if not matrix:
        return None

    row_counts = np.array([int(sum(row.values())) for row in matrix.values()], dtype=np.int32)
    if row_counts.size == 0:
        return None

    k_top = int(np.ceil(pct * row_counts.size))
    k_top = max(1, k_top)

    thr = int(np.partition(row_counts, -k_top)[-k_top])
    return thr

def build_over_rows_only(matrix: Dict[str, Dict[str, int]], threshold: Optional[int]) -> List[Dict[str, Any]]:
    if not matrix or threshold is None:
        return []

    rows: List[Dict[str, Any]] = []
    for user, grants in matrix.items():
        groups = [g for g, v in (grants or {}).items() if int(v) == 1]
        n_groups = len(groups)

        if n_groups >= threshold:
            rows.append({
                "user": user,
                "nGroups": n_groups,
                "over": True,
                "groupsText": ", ".join(groups),
            })

    # default sort utile (visto che "over" è sempre True qui)
    rows.sort(key=lambda r: (-r["nGroups"], r["user"]))
    return rows


def log(level: str, message: str) -> None:
    state["logs"].insert(0, {"ts": datetime.now(timezone.utc).isoformat(), "level": level, "message": message})
    state["logs"] = state["logs"][:500]

def active_users(users: list[dict]) -> list[dict]:
    return [u for u in (users or []) if not u.get("excluded")]

def recompute_groups_from_users(users: list[dict]) -> list[str]:
    return sorted({g for u in active_users(users) for g in (u.get("groups") or [])})

def _mk_candidate(*, source: str, candidate_id: str, display_name: str,
                  business_role: str, roles: list[str], raw: str) -> dict:
    return {
        "candidateId": candidate_id,
        "source": source,
        "displayName": (display_name or "").strip(),
        "businessRole": (business_role or "").strip(),
        "roles": roles or [],
        "rawLine": raw or "",
    }

def rebuild_ingest_candidates() -> None:
    src = state.get("ingest_sources") or {}
    flat = []
    for _, items in src.items():
        flat.extend(items or [])
    state["ingest_candidates"] = flat

def apply_choice_for_displayname(display_name: str,
                                 chosen_business_role: str | None,
                                 chosen_roles: list[str] | None) -> None:
    users = state.get("last_extract", {}).get("users") or []

    same = [u for u in users if (u.get("displayName") or "").strip() == (display_name or "").strip()]
    if not same:
        return

    keep = same[0]
    keep["excluded"] = False

    if chosen_business_role:
        keep["businessRole"] = chosen_business_role
        state.setdefault("user_business_role", {})
        state["user_business_role"][keep["username"]] = chosen_business_role

    if chosen_roles is not None:
        keep["groups"] = sorted(set(chosen_roles))

    for u in same[1:]:
        u["excluded"] = True
        m = state.get("user_business_role") or {}
        if u.get("username") in m:
            del m[u["username"]]

    state["last_extract"]["groups"] = recompute_groups_from_users(users)


# ----------------------------
# Models
# ----------------------------
class LoginRequest(BaseModel):
    username: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    username: str


class ConnectorConfig(BaseModel):
    server: str = Field(..., description="LDAP host/ip o 'mock'")
    bind_user: str = Field("", description="Utente bind (es: user@domain o DOMAIN\\user)")
    bind_password: str = Field("", description="Password bind")
    base_dn: str = Field("", description="Base DN (es: DC=example,DC=local)")
    auth: str = Field("SIMPLE", description="SIMPLE oppure NTLM")


class ExtractRequest(BaseModel):
    ou: str = Field(..., description="OU DN (es: OU=Users,DC=example,DC=local)")


class ExtractResponse(BaseModel):
    ou: str
    total_users: int
    total_groups: int
    users: List[Dict[str, Any]]
    groups: List[str]


class RoleMiningRequest(BaseModel):
    n_clusters: Optional[int] = Field(None, description="Se None, calcolato automaticamente")
    role_support: float = Field(0.5, ge=0.1, le=1.0, description="Soglia (0..1) per includere un gruppo nel ruolo del cluster")


class RoleMiningResponse(BaseModel):
    total_users: int
    total_groups: int
    n_clusters: int
    clusters: List[Dict[str, Any]]
    kpi: Dict[str, Any]


security = HTTPBearer(auto_error=False)


def create_access_token(username: str) -> str:
    exp = datetime.now(timezone.utc) + timedelta(minutes=JWT_EXPIRE_MINUTES)
    payload = {"sub": username, "exp": exp}
    return jwt.encode(payload, JWT_SECRET, algorithm="HS256")


def require_auth(creds: HTTPAuthorizationCredentials = Depends(security)) -> str:
    if creds is None or not creds.credentials:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing bearer token")
    try:
        payload = jwt.decode(creds.credentials, JWT_SECRET, algorithms=["HS256"])
        return payload["sub"]
    except Exception:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")


# ----------------------------
# LDAP / Mock AD
# ----------------------------
def mock_users() -> List[Dict[str, Any]]:
    return [
        {"username": "alice", "displayName": "Alice Rossi", "groups": ["HR", "AllEmployees", "Confluence"]},
        {"username": "bob", "displayName": "Bob Bianchi", "groups": ["HR", "AllEmployees", "Payroll"]},
        {"username": "carol", "displayName": "Carol Verdi", "groups": ["IT", "AllEmployees", "Azure", "GitLab"]},
        {"username": "dave", "displayName": "Dave Neri", "groups": ["IT", "AllEmployees", "Azuure"]},
        {"username": "erin", "displayName": "Erin Gialli", "groups": ["Sales", "AllEmployees", "CRM"]},
        {"username": "frank", "displayName": "Frank Blu", "groups": ["Sales", "AllEmployees", "CRM", "DiscountApproval"]},
    ]


def ldap_authenticate(username: str, password: str) -> bool:
    # Mock AD credential
    if MOCK_AD or state["connector"]["server"] == "mock":
        return username == "admin" and password == "admin123"

    if Connection is None:
        log("ERROR", "ldap3 non disponibile nel container.")
        return False

    cfg = state["connector"]
    server = Server(cfg["server"], get_info=ALL)
    auth_mode = cfg.get("auth", "SIMPLE").upper()

    try:
        if auth_mode == "NTLM":
            conn = Connection(server, user=username, password=password, authentication=NTLM, auto_bind=True)
        else:
            conn = Connection(server, user=username, password=password, authentication=SIMPLE, auto_bind=True)
        conn.unbind()
        return True
    except Exception as e:
        log("WARN", f"LDAP bind fallito: {e}")
        return False


def extract_from_ldap(ou_dn: str) -> List[Dict[str, Any]]:
    if MOCK_AD or state["connector"]["server"] == "mock":
        # Ignora OU, ritorna dataset di test
        return mock_users()

    if Connection is None:
        raise HTTPException(status_code=500, detail="ldap3 non disponibile")

    cfg = state["connector"]
    if not cfg["server"] or not cfg["bind_user"] or not cfg["bind_password"]:
        raise HTTPException(status_code=400, detail="Configura server/bind_user/bind_password in Connettori")

    server = Server(cfg["server"], get_info=ALL)
    auth_mode = cfg.get("auth", "SIMPLE").upper()
    if auth_mode == "NTLM":
        conn = Connection(server, user=cfg["bind_user"], password=cfg["bind_password"], authentication=NTLM, auto_bind=True)
    else:
        conn = Connection(server, user=cfg["bind_user"], password=cfg["bind_password"], authentication=SIMPLE, auto_bind=True)

    # objectClass=user può includere account tecnici: in produzione aggiungere filtri più stretti
    search_filter = "(&(objectClass=user)(sAMAccountName=*))"
    attrs = ["sAMAccountName", "displayName", "memberOf"]

    ok = conn.search(search_base=ou_dn, search_filter=search_filter, attributes=attrs)
    if not ok:
        conn.unbind()
        raise HTTPException(status_code=500, detail=f"LDAP search failed: {conn.result}")

    users: List[Dict[str, Any]] = []
    for entry in conn.entries:
        d = entry.entry_attributes_as_dict
        username = (d.get("sAMAccountName") or [""])[0]
        display = (d.get("displayName") or [""])[0]
        member_of = d.get("memberOf") or []
        # Normalizza gruppi prendendo CN=...
        groups = []
        for dn in member_of:
            parts = str(dn).split(",")
            cn = next((p[3:] for p in parts if p.upper().startswith("CN=")), str(dn))
            groups.append(cn)
        if username:
            users.append({"username": username, "displayName": display or username, "groups": sorted(set(groups))})

    conn.unbind()
    return users


# ----------------------------
# Role Mining
# ----------------------------
def build_matrix(users: List[Dict[str, Any]]) -> Tuple[List[str], List[str], np.ndarray]:
    usernames = [u["username"] for u in users]
    all_groups = sorted({g for u in users for g in u["groups"]})
    g_index = {g: i for i, g in enumerate(all_groups)}

    X = np.zeros((len(users), len(all_groups)), dtype=np.int8)
    for i, u in enumerate(users):
        for g in u["groups"]:
            if g in g_index:
                X[i, g_index[g]] = 1
    return usernames, all_groups, X


def jaccard_distance_matrix(X: np.ndarray) -> np.ndarray:
    # D[i,j] = 1 - |A∩B|/|A∪B|
    n = X.shape[0]
    D = np.zeros((n, n), dtype=np.float32)
    for i in range(n):
        Ai = X[i]
        for j in range(i + 1, n):
            Aj = X[j]
            inter = int(np.logical_and(Ai, Aj).sum())
            union = int(np.logical_or(Ai, Aj).sum())
            dist = 0.0 if union == 0 else 1.0 - (inter / union)
            D[i, j] = dist
            D[j, i] = dist
    return D


def compute_purity(cluster_members_idx: List[int], X: np.ndarray) -> float:
    # Purity “semplice”: media della massima frequenza (per attributo) nel cluster
    if not cluster_members_idx:
        return 0.0
    sub = X[cluster_members_idx, :]
    # frequenza per colonna
    freq = sub.mean(axis=0)  # 0..1
    return float(freq.max())  # quanto un "gruppo dominante" spiega il cluster

import re
from collections import defaultdict

_BROAD_MARKERS = {"all", "tutti", "tutte", "full", "global", "everyone", "any"}

def _tokens(s: str) -> list[str]:
    s = (s or "").lower()
    s = re.sub(r"[^a-z0-9]+", " ", s)
    return [t for t in s.split() if t]

def _family_key(role_name: str) -> str:
    toks = _tokens(role_name)
    return toks[0] if toks else ""

def _is_broad(role_name: str) -> bool:
    toks = set(_tokens(role_name))
    return any(m in toks for m in _BROAD_MARKERS)

def compute_ai_detection(matrix: dict) -> dict:
    total_assignments = 0
    redundant_assignments = 0

    users_with_redundancy = 0
    redundant_users = []

    for uname, row in (matrix or {}).items():
        roles = [r for r, v in (row or {}).items() if int(v) == 1]
        total_assignments += len(roles)

        fam = defaultdict(list)
        for r in roles:
            k = _family_key(r)
            if k:
                fam[k].append(r)

        has_redundancy = False
        for rs in fam.values():
            broad = [r for r in rs if _is_broad(r)]
            specific = [r for r in rs if not _is_broad(r)]
            if broad and specific:
                redundant_assignments += len(broad)
                has_redundancy = True

        if has_redundancy:
            users_with_redundancy += 1
            redundant_users.append(uname)

    pct = (redundant_assignments / total_assignments * 100.0) if total_assignments else 0.0

    return {
        "aiDetection": round(pct, 2),
        "redundantAssignments": redundant_assignments,
        "totalAssignments": total_assignments,
        "usersWithRedundancy": users_with_redundancy,
        "redundantUsers": redundant_users,
    }



def compute_kpis(
    users: List[Dict[str, Any]],
    clusters: List[Dict[str, Any]],
    matrix: Dict[str, Dict[str, int]],
) -> Dict[str, Any]:
    import numpy as np

    total_users = len(users)
    if total_users == 0:
        return {"totalUsers": 0, "overprivilegedPct": 0, "clusterQuality": 0, "roleCoverage": 0}

    # --- Overprivileged: top 10% per numero gruppi calcolato dalla matrix ---
        # --- Overprivileged: top 10% per numero gruppi calcolato dalla matrix ---
    row_counts = np.array(
        [int(sum(row.values())) for row in (matrix or {}).values()],
        dtype=np.int32
    )
    if row_counts.size == 0:
        return {"totalUsers": total_users, "overprivilegedPct": 0, "clusterQuality": 0, "roleCoverage": 0}

    # Opzione A: top-k (robusta anche con pochi utenti)
    k_top = int(np.ceil(0.1 * row_counts.size))
    k_top = max(1, k_top)

    # soglia = k-esimo valore più grande (partition è O(n))
    thr = int(np.partition(row_counts, -k_top)[-k_top])

    # >= così includi sempre almeno k utenti (a parità di conteggi può includerne di più)
    overpriv = float((row_counts >= thr).mean() * 100.0)


    # --- RoleCoverage: roleGroups copre i gruppi reali (da matrix) dei membri ---
    cov_vals = []
    for c in (clusters or []):
        role_groups = set(c.get("roleGroups") or [])
        for uname in (c.get("members") or []):
            row = matrix.get(uname) or {}
            denom = int(sum(row.values()))
            if denom <= 0:
                cov_vals.append(0.0)
            else:
                covered = sum(int(row.get(g, 0)) for g in role_groups)
                cov_vals.append(covered / denom)

    # role_coverage = float((np.mean(cov_vals) if cov_vals else 0.0) * 100.0)

    # --- ClusterQuality (data-quality score da ingestione CSV) ---
    stats = state.get("last_csv_stats") or {}
    csv_total = int(stats.get("csvRowsTotal") or 0)
    csv_missing_br = int(stats.get("csvRowsMissingBR") or 0)
    csv_dup_dn = int(stats.get("csvDuplicateDisplayNameRows") or 0)

    if csv_total > 0:
        missing_br_rate = csv_missing_br / csv_total
        dup_rate = csv_dup_dn / csv_total
        cluster_quality = 100.0 * (1.0 - dup_rate) * (1.0 - missing_br_rate)
    else:
        # nessun CSV importato => nessun problema di ingestione misurabile
        cluster_quality = 100.0

    ai = compute_ai_detection(matrix)
    

    return {
        "totalUsers": total_users,
        "overprivilegedPct": round(overpriv, 2),
        "clusterQuality": round(float(cluster_quality), 2),
        "aiDetection": ai.get("aiDetection", 0),
        "redundantAssignments": ai.get("redundantAssignments", 0),
        "totalAssignments": ai.get("totalAssignments", 0),
        "usersWithRedundancy": ai.get("usersWithRedundancy", 0),


        # "roleCoverage": round(role_coverage, 2),
        "roleCoverage": 0,
        "csvRowsTotal": csv_total,
        "csvRowsMissingBR": csv_missing_br,
        "csvDuplicateDisplayNameRows": csv_dup_dn,
    }


def run_role_mining(users: List[Dict[str, Any]], n_clusters: Optional[int], role_support: float) -> Dict[str, Any]:
    users = [u for u in (users or []) if not u.get("excluded")]

    usernames, groups, X = build_matrix(users)
    if len(usernames) < 2 or len(groups) == 0:
        return {"clusters": [], "matrix": {}, "kpi": compute_kpis(users, [], {})}


    auto_k = max(2, int(round(np.sqrt(len(usernames)))))
    k = int(n_clusters) if n_clusters else min(8, auto_k, len(usernames))

    D = jaccard_distance_matrix(X)
    model = AgglomerativeClustering(n_clusters=k, metric="precomputed", linkage="average")
    labels = model.fit_predict(D)

    # cluster -> indexes
    clusters: List[Dict[str, Any]] = []
    for cid in sorted(set(labels.tolist())):
        idx = [i for i, lab in enumerate(labels) if lab == cid]
        members = [usernames[i] for i in idx]

        sub = X[idx, :]
        freq = sub.mean(axis=0)  # 0..1
        role_groups = [groups[j] for j in range(len(groups)) if float(freq[j]) >= role_support]

        purity = compute_purity(idx, X)

        clusters.append({
            "clusterId": int(cid),
            "members": members,
            "roleGroups": role_groups,
            "purity": round(float(purity), 4),
            "size": len(members),
        })

    # matrix for UI
    matrix: Dict[str, Dict[str, int]] = {}
    for i, uname in enumerate(usernames):
        row = {g: int(X[i, j]) for j, g in enumerate(groups)}
        matrix[uname] = row

    kpi = compute_kpis(users, clusters, matrix)


    return {"clusters": clusters, "matrix": matrix, "kpi": kpi, "groups": groups}

def ensure_last_mining() -> None:
    """
    Ricalcola il clustering se:
    - mining_dirty=True, oppure
    - non esiste una matrix, oppure
    - last_extract.ts è più recente di last_mining.ts (cache stale)
    """
    last_extract = state.get("last_extract") or {}
    last_mining = state.get("last_mining") or {}

    extract_ts = last_extract.get("ts")
    mining_ts = last_mining.get("ts")
    matrix = last_mining.get("matrix") or {}

    stale = bool(extract_ts and (not mining_ts or str(extract_ts) > str(mining_ts)))

    if not state.get("mining_dirty") and matrix and not stale:
        return

    params = state.get("last_mining_params") or {}
    n_clusters = params.get("n_clusters", None)
    role_support = params.get("role_support", 0.6)

    users = active_users(last_extract.get("users") or [])
    res = run_role_mining(users, n_clusters=n_clusters, role_support=role_support)

    state["last_mining"] = {
        "clusters": res.get("clusters", []),
        "matrix": res.get("matrix", {}),
        "kpi": res.get("kpi", {}),
        "groups": res.get("groups", []),
        "ts": datetime.now(timezone.utc).isoformat(),
    }
    state["mining_dirty"] = False



# ----------------------------
# FastAPI app
# ----------------------------
app = FastAPI(title=APP_TITLE)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:5173",
        "https://nk5c8nx5-5173.euw.devtunnels.ms",  # ← senza /:5173
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)



@app.get("/api/health")
def health():
    return {"ok": True, "ts": int(time.time())}


@app.post("/api/auth/login", response_model=TokenResponse)
def login(body: LoginRequest):
    if not ldap_authenticate(body.username, body.password):
        raise HTTPException(status_code=401, detail="Credenziali non valide")
    token = create_access_token(body.username)
    log("INFO", f"Login OK: {body.username}")
    return TokenResponse(access_token=token, username=body.username)


@app.get("/api/me")
def me(username: str = Depends(require_auth)):
    return {"username": username}


@app.get("/api/config/connector", response_model=ConnectorConfig)
def get_connector(username: str = Depends(require_auth)):
    return ConnectorConfig(**state["connector"])


@app.post("/api/config/connector", response_model=ConnectorConfig)
def set_connector(cfg: ConnectorConfig, username: str = Depends(require_auth)):
    state["connector"] = cfg.model_dump()
    log("INFO", f"Connector config updated by {username} (server={cfg.server}, auth={cfg.auth})")
    return cfg


@app.post("/api/ad/extract", response_model=ExtractResponse)
def extract(req: ExtractRequest, username: str = Depends(require_auth)):
    users = extract_from_ldap(req.ou)

    # BRDB: rebuild leggero (si basa su stato corrente: last_extract + role_meta + mapping)
    brdb_rebuild()

    # BRDB: auto-assegna BR solo se utente non ha già mapping
    for u in users:
        uname = u.get("username")
        if not uname:
            continue
        if (state.get("user_business_role") or {}).get(uname):
            continue

        sug = brdb_infer_groupset(u.get("groups") or [])
        u["autoBusinessRole"] = sug  # utile per debug/UI
        if sug["role"] != "Unassigned" and float(sug["confidence"]) >= BRDB_MIN_CONF:
            state.setdefault("user_business_role", {})
            state["user_business_role"][uname] = sug["role"]

            # learning “debole”: conferma implicita dall’auto-assegnazione
            brdb_learn_assignment(sug["role"], u.get("groups") or [], weight=1)

    # applica business roles (ora include anche le nuove auto-assegnazioni)
    apply_business_roles(users)


    # 1) Costruisci candidati AD
    ad_candidates = []
    for u in users:
        ad_candidates.append(
            _mk_candidate(
                source="ad",
                candidate_id=f"ad:{u['username']}",
                display_name=u.get("displayName", ""),
                business_role=u.get("businessRole", ""),
                roles=(u.get("groups") or []),
                raw=f"AD:{u.get('username')}|{u.get('displayName')}|{','.join(u.get('groups') or [])}",
            )
        )

    # 2) DB di sistema: append/upsert
    _merge_users_into_last_extract(users, ou=req.ou)

    # 3) Ingest sources: aggiorna solo lo slice AD (non distruggere gli altri)
    state.setdefault("ingest_sources", {})
    state["ingest_sources"]["ad"] = ad_candidates

    # NON fare questo:
    # state["ingest_sources"] = {"ad": ad_candidates}
    # state["choice_by_displayName"] = {}

    rebuild_ingest_candidates()
    apply_duplicate_displayname_resolution()
    state["mining_dirty"] = True

    return ExtractResponse(
        ou=state["last_extract"]["ou"],
        total_users=len(state["last_extract"]["users"]),
        total_groups=len(state["last_extract"]["groups"]),
        users=state["last_extract"]["users"],
        groups=state["last_extract"]["groups"],
    )


@app.get("/api/users")
def list_users(q: str = "", username: str = Depends(require_auth)):
    users = active_users(state["last_extract"]["users"] or [])
    if q:
        ql = q.lower()
        users = [
            u for u in users
            if ql in (u.get("username") or "").lower()
            or ql in (u.get("displayName") or "").lower()
        ]
    return {"total": len(users), "users": users}



@app.post("/api/rolemining/run", response_model=RoleMiningResponse)
def rolemining_run(req: RoleMiningRequest, username: str = Depends(require_auth)):
    users = active_users(state["last_extract"]["users"] or [])
    if not users:
        raise HTTPException(status_code=400, detail="Esegui prima AD Extract")

    state["last_mining_params"] = {"n_clusters": req.n_clusters, "role_support": req.role_support}

    res = run_role_mining(users, req.n_clusters, req.role_support)
    clusters = res["clusters"]
    kpi = res["kpi"]
    groups = res.get("groups", state["last_extract"]["groups"])

    state["last_mining"] = {
        "clusters": clusters,
        "matrix": res["matrix"],
        "kpi": kpi,
        "groups": groups,
        "ts": datetime.now(timezone.utc).isoformat()
    }
    state["mining_dirty"] = False

    log("INFO", f"Role mining run: clusters={len(clusters)}")

    return RoleMiningResponse(
        total_users=len(users),
        total_groups=len(groups),
        n_clusters=len(clusters),
        clusters=clusters,
        kpi=kpi
    )


@app.get("/api/rolemining/last")
def rolemining_last(username: str = Depends(require_auth)):
    return state["last_mining"]


@app.get("/api/kpi")
def kpi(username: str = Depends(require_auth)):
    ensure_last_mining()
    last = state.get("last_mining") or {}
    kpi = last.get("kpi") or {}
    if not kpi:
        raise HTTPException(status_code=400, detail="Nessun risultato: dataset vuoto o role mining non eseguibile")
    return kpi


@app.get("/api/kpi/drilldown/{metric}")
def kpi_drilldown(metric: str, username: str = Depends(require_auth)):
    ensure_last_mining()
    last = state.get("last_mining") or {}
    matrix = last.get("matrix") or {}
    clusters = last.get("clusters") or []

    if not matrix:
        raise HTTPException(status_code=400, detail="Nessun risultato: dataset vuoto o role mining non eseguibile")

    if metric == "overprivileged":
        payload = build_overprivileged_items(matrix, top_pct=10.0)
        return {"metric": metric, **payload}

    if metric == "ai-detection":
        return {"metric": metric, "items": build_ai_detection_items(matrix)}

    if metric == "cluster-quality":
        # se ti serve davvero: return {"metric": metric, "items": build_cluster_quality_items(clusters, matrix)}
        ...
    raise HTTPException(status_code=404, detail="Unknown metric")


from fastapi import FastAPI
from typing import Any, Dict, List, Optional

# helper: costruisce righe per UI (tutti gli utenti)
def build_overprivileged_rows(matrix: Dict[str, Dict[str, int]], threshold: Optional[int]) -> List[Dict[str, Any]]:
    rows: List[Dict[str, Any]] = []
    for user, grants in (matrix or {}).items():
        groups = [g for g, v in (grants or {}).items() if int(v) == 1]
        n_groups = len(groups)
        over = bool(threshold is not None and n_groups >= int(threshold))
        rows.append({
            "user": user,
            "nGroups": n_groups,
            "over": over,
            "groups": groups,              # lista (meglio della stringa)
            "groupsText": ", ".join(groups) # comodo se vuoi visualizzarla subito
        })

    # ordinamento default lato backend (opzionale): Over desc, poi #Gruppi desc, poi user asc
    rows.sort(key=lambda r: (not r["over"], -r["nGroups"], r["user"]))
    return rows

@app.get("/api/drilldown/overprivileged")
def drilldown_overprivileged(nclusters: int = 8, rolesupport: float = 0.1):
    clusters, matrix, kpi = runroleminingusers(users, nclusters=nclusters, rolesupport=rolesupport)

    thr = compute_over_threshold(matrix, pct=0.10)     # calcolata su TUTTI gli utenti
    rows = build_over_rows_only(matrix, thr)           # ma ritorni SOLO gli over

    return {
        "rows": rows,
        # opzionale: la soglia non la mostri in UI, ma può tornare utile per debug
        "threshold": thr,
        "totalUsers": len(matrix or {}),
        "overUsers": len(rows),
    }



@app.get("/api/logs")
def logs(username: str = Depends(require_auth)):
    return {"total": len(state["logs"]), "items": state["logs"]}


class RoleAssignRequest(BaseModel):
    username: str


@app.get("/api/businessroles")
def businessroles(username: str = Depends(require_auth)):
    users = active_users(state["last_extract"]["users"] or [])

    apply_business_roles(users)
    roles = sorted({u.get("businessRole", "Unassigned") for u in users})
    extra = state.get("business_roles", set())
    roles = sorted(set(roles).union(set(extra)))
    roles_info = []
    for r in roles:
        members = [u for u in users if u.get("businessRole") == r]
        roles_info.append({"role": r, "count": len(members)})
    return {
        "roles": roles_info,
        "assignments": {u["username"]: u.get("businessRole", "Unassigned") for u in users},
    }

class RoleCreateRequest(BaseModel):
    role: str

# role -> meta (color + groups)
state.setdefault("role_meta", {
    "IT": {"color": "#00B4FF", "groups": ["Azure", "GitLab"]},
    "HR": {"color": "#FF9F1C", "groups": ["HR", "Payroll"]},
})
state.setdefault("business_roles", set(["IT", "HR"]))



class RoleColorRequest(BaseModel):
    color: str  # "#RRGGBB"

class RoleGroupRequest(BaseModel):
    group: str

@app.get("/api/ad/groups")
def ad_groups(username: str = Depends(require_auth)):
    users = state["last_extract"].get("users") or []
    groups = recompute_groups_from_users(users)
    return {"groups": groups}


@app.get("/api/businessroles/{role}/meta")
def businessrole_meta(role: str, username: str = Depends(require_auth)):
    meta = state.get("role_meta", {}).get(role, {"color": "#ffffff", "groups": []})
    return {"role": role, "color": meta.get("color", "#ffffff"), "groups": meta.get("groups", [])}

@app.post("/api/businessroles/{role}/color")
def businessrole_set_color(role: str, body: RoleColorRequest, username: str = Depends(require_auth)):
    state.setdefault("role_meta", {})
    state["role_meta"].setdefault(role, {"color": "#ffffff", "groups": []})
    state["role_meta"][role]["color"] = body.color
    state.setdefault("business_roles", set()).add(role)
    log("INFO", f"Role color set: {role} -> {body.color} by {username}")
    return {"ok": True}

@app.post("/api/businessroles/{role}/groups/add")
def businessrole_add_group(role: str, body: RoleGroupRequest, username: str = Depends(require_auth)):
    state.setdefault("role_meta", {})
    state["role_meta"].setdefault(role, {"color": "#ffffff", "groups": []})
    gs = set(state["role_meta"][role].get("groups", []))
    gs.add(body.group)
    state["role_meta"][role]["groups"] = sorted(gs)
    state.setdefault("business_roles", set()).add(role)
    log("INFO", f"Role group add: {role} + {body.group} by {username}")
    return {"ok": True}

# ----------------------------
# BRDB Suggestions for UI
# ----------------------------
class SuggestionPickRequest(BaseModel):
    group: str

def brdb_suggest_groups_for_role(role: str, *, limit: int = 50, min_conf: float = 0.60) -> List[Dict[str, Any]]:
    """
    Ritorna gruppi suggeriti da assegnare al Business Role (escludendo quelli già presenti in role_meta[role].groups).
    Richiede che tu abbia già le funzioni BRDB: brdb_rebuild(), brdb_infer_group().
    """
    role = (role or "").strip()
    if not role:
        return []

    # Assicura DB pronto (se usi brdb_ready/brdb_rebuild)
    try:
        brdb_rebuild()
    except Exception:
        # se non hai brdb_rebuild ancora incollato, evita crash dell'endpoint
        return []

    meta = (state.get("role_meta") or {}).get(role) or {}
    already = set(meta.get("groups") or [])

    # candidati: tutti i gruppi visti a sistema
    all_groups = (state.get("last_extract") or {}).get("groups") or []
    out = []
    for g in all_groups:
        g = (g or "").strip()
        if not g or g in already:
            continue

        s = brdb_infer_group(g)  # -> {"role": "...", "confidence": 0..1, "evidence": ...}
        if s.get("role") != role:
            continue
        if float(s.get("confidence") or 0.0) < float(min_conf):
            continue

        out.append({
            "group": g,
            "confidence": float(s.get("confidence") or 0.0),
            "evidence": s.get("evidence", {}),
        })

    out.sort(key=lambda x: x["confidence"], reverse=True)
    return out[: int(limit)]

@app.get("/api/businessroles/{role}/suggestions")
def businessrole_suggestions(role: str, limit: int = 50, min_conf: float = 0.60, username: str = Depends(require_auth)):
    """
    Endpoint per la sezione "AI Suggestion" della pagina Business Role.
    """
    items = brdb_suggest_groups_for_role(role, limit=limit, min_conf=min_conf)
    return {"role": role, "total": len(items), "items": items}

@app.post("/api/businessroles/{role}/suggestions/select")
def businessrole_suggestion_select(role: str, body: SuggestionPickRequest, username: str = Depends(require_auth)):
    """
    Pulsante "Select": assegna direttamente il gruppo suggerito al role_meta del BR.
    (È equivalente a chiamare /api/businessroles/{role}/groups/add, ma comodo per UI.)
    """
    g = (body.group or "").strip()
    if not g:
        raise HTTPException(status_code=400, detail="Group vuoto")

    # Riusa la stessa logica del groups/add
    state.setdefault("role_meta", {})
    state["role_meta"].setdefault(role, {"color": "#ffffff", "groups": []})
    gs = set(state["role_meta"][role].get("groups", []))
    gs.add(g)
    state["role_meta"][role]["groups"] = sorted(gs)
    state.setdefault("business_roles", set()).add(role)

    # training "forte" (se hai brdb_learn_assignment); altrimenti ignoralo
    try:
        brdb_learn_assignment(role, [g], weight=10)
    except Exception:
        pass

    state["mining_dirty"] = True
    log("INFO", f"Suggestion selected: {role} + {g} by {username}")
    return {"ok": True, "role": role, "group": g}


@app.post("/api/businessroles/{role}/groups/remove")
def businessrole_remove_group(role: str, body: RoleGroupRequest, username: str = Depends(require_auth)):
    state.setdefault("role_meta", {})
    state["role_meta"].setdefault(role, {"color": "#ffffff", "groups": []})
    gs = [g for g in state["role_meta"][role].get("groups", []) if g != body.group]
    state["role_meta"][role]["groups"] = gs
    log("INFO", f"Role group remove: {role} - {body.group} by {username}")
    return {"ok": True}


@app.post("/api/businessroles/create")
def businessrole_create(body: RoleCreateRequest, username: str = Depends(require_auth)):
    role = body.role.strip()
    if not role:
        raise HTTPException(status_code=400, detail="Role vuoto")

    # Crea il ruolo senza assegnare utenti: basta “registrarlo”
    state.setdefault("business_roles", set())
    if isinstance(state["business_roles"], list):
        state["business_roles"] = set(state["business_roles"])
    state["business_roles"].add(role)

    log("INFO", f"Business role created: {role} by {username}")
    return {"ok": True, "role": role}

class ChooseCsvRowRequest(BaseModel):
    displayNameRaw: str
    rowId: str

@app.post("/api/csv/duplicates/choose")
def choose_csv_duplicate_row(body: ChooseCsvRowRequest, username: str = Depends(require_auth)):
    dn_raw = body.displayNameRaw
    row_id = body.rowId

    rows = state.get("last_csv_rows") or []
    rec = next((r for r in rows if r.get("rowId") == row_id and r.get("displayNameRaw") == dn_raw), None)
    if not rec:
        raise HTTPException(status_code=404, detail="Row not found")

    # salva scelta
    state.setdefault("csv_choice_by_dn", {})
    state["csv_choice_by_dn"][dn_raw] = row_id

    # applica override “a sistema” sull’utente (per displayName)
    users = state.get("last_extract", {}).get("users") or []
    dn_clean = rec.get("displayName") or ""
    br = rec.get("businessRole") or ""
    roles = rec.get("roles") or []

    uobj = next((u for u in users if (u.get("displayName") or "").strip() == dn_clean), None)
    if not uobj:
        raise HTTPException(status_code=400, detail="User not found in last_extract")

    uobj["groups"] = sorted(set(roles))
    if br:
        uobj["businessRole"] = br
        state.setdefault("user_business_role", {})
        state["user_business_role"][uobj["username"]] = br

    log("INFO", f"CSV duplicate resolved: '{dn_raw}' -> rowId={row_id} by {username}")
    return {"ok": True, "username": uobj["username"], "chosenRowId": row_id}


@app.get("/api/businessroles/{role}")
def businessrole_detail(role: str, username: str = Depends(require_auth)):
    users = active_users(state["last_extract"]["users"] or [])
    apply_business_roles(users)
    members = [u for u in users if u.get("businessRole") == role]
    return {"role": role, "users": members}

@app.get("/api/ingest/conflicts/duplicate-displayname")
def conflicts_duplicate_displayname():
    candidates = state.get("ingest_candidates") or []
    by_dn = defaultdict(list)
    for c in candidates:
        dn = (c.get("displayName") or "").strip()
        if dn:
            by_dn[dn].append(c)

    items = []
    choice = state.get("choice_by_displayName") or {}
    for dn, rows in by_dn.items():
        if len(rows) > 1:
            items.append({
                "displayName": dn,
                "chosenCandidateId": choice.get(dn),
                "rows": rows,
            })

    items.sort(key=lambda x: len(x["rows"]), reverse=True)
    return {"items": items}


class ChooseDuplicateRequest(BaseModel):
    displayName: str
    candidateId: str

@app.post("/api/ingest/conflicts/duplicate-displayname/choose")
def choose_duplicate(body: ChooseDuplicateRequest):
    state.setdefault("choice_by_displayName", {})
    state["choice_by_displayName"][body.displayName] = body.candidateId

    cand = next((c for c in state.get("ingest_candidates", [])
                 if c["candidateId"] == body.candidateId and c["displayName"] == body.displayName), None)
    if cand:
        apply_choice_for_displayname(
            display_name=body.displayName,
            chosen_business_role=cand.get("businessRole"),
            chosen_roles=cand.get("roles") or [],
        )

    log("INFO", f"Duplicate resolved: {body.displayName} -> {body.candidateId}")
    return {"ok": True}



@app.get("/api/ingest/conflicts/{kind}")
def ingest_conflicts(kind: str, username: str = Depends(require_auth)):
    # kind: "duplicate-displayname", "missing-businessrole", ecc.
    candidates = state.get("ingest_candidates") or []

    if kind != "duplicate-displayname":
        raise HTTPException(status_code=404, detail="Unknown conflict kind")

    by_dn = defaultdict(list)
    for c in candidates:
        dn = (c.get("displayName") or "").strip()
        if dn:
            by_dn[dn].append(c)

    items = []
    for dn, rows in by_dn.items():
        if len(rows) > 1:
            chosen = (state.get("choice_by_displayName") or {}).get(dn)
            items.append({"displayName": dn, "chosenCandidateId": chosen, "rows": rows})

    items.sort(key=lambda x: len(x["rows"]), reverse=True)
    return {"kind": kind, "items": items}

class ChooseConflictRequest(BaseModel):
    kind: str                   # "duplicate-displayname"
    displayName: str
    candidateId: str

@app.post("/api/ingest/conflicts/choose")
def choose_conflict(body: ChooseConflictRequest, username: str = Depends(require_auth)):
    if body.kind != "duplicate-displayname":
        raise HTTPException(status_code=404, detail="Unknown conflict kind")

    state.setdefault("choice_by_displayName", {})
    state["choice_by_displayName"][body.displayName] = body.candidateId

    # Applica subito la scelta a “last_extract” (utente effettivo)

    return {"ok": True}


@app.post("/api/businessroles/{role}/add")
def businessrole_add(role: str, body: RoleAssignRequest, username: str = Depends(require_auth)):
    # assegna (e rimuove da eventuale ruolo precedente)
    m = state.get("user_business_role", {})
    m[body.username] = role
    state["user_business_role"] = m
    # aggiorna cache estrazione per riflettere subito la modifica in UI
    users = state["last_extract"]["users"] or []
    apply_business_roles(users)
        # BRDB training: quando assegni a mano è “ground truth”
    u = next((x for x in users if x.get("username") == body.username), None)
    if u:
        brdb_learn_assignment(role, u.get("groups") or [], weight=10)

    log("INFO", f"Business role set: {body.username} -> {role} by {username}")
    return {"ok": True, "username": body.username, "role": role}

def _slug_username(display_name: str) -> str:
    s = (display_name or "").strip().lower()
    s = re.sub(r"\s+", ".", s)
    s = re.sub(r"[^a-z0-9._-]", "", s)
    return s or "user"

@app.post("/api/import/csv")
async def import_csv(file: UploadFile = File(...), username: str = Depends(require_auth)):
    


    raw = await file.read()
    if not raw:
        raise HTTPException(status_code=400, detail="File vuoto")

    text = raw.decode("utf-8-sig", errors="replace")
    reader = csv.DictReader(io.StringIO(text), delimiter=";", skipinitialspace=True)
    if reader.fieldnames:
        reader.fieldnames = [h.strip() for h in reader.fieldnames]

    required = {"DisplayName", "BusinessRole", "Ruoli"}
    if not reader.fieldnames or not required.issubset(set(reader.fieldnames)):
        raise HTTPException(
            status_code=400,
            detail=f"Headers richiesti: {sorted(required)}; trovati: {reader.fieldnames}",
        )

    # stato base (come AD Extract)
    state.setdefault("last_extract", {"ou": "", "users": [], "groups": [], "ts": None})
    state.setdefault("user_business_role", {})
    state.setdefault("role_meta", {})
    state.setdefault("business_roles", set())

    base_users = state["last_extract"].get("users") or []

    # indicizza utenti esistenti
    by_username = {u["username"]: u for u in base_users if u.get("username")}
    by_display = {}
    for u in base_users:
        dn0 = (u.get("displayName") or "").strip()
        if dn0 and dn0 not in by_display:
            by_display[dn0] = u

    created_roles = set()
    created_users = 0
    assigned_users = 0
    added_groups = 0

    # ---- CSV ingest quality stats (su righe, non su utenti “fusi”) ----
    csv_rows_total = 0
    csv_rows_missing_br = 0
    csv_dup_dn_rows = 0
    seen_dn_in_csv = set()
    state.setdefault("ingest_sources", {})
    state["ingest_sources"].setdefault("csv", [])

    state["last_csv_rows"] = []              # elenco righe “raw” per drilldown
    state["csv_choice_by_dn"] = {}           # displayNameRaw -> rowId scelto
    state["csv_rows_by_dn"] = defaultdict(list)  # displayNameRaw -> [rowId...]


    for row in reader:
        csv_rows_total += 1

        dn_raw = row.get("DisplayName") or ""
        br_raw = row.get("BusinessRole") or ""
        ruoli_raw = row.get("Ruoli") or ""

        # usiamo dn “pulito” solo per creare/trovare utente, ma dup lo contiamo AS-IS sul raw
        dn = dn_raw.strip()
        br = br_raw.strip()
        ruoli = ruoli_raw.strip()


        row_id = f"{csv_rows_total}"  # id semplice = numero riga (1..N)

        parsed_roles = [g.strip() for g in (ruoli or "").split(",") if g.strip()]

        rec = {
            "rowId": row_id,
            "displayName": dn,            # pulito
            "displayNameRaw": dn_raw,     # come da CSV
            "businessRole": br,
            "roles": parsed_roles,
            "rawLine": f"{dn_raw};{br_raw};{ruoli_raw}",
        }

        state["last_csv_rows"].append(rec)
        state["csv_rows_by_dn"][dn_raw].append(row_id)

        # default: prima riga incontrata diventa “scelta”
        state["csv_choice_by_dn"].setdefault(dn_raw, row_id)


        # tollera righe sbagliate tipo: "Alice Rossi,IT;VPN,GitLab"
        if (not br) and dn and ("," in dn):
            dn, br = [x.strip() for x in dn.split(",", 1)]

        if not dn:
            continue

        # duplicati displayName nel CSV (AS-IS sul valore della colonna)
        if dn_raw in seen_dn_in_csv:
            csv_dup_dn_rows += 1
        else:
            seen_dn_in_csv.add(dn_raw)

        # gruppi dalla colonna Ruoli
        groups = [g.strip() for g in ruoli.split(",") if g.strip()]

        row_id = f"csv:{csv_rows_total}"

        candidate = _mk_candidate(
            source="csv",
            candidate_id=row_id,
            display_name=dn,
            business_role=br,
            roles=groups,
            raw=f"{dn_raw};{br_raw};{ruoli_raw}",
        )

        state["ingest_sources"]["csv"].append(candidate)

        # default: se non esiste ancora una scelta per questo displayName, prendo la prima riga
        state.setdefault("choice_by_displayName", {})
        state["choice_by_displayName"].setdefault(candidate["displayName"], candidate["candidateId"])


        # trova utente (prima per displayName, poi crea)
        uobj = by_display.get(dn)
        if not uobj:
            base = _slug_username(dn)
            uname = base
            i = 2
            while uname in by_username:
                uname = f"{base}{i}"
                i += 1

            uobj = {"username": uname, "displayName": dn, "groups": []}
            base_users.append(uobj)  # come AD extract
            by_username[uname] = uobj
            by_display[dn] = uobj
            created_users += 1

        uname = uobj["username"]

        # merge gruppi utente
        if groups:
            ug = set(uobj.get("groups") or [])
            before = len(ug)
            ug.update(groups)
            uobj["groups"] = sorted(ug)
            added_groups += max(0, len(ug) - before)

        # se BR mancante: non assegnare, ma traccia l’anomalia e NON scartare l’utente
                # se BR mancante: prova inferenza (NO AI) usando i gruppi della colonna Ruoli
        if not br:
            csv_rows_missing_br += 1

            sug = brdb_infer_groupset(groups)
            rec["autoBusinessRole"] = sug  # per drilldown/debug

            if sug["role"] != "Unassigned" and float(sug["confidence"]) >= BRDB_MIN_CONF:
                br = sug["role"]
                rec["businessRole"] = br  # aggiorna anche la riga “raw” per UI/drilldown
            else:
                # opzionale: rendi esplicito che l'utente non ha BR (senza sovrascrivere se esiste già)
                if "businessRole" not in uobj:
                    uobj["businessRole"] = ""
                continue


        # assegna BR (mappa ufficiale + campo sull'utente per analytics/UI)
        state["user_business_role"][uname] = br
        uobj["businessRole"] = br
                # training forte: il CSV (quando BR è valorizzato) è una “verità”
        brdb_learn_assignment(br, groups, weight=5)

        assigned_users += 1

        # registra BR “a sistema”
        state["business_roles"].add(br)
        if br not in state["role_meta"]:
            r = random.randint(100, 255)
            g = random.randint(100, 255)
            b = random.randint(100, 255)
            color = f"{r:02x}{g:02x}{b:02x}".upper()
            if not color.startswith("#"):
                    color = "#" + color


            state["role_meta"][br] = {"color": color, "groups": []}
            created_roles.add(br)

    # come AD Extract: ricalcola groups globali e applica business roles sugli utenti
    apply_business_roles(base_users)
    state["last_extract"]["groups"] = sorted({g for u in base_users for g in (u.get("groups") or [])})
    state["last_extract"]["users"] = base_users
    state["last_extract"]["ts"] = datetime.now(timezone.utc).isoformat()

    # salva stats ingestione per KPI
    state["last_csv_stats"] = {
        "csvRowsTotal": csv_rows_total,
        "csvRowsMissingBR": csv_rows_missing_br,
        "csvDuplicateDisplayNameRows": csv_dup_dn_rows,
        "by": username,
        "ts": datetime.now(timezone.utc).isoformat(),
    }

    log(
        "INFO",
        f"CSV import by {username}: users+={created_users}, assigned={assigned_users}, roles+={len(created_roles)}, "
        f"csvRowsTotal={csv_rows_total}, csvRowsMissingBR={csv_rows_missing_br}, csvDupDnRows={csv_dup_dn_rows}"
    )

    rebuild_ingest_candidates()

# applica tutte le scelte correnti (AD + CSV) sugli utenti a sistema
    rebuild_ingest_candidates()
    apply_duplicate_displayname_resolution()
    state["mining_dirty"] = True


    return {
    "ok": True,
    "assigned_users": assigned_users,
    "created_users": created_users,
    "created_roles": sorted(created_roles),
    "added_groups": added_groups,
    "csvRowsTotal": csv_rows_total,
    "csvRowsMissingBR": csv_rows_missing_br,
    "csvDuplicateDisplayNameRows": csv_dup_dn_rows,

    # campi attesi dal frontend
    "newBusinessRoles": len(created_roles),
    "newRoles": added_groups,
}

def apply_all_choices_to_last_extract() -> None:
    rebuild_ingest_candidates()
    for dn, cid in (state.get("choice_by_displayName") or {}).items():
        cand = next(
            (c for c in (state.get("ingest_candidates") or [])
             if c.get("candidateId") == cid and c.get("displayName") == dn),
            None
        )
        if cand:
            apply_choice_for_displayname(
                display_name=dn,
                chosen_business_role=cand.get("businessRole"),
                chosen_roles=cand.get("roles") or [],
            )

    # riallinea lista gruppi (tiene conto degli excluded)
    users = state.get("last_extract", {}).get("users") or []
    state["last_extract"]["groups"] = recompute_groups_from_users(users)



def _slug_username(display_name: str) -> str:
    s = (display_name or "").strip().lower()
    s = re.sub(r"\s+", ".", s)
    s = re.sub(r"[^a-z0-9._-]", "", s)
    return s or "user"

from datetime import datetime, timezone

def _apply_import_row(display_name: str, business_role: str, ruoli: str):
    display_name = (display_name or "").strip()
    business_role = (business_role or "").strip()
    ruoli = (ruoli or "").strip()

    if not display_name or not business_role:
        return {"skipped": True}

    # Sorgente unica: last_extract
    state.setdefault("last_extract", {"ou": "", "users": [], "groups": [], "ts": None})
    base_users = state["last_extract"]["users"]

    # meta/config
    state.setdefault("role_meta", {})
    state.setdefault("business_roles", set())

    # mapping BR coerente con apply_business_roles (se lo usi)
    state.setdefault("user_business_role", {})
    # (opzionale: se ti serve ancora altrove)
    state.setdefault("br_assign", {})  # username -> BusinessRole

    # indicizza utenti esistenti
    by_display = {}
    by_username = {}
    for u in base_users:
        by_username[u.get("username")] = u
        dn = (u.get("displayName") or "").strip()
        if dn and dn not in by_display:
            by_display[dn] = u

    created_user = False
    created_role = False
    added_groups = 0

    # trova o crea utente
    uobj = by_display.get(display_name)
    if not uobj:
        base = _slug_username(display_name)
        uname = base
        i = 2
        while uname in by_username:
            uname = f"{base}{i}"
            i += 1

        uobj = {"username": uname, "displayName": display_name, "groups": []}
        base_users.append(uobj)
        by_username[uname] = uobj
        by_display[display_name] = uobj
        created_user = True

    uname = uobj["username"]

    # assegna business role (sia sul record utente che nel mapping)
    uobj["businessRole"] = business_role
    state["user_business_role"][uname] = business_role
    state["br_assign"][uname] = business_role  # opzionale compat

    # role registry + meta
    state["business_roles"].add(business_role)
    if business_role not in state["role_meta"]:
        r = random.randint(100, 255)
        g = random.randint(100, 255)
        b = random.randint(100, 255)
        color = f"{r:02x}{g:02x}{b:02x}".upper()
        if not color.startswith("#"):
                    color = "#" + color

        state["role_meta"][business_role] = {"color": color, "groups": []}
        created_role = True

    # Ruoli = gruppi (li metto sia sull'utente che (opzionale) in role_meta)
    groups = [g.strip() for g in ruoli.split(",") if g.strip()]
    if groups:
        # merge su utente (questo è ciò che impatta role mining/KPI)
        ug = set(uobj.get("groups") or [])
        before_u = len(ug)
        ug.update(groups)
        uobj["groups"] = sorted(ug)

        # (opzionale) aggiorna anche i gruppi “template” del business role
        existing = set(state["role_meta"][business_role].get("groups", []))
        before_r = len(existing)
        existing.update(groups)
        state["role_meta"][business_role]["groups"] = sorted(existing)

        # metrica: nuovi gruppi aggiunti al template (come facevi tu)
        added_groups = max(0, len(existing) - before_r)

    return {"created_user": created_user, "created_role": created_role, "added_groups": added_groups}


@app.post("/api/import/xlsx")
async def import_xlsx(file: UploadFile = File(...), username: str = Depends(require_auth)):
    raw = await file.read()
    wb = load_workbook(io.BytesIO(raw), read_only=True, data_only=True)
    ws = wb.active  # primo foglio

    rows = ws.iter_rows(values_only=True)
    header = next(rows, None)
    if not header:
        return {"ok": False, "error": "Empty Excel"}

    # mappa colonne (richiede intestazioni esatte)
    cols = {str(v).strip(): i for i, v in enumerate(header) if v is not None}
    required = ["DisplayName", "BusinessRole", "Ruoli"]
    if any(c not in cols for c in required):
        return {"ok": False, "error": f"Missing headers: {required}", "found": list(cols.keys())}

    created_users = 0
    created_roles = 0
    assigned_users = 0
    added_groups_total = 0

    for r in rows:
        dn = r[cols["DisplayName"]] if cols["DisplayName"] < len(r) else ""
        br = r[cols["BusinessRole"]] if cols["BusinessRole"] < len(r) else ""
        ru = r[cols["Ruoli"]] if cols["Ruoli"] < len(r) else ""

        out = _apply_import_row(str(dn or ""), str(br or ""), str(ru or ""))
        if out.get("skipped"):
            continue
        created_users += 1 if out.get("created_user") else 0
        created_roles += 1 if out.get("created_role") else 0
        assigned_users += 1
        added_groups_total += int(out.get("added_groups") or 0)

    return {
        "ok": True,
        "created_users": created_users,
        "created_roles": created_roles,
        "assigned_users": assigned_users,
        "added_groups": added_groups_total
    }

