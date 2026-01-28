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
import numpy as np
import csv, io, re
try:
    from ldap3 import ALL, NTLM, SIMPLE, Connection, Server, Tls, NONE
    import ssl
except Exception:
    Connection = None  # type: ignore


APP_TITLE = "Role Mining API"
JWT_SECRET = os.getenv("JWT_SECRET", "dev-secret")
APP_LOGIN_USER = os.getenv("APP_LOGIN_USER", "admin")
APP_LOGIN_PASS = os.getenv("APP_LOGIN_PASS", "admin123")
JWT_EXPIRE_MINUTES = int(os.getenv("JWT_EXPIRE_MINUTES", "240"))
MOCK_AD = os.getenv("MOCK_AD", "0") == "1"


from openpyxl import load_workbook
from collections import defaultdict

import re
from collections import defaultdict
from fastapi import HTTPException



# Cache dell’ultima esecuzione (serve per drilldown)

BROAD_MARKERS = ['all','tutti','tutte','full','global','everyone','any']

def _tokens(s: str) -> list[str]:
    s = (s or '').lower()
  # Treat underscore/dash like separators too, so VPN_ALL -> ["vpn","all"]
    s = s.replace('_', ' ').replace('-', ' ')
    s = re.sub(r'[^a-z0-9]', ' ', s)
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

def predict_redundant(broad_role: str, specific_role: str, family: str, user_groups: set[str]) -> float:
  bt = set(_tokens(broad_role))
  st = set(_tokens(specific_role))
  if not bt or not st:
    return 0.0

  # Similarità nome ruolo (Jaccard su token)
  j_role = len(bt & st) / max(1, len(bt | st))

  # Broadness
  b_is_broad = 1.0 if _is_broad(broad_role) else 0.0

  # Overlap token specific vs gruppi reali utente
  st2 = [t for t in st if len(t) >= 3]
  hits = 0
  for g in user_groups:
    gl = (g or "").lower()
    if any(t in gl for t in st2):
      hits += 1
  g_overlap = hits / max(1, len(user_groups))

  p = 0.55 * j_role + 0.30 * b_is_broad + 0.15 * g_overlap
  return float(max(0.0, min(1.0, p)))



def build_ai_detection_items(matrix: dict) -> list[dict]:
    items = []
    for uname, row in (matrix or {}).items():
        roles = [r for r, v in (row or {}).items() if int(v) == 1]
        user_groups = _matrix_user_roles(matrix, uname)

        fam = defaultdict(list)
        for r in roles:
            k = _family_key(r)
            if k:
                fam[k].append(r)

        for family, rs in fam.items():
            broad = [r for r in rs if _is_broad(r)]
            specific = [r for r in rs if not _is_broad(r)]
            
            if not broad or not specific:
                continue

            redundant = []
            kept = set(specific)

            for b in broad:
                probs = [predict_redundant(b, s, family, user_groups) for s in specific]
                p = max(probs) if probs else 0.0
                if p >= 0.50:
                    redundant.append(b)

            # Fallback: se hai broad + specific ma l'algoritmo non è sicuro, 
            # mostrali comunque come "sospetti" invece di nasconderli
            if not redundant and broad:
                 redundant = list(broad)
            
            if redundant:
                items.append({
                    "username": uname,
                    "family": family,
                    "redundantRoles": sorted(set(redundant)),
                    "keptRoles": sorted(list(kept)),
                    "redundantCount": len(set(redundant)),
                })

    # Ordina per chi ne ha di più
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
            "worstUsers": user_items[:500],  # top 50 driver
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

# --- Canonical keys (one source of truth) ---
state.setdefault("role_meta", {})
state.setdefault("business_roles", set())
state.setdefault("user_business_role", {})

# Stats unificati per qualità import (AD/CSV/XLSX)
state.setdefault("last_ingest_stats", {
    "source": None,
    "rowsTotal": 0,
    "rowsKept": 0,
    "duplicateDisplayName": 0,
    "missingDepartment": 0,
    "missingBusinessRole": 0,
    "missingDisplayName": 0,
    "missingUsername": 0,
    "ts": None,
})

# Back-compat (se ti è rimasto codice vecchio in giro)
state["rolemeta"] = state["role_meta"]
state["businessroles"] = state["business_roles"]
state["userbusinessrole"] = state["user_business_role"]


state.setdefault("last_rolemining_result", None)
state.setdefault("ingest_sources", {})          # es: {"ad":[...], "csv":[...], "xlsx":[...]}
state.setdefault("ingest_candidates", [])       # flatten di ingest_sources
state.setdefault("choice_by_displayName", {})   # displayName -> candidateId scelto
state.setdefault("mining_dirty", True)
state.setdefault("last_mining_params", {"n_clusters": None, "role_support": 0.6})
state.setdefault("last_rejects", {"source": "ad|csv", "reason": "...", "user": {...}, "ts": "..."})

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

def sync_roles_from_users(users: List[Dict[str, Any]]) -> int:
    """
    Registra in role_meta/business_roles tutti i BR presenti sugli utenti.
    Ritorna quanti BR nuovi sono stati creati.
    """
    role_meta = state.setdefault("role_meta", {})
    business_roles = state.setdefault("business_roles", set())
    created = 0

    for u in users or []:
        br = (u.get("businessRole") or "").strip()
        if not br or br == "Unassigned":
            continue
        if br not in role_meta:
            _ensure_role_registered(br)  # usa role_meta/business_roles
            created += 1
        business_roles.add(br)

    return created


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

from collections import defaultdict
import random

DEPT_MINCONF = 0.80
DEPT_GROUP_SUPPORT = 0.60

def ensure_role_registered(role: str) -> None:
    _ensure_role_registered(role)

DEPT_GROUP_SUPPORT = 0.60
DEPT_MINCONF = 0.80
DEPT_MERGE_JACCARD = 0.55  # soglia similarità gruppi dept vs BR template

def _jaccard(a: set[str], b: set[str]) -> float:
    if not a and not b:
        return 1.0
    return len(a & b) / max(1, len(a | b))

def apply_department_mapping(users: List[Dict[str, Any]]) -> None:
    # Prepara strutture coerenti
    state.setdefault("user_business_role", {})
    state.setdefault("role_meta", {})
    state.setdefault("business_roles", set())
    state.setdefault("dept_to_role", {})          # dept -> canonical BR
    state.setdefault("dept_role_analysis", {})    # dept -> evidence

    brdb_rebuild()

    by_dept = defaultdict(list)
    for u in users or []:
        dept = (u.get("department") or "").strip()
        if dept:
            by_dept[dept].append(u)

    role_meta = state["role_meta"]
    user_br = state["user_business_role"]
    dept_to_role = state["dept_to_role"]
    dept_analysis = state["dept_role_analysis"]

    for dept, members in by_dept.items():
        # 1) Baseline deterministica: BR = dept
        _ensure_role_registered(dept)

        # 2) Profilo gruppi frequenti del dipartimento
        n = max(1, len(members))
        cnt = defaultdict(int)
        for u in members:
            for g in (u.get("groups") or []):
                cnt[g] += 1
        dept_groups = {g for g, c in cnt.items() if (c / n) >= DEPT_GROUP_SUPPORT}

        # 3) Analisi: “votazione” ruolo macro dai gruppi utenti (BRDB)
        weights = defaultdict(float)
        for u in members:
            s = brdb_infer_groupset(u.get("groups") or [])
            r = (s.get("role") or "Unassigned").strip()
            c = float(s.get("confidence") or 0.0)
            if r and r != "Unassigned" and c > 0:
                weights[r] += c

        chosen_role = dept
        evidence = {
            "dept": dept,
            "members": len(members),
            "deptGroups": sorted(dept_groups),
            "chosenRole": dept,
            "reason": "baseline",
        }

        if weights:
            best_role, best_w = max(weights.items(), key=lambda x: x[1])
            total = sum(weights.values()) or 1.0
            conf = best_w / total

            role_groups = set((role_meta.get(best_role, {}) or {}).get("groups") or [])
            sim = _jaccard(dept_groups, role_groups) if role_groups else 1.0  # se non ho template ancora, non blocco

            evidence.update({
                "bestRole": best_role,
                "confidence": round(conf, 3),
                "jaccard": round(sim, 3),
                "weightsTop": sorted(weights.items(), key=lambda x: x[1], reverse=True)[:5],
            })

            # Merge automatico (come mi hai chiesto), ma solo sopra soglie
            if best_role != "Unassigned" and conf >= DEPT_MINCONF and sim >= DEPT_MERGE_JACCARD:
                chosen_role = best_role
                _ensure_role_registered(chosen_role)
                evidence["chosenRole"] = chosen_role
                evidence["reason"] = "merged_by_analysis"

        # 4) Consolidamento template BR: aggiungo gruppi frequenti dept al ruolo scelto
        existing = set((role_meta.get(chosen_role, {}) or {}).get("groups") or [])
        role_meta[chosen_role]["groups"] = sorted(existing | dept_groups)

        # 5) Salvo mapping dept->BR e assegno utenti
        dept_to_role[dept] = chosen_role
        dept_analysis[dept] = evidence

        for u in members:
            uname = u.get("username")
            if uname:
                user_br[uname] = chosen_role

    # applica mapping sugli oggetti utente
    apply_business_roles(users)

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


def pick_best_user(cands: List[Dict[str, Any]]) -> Dict[str, Any]:
    # regola: preferisci lastLogin più recente (se presente), poi "completezza" (dept+br), poi più gruppi
    def score(u: Dict[str, Any]) -> tuple:
        last = u.get("lastLogin") or u.get("last_login") or ""
        has_dept = 1 if (u.get("department") or "").strip() else 0
        has_br = 1 if (u.get("businessRole") or "").strip() else 0
        ng = len(u.get("groups") or [])
        return (last, has_dept + has_br, ng)
    return sorted(cands, key=score, reverse=True)[0]

def filter_and_dedupe_connector_users(raw_users: List[Dict[str, Any]], source: str) -> List[Dict[str, Any]]:
    rejects = []
    stats = state.setdefault("last_ingest_stats", {})
    stats.update({
        "source": source,
        "rowsTotal": int(len(raw_users or [])),
        "rowsKept": 0,
        "duplicateDisplayName": 0,
        "missingDepartment": 0,
        "missingBusinessRole": 0,
        "missingDisplayName": 0,
        "missingUsername": 0,
        "ts": datetime.now(timezone.utc).isoformat(),
    })

    by_dn = defaultdict(list)
    for u in (raw_users or []):
        if not (u.get("username") or "").strip():
            stats["missingUsername"] += 1
        dn = (u.get("displayName") or "").strip()
        if dn:
            by_dn[dn].append(u)
        else:
            stats["missingDisplayName"] += 1
            rejects.append({"source": source, "reason": "Missing displayName", "user": u, "ts": stats["ts"]})

    chosen = []
    for dn, cands in by_dn.items():
        u = pick_best_user(cands)

        if len(cands) > 1:
            stats["duplicateDisplayName"] += (len(cands) - 1)

        # log degli altri duplicati
        for other in cands:
            if other is u:
                continue
            rejects.append({"source": source, "reason": f"Duplicate displayName '{dn}' (kept best)", "user": other, "ts": stats["ts"]})

        dept = (u.get("department") or "").strip()
        br = (u.get("businessRole") or "").strip()

        if not dept:
            stats["missingDepartment"] += 1
            rejects.append({"source": source, "reason": "Missing department", "user": u, "ts": stats["ts"]})
        if not br:
            stats["missingBusinessRole"] += 1
            rejects.append({"source": source, "reason": "Missing businessRole", "user": u, "ts": stats["ts"]})

        chosen.append(u)

    stats["rowsKept"] = int(len(chosen))
    state["last_rejects"] = rejects
    return chosen


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
            if nu.get("department"):
                u["department"] = nu["department"]
            u["groups"] = sorted(set(nu.get("groups") or []))  # REPLACE da connettore

        else:
            base_users.append(nu)
            by_username[uname] = nu

    # riallinea campi derivati
    apply_business_roles(base_users)
    state["last_extract"]["ou"] = ou
    state["last_extract"]["groups"] = recompute_groups_from_users(base_users)
    state["last_extract"]["ts"] = datetime.now(timezone.utc).isoformat()


def replace_last_extract_from_connector(new_users: List[Dict[str, Any]], ou: str, source: str) -> None:
    clean: List[Dict[str, Any]] = []
    for u in (new_users or []):
        username = (u.get("username") or "").strip()
        if not username:
            continue
        clean.append({
            "username": username,
            "displayName": (u.get("displayName") or username).strip(),
            "groups": sorted(set(u.get("groups") or [])),
            "department": (u.get("department") or "").strip() or None,
            "businessRole": (u.get("businessRole") or "").strip() or None,
            "excluded": False,
        })

    state["last_extract"] = {
        "ou": ou,
        "users": clean,
        "groups": sorted({g for u in clean for g in (u.get("groups") or [])}),
        "ts": datetime.now(timezone.utc).isoformat(),
        "source": source,
    }

    # Non toccare qui user_business_role: lo ricreiamo dopo con l'auto-assegnazione
    state["mining_dirty"] = True

def rerun_auto_business_roles_after_connector(users: List[Dict[str, Any]]) -> None:
    # reset mapping
    state["user_business_role"] = {}
    for u in (users or []):
        u["businessRole"] = None

    # ricostruisci mapping usando dept + analisi merge
    apply_department_mapping(users)

    state["mining_dirty"] = True

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

    # state["last_extract"]["groups"] = recompute_groups_from_users(users)


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
def _mk_ldap_server(cfg: Dict[str, Any]) -> Server:
    raw = (cfg.get("server") or "").strip()
    if not raw:
        raise HTTPException(status_code=400, detail="Configura server LDAP")
    host = raw.replace("ldaps://", "").replace("ldap://", "").split(":")[0]

    # Self-signed Samba: come LDAPTLS_REQCERT=never
    tls = Tls(validate=ssl.CERT_NONE)

    return Server(host, port=636, use_ssl=True, tls=tls, get_info=NONE)


def extract_from_ldap(ou_dn: str) -> List[Dict[str, Any]]:
    if MOCK_AD or state["connector"]["server"] == "mock":
        # Ignora OU, ritorna dataset di test
        return mock_users()

    if Connection is None:
        raise HTTPException(status_code=500, detail="ldap3 non disponibile")

    cfg = state["connector"]
    if not cfg["server"] or not cfg["bind_user"] or not cfg["bind_password"]:
        raise HTTPException(status_code=400, detail="Configura server/bind_user/bind_password in Connettori")

    server = _mk_ldap_server(cfg)
    auth_mode = cfg.get("auth", "SIMPLE").upper()
    if auth_mode == "NTLM":
        conn = Connection(server, user=cfg["bind_user"], password=cfg["bind_password"], authentication=NTLM, auto_bind=True)
    else:
        conn = Connection(server, user=cfg["bind_user"], password=cfg["bind_password"], authentication=SIMPLE, auto_bind=True)

    # objectClass=user può includere account tecnici: in produzione aggiungere filtri più stretti
    search_filter = "(&(objectClass=user)(sAMAccountName=*))"
    attrs = ["sAMAccountName", "displayName", "memberOf", "department", "lastLogonTimestamp"]

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

        groups = []
        for dn in member_of:
            parts = str(dn).split(",")
            cn = next((p[3:] for p in parts if p.upper().startswith("CN=")), str(dn))
            groups.append(cn)

        dept = d.get("department") or [""]
        department = (dept[0] if isinstance(dept, list) else (dept or "")).strip() or None

        llt = d.get("lastLogonTimestamp")
        llt0 = llt[0] if isinstance(llt, list) and llt else llt
        last_login = str(llt0).strip() if llt0 is not None else None

        if username:
            users.append({
                "username": username,
                "displayName": display or username,
                "groups": sorted(set(groups)),
                "department": department,
                "lastLogin": last_login,
            })





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
        user_groups = _matrix_user_roles(matrix, uname)

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
            if not broad or not specific:
                continue

            red = 0
            for b in broad:
                probs = [predict_redundant(b, s, _family_key(b), user_groups) for s in specific]
                p = max(probs) if probs else 0.0
                if p >= 0.50:
                    red += 1

            if red > 0:
                redundant_assignments += red
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
        return {
            "totalUsers": 0,
            "overprivilegedPct": 0,
            "clusterQuality": 0,
            "clusteringQuality": 0,
            "roleCoverage": 0,
            "aiDetection": 0,
            "redundantAssignments": 0,
            "totalAssignments": 0,
            "usersWithRedundancy": 0,
        }

    # --- Overprivileged: top 10% per numero gruppi calcolato dalla matrix ---
    row_counts = np.array(
        [int(sum((row or {}).values())) for row in (matrix or {}).values()],
        dtype=np.int32
    )
    if row_counts.size == 0:
        return {
            "totalUsers": total_users,
            "overprivilegedPct": 0,
            "clusterQuality": 0,
            "clusteringQuality": 0,
            "roleCoverage": 0,
            "aiDetection": 0,
            "redundantAssignments": 0,
            "totalAssignments": 0,
            "usersWithRedundancy": 0,
        }

    k_top = int(np.ceil(0.1 * row_counts.size))
    k_top = max(1, k_top)

    thr = int(np.partition(row_counts, -k_top)[-k_top])

    overpriv = float((row_counts >= thr).mean() * 100.0)

    # --- AI detection (redundant broad roles) ---
    ai = compute_ai_detection(matrix)

    # --- RoleCoverage: roleGroups copre i gruppi reali (da matrix) dei membri ---
    cov_vals: list[float] = []
    for c in (clusters or []):
        role_groups = set(c.get("roleGroups") or [])
        members = c.get("members") or []
        for uname in members:
            row = matrix.get(uname) or {}
            denom = int(sum((row or {}).values()))
            if denom <= 0:
                cov_vals.append(0.0)
            else:
                covered = sum(int(row.get(g, 0)) for g in role_groups)
                cov_vals.append(covered / denom)

    role_coverage = float((np.mean(cov_vals) if cov_vals else 0.0) * 100.0)

    # --- clusterQuality = data-quality score (ingest) ---
    ingest = state.get("last_ingest_stats") or {}
    total = int(ingest.get("rowsTotal") or 0)

    if total > 0:
        dup = int(ingest.get("duplicateDisplayName") or 0)
        miss_dept = int(ingest.get("missingDepartment") or 0)
        miss_br = int(ingest.get("missingBusinessRole") or 0)
        miss_dn = int(ingest.get("missingDisplayName") or 0)
        miss_user = int(ingest.get("missingUsername") or 0)

        penalty = (
            1.00 * (dup / total) +
            0.70 * (miss_dept / total) +
            0.70 * (miss_br / total) +
            0.40 * (miss_dn / total) +
            0.40 * (miss_user / total)
        )
        penalty = min(1.0, penalty)
        cluster_quality = 100.0 * (1.0 - penalty)
    else:
        cluster_quality = 100.0

    # --- clusteringQuality = qualità clustering (purity media pesata) ---
    if clusters:
        total_sz = sum(int(c.get("size") or len(c.get("members") or [])) for c in clusters) or 1
        weighted = 0.0
        for c in clusters:
            sz = int(c.get("size") or len(c.get("members") or []))
            weighted += float(c.get("purity") or 0.0) * sz
        clustering_quality = (weighted / total_sz) * 100.0
    else:
        clustering_quality = 0.0

    return {
        "totalUsers": total_users,
        "overprivilegedPct": round(overpriv, 2),
        "clusterQuality": round(float(cluster_quality), 2),
        "clusteringQuality": round(float(clustering_quality), 2),
        "aiDetection": ai.get("aiDetection", 0),
        "redundantAssignments": ai.get("redundantAssignments", 0),
        "totalAssignments": ai.get("totalAssignments", 0),
        "usersWithRedundancy": ai.get("usersWithRedundancy", 0),
        "roleCoverage": round(float(role_coverage), 2),
    }


def run_role_mining(
    users: List[Dict[str, Any]],
    n_clusters: Optional[int],
    role_support: float
) -> Dict[str, Any]:
    # usa solo utenti attivi
    users = [u for u in (users or []) if not u.get("excluded")]

    usernames, groups, X = build_matrix(users)

    # Colonne UI = gruppi snapshot (ultima estrazione) → NON dipendono dalle assegnazioni correnti
    snapshot_groups = ((state.get("last_extract") or {}).get("groups") or []).copy()
    snapshot_groups = [g for g in snapshot_groups if g]  # safety

    # Se lo snapshot è vuoto (es. mai estratto), fallback ai gruppi del build_matrix
    all_groups_ui = groups

    # dataset troppo piccolo
    if len(usernames) < 2 or len(groups) == 0:
        return {
            "clusters": [],
            "matrix": {},
            "kpi": compute_kpis(users, [], {}),
            "groups": all_groups_ui,
        }

    # scegli k
    auto_k = max(2, int(round(np.sqrt(len(usernames)))))
    k = int(n_clusters) if n_clusters else min(8, auto_k, len(usernames))

    # clustering su distanza Jaccard precomputed
    D = jaccard_distance_matrix(X)
    model = AgglomerativeClustering(n_clusters=k, metric="precomputed", linkage="average")
    labels = model.fit_predict(D)

    # clusters -> members/roleGroups/purity
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

    # matrix for UI (DEVE avere tutte le colonne di all_groups_ui)
    # mapping per i gruppi presenti in X
    gindex = {g: j for j, g in enumerate(groups)}

    matrix: Dict[str, Dict[str, int]] = {}
    for i, uname in enumerate(usernames):
        row: Dict[str, int] = {}
        for g in all_groups_ui:
            j = gindex.get(g)
            row[g] = int(X[i, j]) if j is not None else 0
        matrix[uname] = row

    kpi = compute_kpis(users, clusters, matrix)

    return {
        "clusters": clusters,
        "matrix": matrix,
        "kpi": kpi,
        "groups": all_groups_ui,
    }


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
        "http://localhost:5174",  # dev
        "http://127.0.0.1:5173",
        "*",  # ← PER TEST (rimuovi in PROD)
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/api/kpi/drilldown")
def kpidrilldown_q(metric: str, username: str = Depends(require_auth)):
    return kpi_drilldown(metric, username)



@app.get("/api/health")
def health():
    return {"ok": True, "ts": int(time.time())}


class ToggleUserGroupRequest(BaseModel):
    username: str
    group: str
    enabled: bool  # True=assegna, False=rimuovi


@app.post("/api/users/groups/toggle")
def toggle_user_group(body: ToggleUserGroupRequest, username: str = Depends(require_auth)):
    # 1) trova utente nello stato
    users = (state.get("last_extract") or {}).get("users") or []
    uobj = next((u for u in users if u.get("username") == body.username), None)
    if not uobj:
        raise HTTPException(status_code=404, detail="User not found")

    # 2) valida gruppo (e impedisci di “resuscitare” gruppi non più nello snapshot AD/CSV)
    g = (body.group or "").strip()
    if not g:
        raise HTTPException(status_code=400, detail="Group empty")

    snapshot_groups = set(((state.get("last_extract") or {}).get("groups") or []))
    if snapshot_groups and g not in snapshot_groups:
        raise HTTPException(status_code=400, detail="Group not in last extract snapshot")

    # 3) toggle
    current = set(uobj.get("groups") or [])
    if body.enabled:
        current.add(g)
    else:
        current.discard(g)

    uobj["groups"] = sorted(current)

    # IMPORTANTISSIMO: NON aggiornare state["last_extract"]["groups"] qui
    state["mining_dirty"] = True
    return {"ok": True, "username": body.username, "group": g, "enabled": body.enabled}


@app.post("/api/auth/login", response_model=TokenResponse)
def login(body: LoginRequest):
    if body.username != APP_LOGIN_USER or body.password != APP_LOGIN_PASS:
        raise HTTPException(status_code=401, detail="Credenziali non valide")
    token = create_access_token(body.username)
    log("INFO", f"Login OK {body.username}")
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

        # 2) DB di sistema: MERGE (AD dentro pool esistente, senza distruggere CSV) + stats per ClusterQuality
    users = filter_and_dedupe_connector_users(users, source="ad")

    # merge su username (state["last_extract"]["users"] è una LISTA)
    existing_list = (state.get("last_extract") or {}).get("users") or []
    existing_by_uname = {u.get("username"): u for u in existing_list if u.get("username")}

    added_users = 0
    updated_users = 0

    for u in users:
        uname = u.get("username")
        if not uname:
            continue

        if uname in existing_by_uname:
            cur = existing_by_uname[uname]
            # merge gruppi: unione, non overwrite
            cur["groups"] = sorted(set((cur.get("groups") or []) + (u.get("groups") or [])))
            # aggiorna campi “anagrafici” se arrivano da AD
            for k in ["displayName", "department", "businessRole", "lastLogin"]:
                if u.get(k) is not None and u.get(k) != "":
                    cur[k] = u.get(k)
            updated_users += 1
        else:
            existing_by_uname[uname] = u
            added_users += 1

    merged_users = list(existing_by_uname.values())

    state.setdefault("last_extract", {})
    state["last_extract"]["users"] = merged_users
    state["last_extract"]["ou"] = req.ou
    state["last_extract"]["groups"] = sorted({g for uu in merged_users for g in (uu.get("groups") or [])})
    state["last_extract"]["ts"] = time.time()

    # auto-assegnazione BR post-import + sync BR catalog
    rerun_auto_business_roles_after_connector(state["last_extract"]["users"])
    new_brs = sync_roles_from_users(state["last_extract"]["users"])

    # IMPORTANTISSIMO: stats per la pagina Cluster Quality (come CSV)
    ad_users = state["last_extract"]["users"]
    missing_dept = sum(1 for uu in ad_users if not (uu.get("department") or "").strip())
    missing_roles = sum(1 for uu in ad_users if not (uu.get("groups") or []))

    state["last_ingest_stats"] = {
        "source": "ad",
        "rowsTotal": len(ad_users),          # record AD letti (post filter/dedupe)
        "rowsKept": len(merged_users),        # record a sistema dopo merge
        "duplicateDisplayName": 0,        # se vuoi calcolarlo, aggiungilo qui
        "missingDepartment": missing_dept,
        "missingDisplayName": 0,
        "missingUsername": 0,
        "missingRoles": missing_roles,
        "addedUsers": added_users,
        "updatedUsers": updated_users,
        "ts": datetime.now(timezone.utc).isoformat(),
    }




    # 3) Ingest sources: aggiorna solo lo slice AD (non distruggere gli altri)
    state.setdefault("ingest_sources", {})
    state["ingest_sources"]["ad"] = ad_candidates

    # NON fare questo:
    # state["ingest_sources"] = {"ad": ad_candidates}
    # state["choice_by_displayName"] = {}

    rebuild_ingest_candidates()
    apply_duplicate_displayname_resolution()
    state["mining_dirty"] = True
    
    users = active_users(state['last_extract']['users'])
    res = run_role_mining(users, None, 0.6)
    state['last_mining'] = res


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

@app.get("/api/users/{uname}")
def get_user(uname: str, username: str = Depends(require_auth)):
    users = state.get("last_extract", {}).get("users") or []
    u = next((x for x in users if x.get("username") == uname), None)
    if not u:
        raise HTTPException(status_code=404, detail="User not found")

    apply_business_roles(users)  # riallinea businessRole
    return {"user": u, "allGroups": recompute_groups_from_users(users)}


class UserUpdateRequest(BaseModel):
    groups: List[str] = []
    businessRole: Optional[str] = None  # se vuoi cambiarlo dalla stessa pagina

@app.post("/api/users/{uname}/update")
def update_user(uname: str, body: UserUpdateRequest, username: str = Depends(require_auth)):
    users = state.get("last_extract", {}).get("users") or []
    u = next((x for x in users if x.get("username") == uname), None)
    if not u:
        raise HTTPException(status_code=404, detail="User not found")

    # Replace groups
    u["groups"] = sorted({g.strip() for g in (body.groups or []) if g and g.strip()})

    # (Opzionale) cambia anche BR qui, oppure continua a usare /api/businessroles/{role}/add
    if body.businessRole is not None:
        br = body.businessRole.strip()
        u["businessRole"] = br
        state.setdefault("user_business_role", {})
        if br and br != "Unassigned":
            state["user_business_role"][uname] = br
        else:
            # rimuovi mapping => torna Unassigned
            if uname in state["user_business_role"]:
                del state["user_business_role"][uname]

        # training “forte” come fai già in businessroles/roleadd
        try:
            brdb_learn_assignment(br, u.get("groups") or [], weight=10)
        except Exception:
            pass

    # riallinea derivati
    apply_business_roles(users)
    # state["last_extract"]["groups"] = recompute_groups_from_users(users)
    state["mining_dirty"] = True

    return {"ok": True, "user": u}


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
        return {
            "metric": "cluster-quality",
            "items": build_cluster_quality_items(...),
            "rejects": state.get("last_rejects") or []
            }
    
    if metric == "cluster-quality":
        clusters = state.get("last_mining", {}).get("clusters", [])
        matrix = state.get("last_mining", {}).get("matrix", {})
        return {
            "metric": "cluster-quality",
            "items": build_cluster_quality_items(clusters, matrix),  # dal paste.txt
            "stats": state.get("last_ingest_stats", {})  # aggiunge stats
        }

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
    
    if department:
        uobj["department"] = department

    
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


DEPT_MINCONF = 0.80

def _ensure_role_registered(role: str) -> None:
    role = (role or "").strip()
    if not role:
        return

    state.setdefault("role_meta", {})
    state.setdefault("business_roles", set())

    if role not in state["role_meta"]:
        r = random.randint(100, 255)
        g = random.randint(100, 255)
        b = random.randint(100, 255)
        color = f"{r:02x}{g:02x}{b:02x}".upper()
        if not color.startswith("#"):
            color = "#" + color
        state["role_meta"][role] = {"color": color, "groups": []}

    state["business_roles"].add(role)

def apply_department_mapping_if_missing(users: list[dict]) -> None:
    # usa BRDB già presente (inference sui gruppi)
    brdb_rebuild()

    by_dept = defaultdict(list)
    for u in (users or []):
        dept = (u.get("department") or "").strip()
        if dept:
            by_dept[dept].append(u)

    for dept, members in by_dept.items():
        weights = defaultdict(float)

        for u in members:
            s = brdb_infer_groupset(u.get("groups") or [])
            role = (s.get("role") or "Unassigned").strip()
            conf = float(s.get("confidence") or 0.0)
            if role and role != "Unassigned" and conf > 0:
                weights[role] += conf

        if weights:
            best_role, best_w = max(weights.items(), key=lambda x: x[1])
            total = sum(weights.values()) or 1.0
            dept_conf = best_w / total
        else:
            best_role, dept_conf = "Unassigned", 0.0

        chosen_role = best_role if (best_role != "Unassigned" and dept_conf >= DEPT_MINCONF) else dept
        _ensure_role_registered(chosen_role)

        # assegna SOLO se l'utente non ha già BR assegnato
        state.setdefault("user_business_role", {})
        for u in members:
            uname = u.get("username")
            if not uname:
                continue

            already = (state.get("user_business_role") or {}).get(uname)
            if already:
                continue

            # se per qualche motivo è già valorizzato sul record utente, non sovrascrivere
            if (u.get("businessRole") or "").strip():
                continue

            state["user_business_role"][uname] = chosen_role



@app.post("/api/import/csv")
async def import_csv(file: UploadFile = File(...), username: str = Depends(require_auth)):
    raw = await file.read()
    if not raw:
        raise HTTPException(status_code=400, detail="File vuoto")

    text = raw.decode("utf-8-sig", errors="replace")
    reader = csv.DictReader(io.StringIO(text), delimiter=";", skipinitialspace=True)

    if reader.fieldnames:
        reader.fieldnames = [h.strip() for h in reader.fieldnames if h is not None]

    # minimo indispensabile
    if not reader.fieldnames:
        raise HTTPException(status_code=400, detail="CSV senza header")

    norm_fields = { (h or "").strip().lower() for h in reader.fieldnames }
    if "displayname" not in norm_fields:
        raise HTTPException(
            status_code=400,
            detail=f"Headers richiesti: ['DisplayName']; trovati: {reader.fieldnames}",
        )

    # ---------- helpers robusti ----------
    def _norm_header(h: str) -> str:
        return (h or "").strip().lower()

    def _get_any(row_ci: dict, keys: list[str]) -> str:
        for k in keys:
            if k in row_ci and row_ci.get(k) is not None:
                return str(row_ci.get(k))
        return ""

    CSV_KEYS = {
        "displayName": ["displayname", "display name", "name", "utente", "user"],
        "department": ["department", "dept", "dipartimento", "area", "funzione"],
        "businessRole": ["businessrole", "business role", "br", "ruolo business", "ruolo_business"],
        "roles": ["ruoli", "roles", "groups", "gruppi", "entitlements"],
    }

    def _extract_csv_fields(row: dict) -> tuple[str, str, str, str, str]:
        # view case-insensitive
        row_ci = {_norm_header(k): v for k, v in (row or {}).items()}

        dnraw = _get_any(row_ci, CSV_KEYS["displayName"])
        deptraw = _get_any(row_ci, CSV_KEYS["department"])
        brraw = _get_any(row_ci, CSV_KEYS["businessRole"])
        rolesraw = _get_any(row_ci, CSV_KEYS["roles"])

        dn = (dnraw or "").strip()
        dept = (deptraw or "").strip()
        br = (brraw or "").strip()
        roles = (rolesraw or "").strip()

        # tollera righe sbagliate tipo: "Alice Rossi,IT;VPN,GitLab"
        if (not dept) and dn and ("," in dn):
            dn, dept = [x.strip() for x in dn.split(",", 1)]

        # fallback intelligente: se non c'è BR esplicito usa Department come BR
        if not br:
            br = dept

        return dnraw, dn, dept, br, roles

    # ---------- reset slice CSV ingest ----------
    state.setdefault("ingest_sources", {})
    state["ingest_sources"]["csv"] = []  # replace slice CSV

    state["last_csv_rows"] = []
    state["csv_choice_by_dn"] = {}
    state["csv_rows_by_dn"] = defaultdict(list)

    # ---------- stats ingest (righe) ----------
    csv_rows_total = 0
    csv_dup_dn_rows = 0
    csv_missing_displayname = 0
    csv_missing_department = 0
    csv_missing_businessrole = 0  # dopo fallback BR=dept
    csv_missing_roles = 0

    seen_dn_raw = set()

    new_users: List[Dict[str, Any]] = []
    seen_usernames: set[str] = set()

    for row in reader:
        csv_rows_total += 1
        row_id = f"csv:{csv_rows_total}"

        dnraw, dn, dept, br, roles = _extract_csv_fields(row)

        if not dn:
            csv_missing_displayname += 1
            continue

        if dnraw in seen_dn_raw:
            csv_dup_dn_rows += 1
        else:
            seen_dn_raw.add(dnraw)

        if not dept:
            csv_missing_department += 1

        if not br:
            csv_missing_businessrole += 1

        parsed_roles = [g.strip() for g in (roles or "").split(",") if g.strip()]
        if not parsed_roles:
            csv_missing_roles += 1

        # username stabile e deduplicato
        base = _slug_username(dn)
        uname = base
        i = 2
        while uname in seen_usernames:
            uname = f"{base}{i}"
            i += 1
        seen_usernames.add(uname)

        new_users.append({
            "username": uname,
            "displayName": dn,
            "groups": parsed_roles,
            "department": dept or None,
            "businessRole": br or None,
            "excluded": False,
            "lastLogin": None,
        })

        rec = {
            "rowId": row_id,
            "displayName": dn,
            "displayNameRaw": dnraw,
            "businessRole": br,
            "department": dept,
            "roles": parsed_roles,
            "rawLine": f"{dnraw};{dept};{roles}",
        }
        state["last_csv_rows"].append(rec)
        state["csv_rows_by_dn"][dnraw].append(row_id)
        state["csv_choice_by_dn"].setdefault(dnraw, row_id)

        candidate = _mk_candidate(
            source="csv",
            candidate_id=row_id,
            display_name=dn,
            business_role=br,
            roles=parsed_roles,
            raw=rec["rawLine"],
        )
        state["ingest_sources"]["csv"].append(candidate)

        state.setdefault("choice_by_displayName", {})
        state["choice_by_displayName"].setdefault(candidate["displayName"], candidate["candidateId"])

    # ---------- REPLACE: dedupe + last_extract ----------
    # ---------- MERGE con existing (AD + prev CSV) ----------
        existing_users_list = state.get("last_extract", {}).get("users", [])
        existing_users_dict = {
            user.get("username", _slug_username(user.get("displayName", f"user_{i}"))): user
            for i, user in enumerate(existing_users_list)
        }

        added_users = 0
        updated_users = 0
        created_brs = set()

        for user in new_users:
            uname = user["username"]
            if uname in existing_users_dict:
                # MERGE: append gruppi unici, aggiorna BR/dept
                existing_users_dict[uname]["groups"] = sorted(
                    set(existing_users_dict[uname].get("groups", []) + user["groups"])
                )
                if user.get("businessRole"):
                    existing_users_dict[uname]["businessRole"] = user["businessRole"]
                if user.get("department"):
                    existing_users_dict[uname]["department"] = user["department"]
                updated_users += 1
            else:
                existing_users_dict[uname] = user.copy()  # evita mutazioni
                added_users += 1
            
            if user.get("businessRole"):
                created_brs.add(user["businessRole"])

        # Lista finale merged (compatibile con tuo codice)
        merged_users = list(existing_users_dict.values())

        # Salva in state
        state["last_extract"]["users"] = merged_users
        if 'recompute_groups_from_users' in globals():
            state["last_extract"]["groups"] = recompute_groups_from_users(merged_users)
        state["last_extract"]["ou"] = "MERGED"
        state["last_extract"]["ts"] = time.time()

        # Stats UPDATE (sovrascrivi quelle vecchie)
        state["last_ingest_stats"] = {
            **state.get("last_ingest_stats", {}),
            "rowsKept": len(merged_users),
            "addedUsers": added_users,
            "updatedUsers": updated_users,
            "newBusinessRoles": len(created_brs),
            "source": "csv_merged"
        }


    # auto-assegnazione BR post-import (dept, rolemeta, brdb...)
    rerun_auto_business_roles_after_connector(state["last_extract"]["users"])

    # registra BR trovati sugli utenti in role_meta/business_roles
    new_brs = sync_roles_from_users(state["last_extract"]["users"])

    # stats qualità import (per clusterQuality)
    state["last_ingest_stats"] = {
        "source": "csv",
        "rowsTotal": csv_rows_total,
        "rowsKept": len(merged_users),
        "duplicateDisplayName": csv_dup_dn_rows,
        "missingDepartment": csv_missing_department,
        "missingBusinessRole": csv_missing_businessrole,
        "missingDisplayName": csv_missing_displayname,
        "missingUsername": 0,
        "missingRoles": csv_missing_roles,
        "ts": datetime.now(timezone.utc).isoformat(),
    }

    # tieni anche last_csv_stats se la UI ancora lo usa
    state["last_csv_stats"] = {
        "csvRowsTotal": csv_rows_total,
        "csvRowsMissingBR": csv_missing_businessrole,
        "csvDuplicateDisplayNameRows": csv_dup_dn_rows,
        "by": username,
        "ts": datetime.now(timezone.utc).isoformat(),
    }

    rebuild_ingest_candidates()
    apply_duplicate_displayname_resolution()
    state["mining_dirty"] = True

    log(
        "INFO",
        f"CSV import by {username}: rows={csv_rows_total}, kept={len(merged_users)}, "
        f"dupRows={csv_dup_dn_rows}, missingDept={csv_missing_department}, "
        f"missingBR={csv_missing_businessrole}, missingRoles={csv_missing_roles}, newBRs={new_brs}"
    )

    return {
    "ok": True,
    "addedUsers": added_users,
    "updatedUsers": updated_users,
    "totalUsers": len(merged_users),

    # numeriche "stabili" (quelle che il frontend userà)
    "rowsTotal": int(csv_rows_total),
    "rowsKept": int(len(existing_users_dict)),
    "newBusinessRoles": int(new_brs),

    # back-compat (se in giro hai ancora frontend/pezzi vecchi)
    "csvRowsTotal": int(csv_rows_total),
    "csvRowsMissingBR": int(csv_missing_businessrole),
    "csvDuplicateDisplayNameRows": int(csv_dup_dn_rows),

    # opzionali ma utili per messaggio UI e debug
    "created_users": int(max(0, len(existing_users_dict))),   # qui puoi mettere un contatore reale se lo calcoli
    "assigned_users": int(max(0, len(existing_users_dict))),  # idem: se assegni sempre un BR post-fallback, coincide
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

def applyimportrow(displayname: str, businessrole: str, ruoli: str, department: str = ""):
    displayname = (displayname or "").strip()
    businessrole = (businessrole or "").strip()
    ruoli = (ruoli or "").strip()
    department = (department or "").strip()

    if not displayname:
        return {"skipped": True}


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

