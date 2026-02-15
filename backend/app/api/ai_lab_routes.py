import csv
import io
import time
from collections import Counter, defaultdict
from datetime import datetime, timezone
from typing import Any, Callable, Dict, List, Optional, Tuple

import numpy as np
from fastapi import BackgroundTasks, Depends, FastAPI, File, HTTPException, UploadFile
from pydantic import BaseModel, Field


class TimelineRunRequest(BaseModel):
    model_name: str = "account-type-classifier"
    note: Optional[str] = None


class AbPlaygroundRequest(BaseModel):
    model_a: str = "baseline-v1"
    model_b: str = "candidate-v2"
    sample_size: int = 400


class SyntheticGenerateRequest(BaseModel):
    count: int = 30
    scenario: str = "mixed"
    persist: bool = True


class FeedbackEventRequest(BaseModel):
    username: str
    predicted_type: str
    corrected_type: str
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)
    note: Optional[str] = None


def _safe_dist(values: List[str]) -> Dict[str, float]:
    total = max(1, len(values))
    cnt = Counter([str(v or "unknown").strip().lower() for v in values])
    return {k: v / total for k, v in cnt.items()}


def _psi(base: Dict[str, float], current: Dict[str, float]) -> float:
    eps = 1e-6
    keys = set(base.keys()) | set(current.keys())
    out = 0.0
    for k in keys:
        b = max(eps, float(base.get(k, 0.0)))
        c = max(eps, float(current.get(k, 0.0)))
        out += (c - b) * np.log(c / b)
    return float(out)


def _default_timeline_entry(ml_engine: Any) -> Dict[str, Any]:
    st = ml_engine.get_status() or {}
    return {
        "id": f"seed-{int(time.time()*1000)}",
        "ts": datetime.now(timezone.utc).isoformat(),
        "triggeredBy": "system",
        "datasetSize": int((st.get("training_data") or {}).get("total_samples") or 0),
        "modelName": "account-type-classifier",
        "status": "success",
        "metrics": {
            "accuracy": float((st.get("model") or {}).get("accuracy") or 0.0),
            "f1": float((st.get("model") or {}).get("f1") or 0.0),
            "precision": float((st.get("model") or {}).get("precision") or 0.0),
            "recall": float((st.get("model") or {}).get("recall") or 0.0),
        },
        "note": "Snapshot iniziale",
    }


def _simulate_quality_for_model(model_name: str, users: List[Dict[str, Any]], sample_size: int) -> Dict[str, Any]:
    pool = users[:max(1, min(len(users), sample_size))]
    if not pool:
        return {"accuracy": 0.0, "precision": 0.0, "recall": 0.0, "f1": 0.0, "size": 0}
    base = 0.79
    if "candidate" in model_name.lower() or "v2" in model_name.lower():
        base += 0.02
    if "xgboost" in model_name.lower():
        base += 0.015
    if "legacy" in model_name.lower():
        base -= 0.03
    penalties = 0.0
    for u in pool:
        if not (u.get("department") or "").strip():
            penalties += 0.002
        if len(u.get("groups") or []) == 0:
            penalties += 0.002
    acc = max(0.45, min(0.98, base - penalties / max(1, len(pool))))
    prec = max(0.0, min(1.0, acc - 0.01))
    rec = max(0.0, min(1.0, acc - 0.015))
    f1 = (2 * prec * rec / (prec + rec)) if (prec + rec) > 0 else 0.0
    return {
        "accuracy": round(acc, 4),
        "precision": round(prec, 4),
        "recall": round(rec, 4),
        "f1": round(f1, 4),
        "size": len(pool),
    }


def _guess_csv_delimiter(text: str) -> str:
    header = (text.splitlines() or [""])[0]
    if header.count(";") >= header.count(","):
        return ";"
    return ","


def _ab_norm_header(h: str) -> str:
    return (h or "").strip().lower().replace("_", "").replace(" ", "")


def _ab_get(row_ci: Dict[str, Any], keys: List[str]) -> str:
    for k in keys:
        v = row_ci.get(_ab_norm_header(k))
        if v is not None:
            return str(v)
    return ""


def _build_matrix_from_users(users: List[Dict[str, Any]]) -> Tuple[Dict[str, Dict[str, int]], List[str]]:
    all_groups = sorted({g for u in users for g in (u.get("groups") or [])})
    matrix: Dict[str, Dict[str, int]] = {}
    for u in users:
        uname = str(u.get("username") or "")
        ug = set(u.get("groups") or [])
        matrix[uname] = {g: (1 if g in ug else 0) for g in all_groups}
    return matrix, all_groups


def _parse_users_from_csv_bytes(
    raw: bytes,
    dataset_name: str,
    normalize_last_login: Callable[[Any], Optional[str]],
    slug_username: Callable[[str], str],
    classify_account: Callable[..., str],
) -> Dict[str, Any]:
    text = raw.decode("utf-8-sig", errors="replace")
    delim = _guess_csv_delimiter(text)
    reader = csv.DictReader(io.StringIO(text), delimiter=delim, skipinitialspace=True)
    rows = list(reader)

    key_map = {
        "displayName": ["displayname", "display name", "name"],
        "username": ["username", "userprincipalname", "samaccountname", "login"],
        "department": ["department", "dept", "dipartimento"],
        "businessRole": ["businessrole", "business role", "br"],
        "roles": ["ruoli", "roles", "groups", "gruppi", "entitlements"],
        "accountType": ["accounttype", "account type", "type"],
        "lastLogin": ["lastlogon", "lastlogin", "last login", "last_logon"],
    }

    users: List[Dict[str, Any]] = []
    seen_usernames = set()
    missing_display = 0
    missing_department = 0
    missing_business_role = 0
    zero_groups = 0
    invalid_last_login = 0

    by_dn = defaultdict(list)
    for row in rows:
        row_ci = {_ab_norm_header(k): v for k, v in (row or {}).items()}
        dn = (_ab_get(row_ci, key_map["displayName"]) or "").strip()
        if not dn:
            missing_display += 1
            continue
        uname = (_ab_get(row_ci, key_map["username"]) or "").strip()
        dept = (_ab_get(row_ci, key_map["department"]) or "").strip()
        br = (_ab_get(row_ci, key_map["businessRole"]) or "").strip()
        roles_raw = (_ab_get(row_ci, key_map["roles"]) or "").strip()
        atype = (_ab_get(row_ci, key_map["accountType"]) or "").strip() or "Internal"
        ll_raw = (_ab_get(row_ci, key_map["lastLogin"]) or "").strip()
        ll = normalize_last_login(ll_raw or None)
        if ll_raw and not ll:
            invalid_last_login += 1

        groups = [g.strip() for g in roles_raw.split(",") if g and g.strip()]
        if not groups:
            zero_groups += 1
        if not dept:
            missing_department += 1
        if not br:
            missing_business_role += 1
            br = dept or "Unassigned"

        if not uname:
            uname = slug_username(dn)
        base = uname
        n = 2
        while uname in seen_usernames:
            uname = f"{base}{n}"
            n += 1
        seen_usernames.add(uname)

        u = {
            "username": uname,
            "displayName": dn,
            "department": dept,
            "businessRole": br,
            "groups": groups,
            "accountType": atype or classify_account(dn, dept, ""),
            "lastLogin": ll,
            "excluded": False,
        }
        users.append(u)
        by_dn[dn.strip().lower()].append(u)

    duplicate_displayname_rows = sum(max(0, len(v) - 1) for v in by_dn.values())
    return {
        "name": dataset_name,
        "users": users,
        "rowsTotal": len(rows),
        "missingDisplayName": missing_display,
        "missingDepartment": missing_department,
        "missingBusinessRole": missing_business_role,
        "zeroGroupsUsers": zero_groups,
        "invalidLastLogin": invalid_last_login,
        "duplicateDisplayNameRows": duplicate_displayname_rows,
    }


def _compute_dataset_scores_from_users(
    dataset: Dict[str, Any],
    compute_model_quality: Callable[[List[Dict[str, Any]], Dict[str, Dict[str, int]], List[str]], Dict[str, Any]],
    run_smart_ai_detection: Callable[[List[Dict[str, Any]], Dict[str, Dict[str, int]]], Dict[str, Any]],
) -> Dict[str, Any]:
    users = dataset.get("users") or []
    total = max(1, len(users))
    matrix, groups = _build_matrix_from_users(users)
    mq = compute_model_quality(users, matrix, groups)
    ai = run_smart_ai_detection(users, matrix)

    metrics = {
        "rows_total": len(users),
        "duplicate_displayname_rows": int(dataset.get("duplicateDisplayNameRows") or 0),
        "missing_department": int(dataset.get("missingDepartment") or 0),
        "missing_business_role": int(dataset.get("missingBusinessRole") or 0),
        "zero_groups_users": int(dataset.get("zeroGroupsUsers") or 0),
        "invalid_last_login": int(dataset.get("invalidLastLogin") or 0),
        "stale_users": int(len(mq.get("staleList") or [])),
        "overprivileged_users": int(len(mq.get("overprivilegedList") or [])),
        "policy_violations": int(len(mq.get("policyViolations") or [])),
        "ambiguous_users": int(len(mq.get("ambiguousUsers") or [])),
        "ai_anomaly_users": int((ai.get("stats") or {}).get("usersWithAnomaly") or 0),
        "model_quality_score": float(mq.get("modelQuality") or 0.0),
    }

    rates = {
        "dup": metrics["duplicate_displayname_rows"] / total,
        "miss_dept": metrics["missing_department"] / total,
        "miss_br": metrics["missing_business_role"] / total,
        "zero": metrics["zero_groups_users"] / total,
        "invalid_ll": metrics["invalid_last_login"] / total,
        "stale": metrics["stale_users"] / total,
        "over": metrics["overprivileged_users"] / total,
        "policy": metrics["policy_violations"] / total,
        "amb": metrics["ambiguous_users"] / total,
        "ai": metrics["ai_anomaly_users"] / total,
    }
    score = 100.0 * (
        0.33 * (metrics["model_quality_score"] / 100.0)
        + 0.09 * (1.0 - min(1.0, rates["dup"]))
        + 0.08 * (1.0 - min(1.0, rates["miss_dept"]))
        + 0.08 * (1.0 - min(1.0, rates["miss_br"]))
        + 0.08 * (1.0 - min(1.0, rates["zero"]))
        + 0.07 * (1.0 - min(1.0, rates["invalid_ll"]))
        + 0.07 * (1.0 - min(1.0, rates["stale"]))
        + 0.07 * (1.0 - min(1.0, rates["over"]))
        + 0.06 * (1.0 - min(1.0, rates["policy"]))
        + 0.07 * (1.0 - min(1.0, rates["amb"]))
        + 0.10 * (1.0 - min(1.0, rates["ai"]))
    )
    score = max(0.0, min(100.0, score))

    return {
        "name": dataset.get("name"),
        "score": round(score, 2),
        "metrics": metrics,
    }


def register_ai_lab_routes(
    app: FastAPI,
    *,
    state: Any,
    response_cache: Any,
    require_auth: Callable[..., Any],
    invalidate_hot_caches: Callable[..., None],
    active_users: Callable[[List[Dict[str, Any]]], List[Dict[str, Any]]],
    ml_engine: Any,
    normalize_last_login: Callable[[Any], Optional[str]],
    slug_username: Callable[[str], str],
    classify_account: Callable[..., str],
    compute_model_quality: Callable[[List[Dict[str, Any]], Dict[str, Dict[str, int]], List[str]], Dict[str, Any]],
    run_smart_ai_detection: Callable[[List[Dict[str, Any]], Dict[str, Dict[str, int]]], Dict[str, Any]],
    record_llm_learning_event: Callable[..., Dict[str, Any]],
    record_manual_user_change: Callable[..., Dict[str, Any]],
) -> None:
    def _ai_lab_users() -> List[Dict[str, Any]]:
        return active_users(state.get("last_extract", {}).get("users") or [])

    @app.get("/api/ai-lab/drift")
    def ai_lab_drift(username: str = Depends(require_auth)):
        cache_key = "ailab_drift"
        cached = response_cache.get(cache_key)
        if cached:
            return cached

        users = _ai_lab_users()
        if len(users) < 10:
            return {"summary": {"population": len(users), "psi_account_type": 0, "psi_department": 0, "mean_groups_delta": 0}, "signals": []}

        sorted_users = sorted(users, key=lambda u: str(u.get("username") or ""))
        split = max(3, int(len(sorted_users) * 0.35))
        baseline = sorted_users[:split]
        current = sorted_users[split:]

        base_type = _safe_dist([u.get("accountType") for u in baseline])
        cur_type = _safe_dist([u.get("accountType") for u in current])
        base_dept = _safe_dist([u.get("department") for u in baseline])
        cur_dept = _safe_dist([u.get("department") for u in current])

        base_groups = np.mean([len(u.get("groups") or []) for u in baseline]) if baseline else 0.0
        cur_groups = np.mean([len(u.get("groups") or []) for u in current]) if current else 0.0
        delta_groups = float(cur_groups - base_groups)

        psi_type = _psi(base_type, cur_type)
        psi_dept = _psi(base_dept, cur_dept)

        signals = [
            {
                "id": "account-type-distribution",
                "label": "Distribuzione Account Type",
                "baseline": base_type,
                "current": cur_type,
                "psi": round(psi_type, 4),
                "severity": "high" if psi_type >= 0.25 else ("medium" if psi_type >= 0.1 else "low"),
            },
            {
                "id": "department-distribution",
                "label": "Distribuzione Department",
                "baseline": base_dept,
                "current": cur_dept,
                "psi": round(psi_dept, 4),
                "severity": "high" if psi_dept >= 0.25 else ("medium" if psi_dept >= 0.1 else "low"),
            },
            {
                "id": "mean-groups-per-user",
                "label": "Gruppi medi per utente",
                "baseline": round(base_groups, 3),
                "current": round(cur_groups, 3),
                "delta": round(delta_groups, 3),
                "severity": "high" if abs(delta_groups) >= 2.5 else ("medium" if abs(delta_groups) >= 1.0 else "low"),
            },
        ]
        res = {
            "summary": {
                "population": len(users),
                "psi_account_type": round(psi_type, 4),
                "psi_department": round(psi_dept, 4),
                "mean_groups_delta": round(delta_groups, 3),
            },
            "signals": signals,
        }
        response_cache.set(cache_key, res, ttl_seconds=600)
        return res

    @app.get("/api/ai-lab/training-timeline")
    def ai_lab_timeline(username: str = Depends(require_auth)):
        cache_key = "ailab_timeline"
        cached = response_cache.get(cache_key)
        if cached:
            return cached

        timeline = state.setdefault("ai_training_timeline", [])
        if not timeline:
            timeline.append(_default_timeline_entry(ml_engine))
        timeline.sort(key=lambda x: str(x.get("ts") or ""), reverse=True)
        learning = sorted(state.get("llm_learning_history") or [], key=lambda x: str(x.get("ts") or ""), reverse=True)
        res = {"items": timeline[:60], "learningHistory": learning[:500]}
        response_cache.set(cache_key, res, ttl_seconds=300)
        return res

    @app.post("/api/ai-lab/training-timeline/run")
    def ai_lab_timeline_run(body: TimelineRunRequest, username: str = Depends(require_auth)):
        st = ml_engine.get_status() or {}
        acc = float((st.get("model") or {}).get("accuracy") or 0.78)
        jitter = (hash(f"{body.model_name}:{time.time_ns()}") % 200 - 100) / 10000.0
        acc2 = max(0.0, min(1.0, acc + jitter))
        f1 = max(0.0, min(1.0, acc2 - 0.02))
        precision = max(0.0, min(1.0, acc2 - 0.01))
        recall = max(0.0, min(1.0, acc2 - 0.015))
        users = _ai_lab_users()
        item = {
            "id": f"run-{int(time.time()*1000)}",
            "ts": datetime.now(timezone.utc).isoformat(),
            "triggeredBy": username,
            "datasetSize": len(users),
            "modelName": body.model_name,
            "status": "success",
            "metrics": {
                "accuracy": round(acc2, 4),
                "f1": round(f1, 4),
                "precision": round(precision, 4),
                "recall": round(recall, 4),
            },
            "note": body.note or "Run simulato da AI Lab",
        }
        timeline = state.setdefault("ai_training_timeline", [])
        timeline.append(item)
        timeline.sort(key=lambda x: str(x.get("ts") or ""), reverse=True)
        invalidate_hot_caches(ailab=True)
        return {"ok": True, "item": item}

    @app.post("/api/ai-lab/ab-playground/compare")
    def ai_lab_ab_compare(body: AbPlaygroundRequest, username: str = Depends(require_auth)):
        users = _ai_lab_users()
        sample_size = max(50, min(int(body.sample_size or 400), max(50, len(users))))
        a = _simulate_quality_for_model(body.model_a, users, sample_size)
        b = _simulate_quality_for_model(body.model_b, users, sample_size)
        delta = {k: round(float(b.get(k, 0.0)) - float(a.get(k, 0.0)), 4) for k in ("accuracy", "precision", "recall", "f1")}
        return {
            "sampleSize": sample_size,
            "modelA": {"name": body.model_a, **a},
            "modelB": {"name": body.model_b, **b},
            "delta": delta,
            "winner": body.model_b if delta.get("f1", 0.0) > 0 else body.model_a,
        }

    @app.post("/api/ai-lab/ab-playground/upload-compare")
    async def ai_lab_ab_compare_upload(
        file_a: UploadFile = File(...),
        file_b: UploadFile = File(...),
        username: str = Depends(require_auth),
    ):
        raw_a = await file_a.read()
        raw_b = await file_b.read()
        if not raw_a or not raw_b:
            raise HTTPException(status_code=400, detail="Entrambi i file CSV sono obbligatori.")

        parsed_a = _parse_users_from_csv_bytes(raw_a, file_a.filename or "csv_a", normalize_last_login, slug_username, classify_account)
        parsed_b = _parse_users_from_csv_bytes(raw_b, file_b.filename or "csv_b", normalize_last_login, slug_username, classify_account)
        scored_a = _compute_dataset_scores_from_users(parsed_a, compute_model_quality, run_smart_ai_detection)
        scored_b = _compute_dataset_scores_from_users(parsed_b, compute_model_quality, run_smart_ai_detection)

        meta = {
            "model_quality_score": {"higher_is_better": True, "label": "Model Quality Score"},
            "rows_total": {"higher_is_better": True, "label": "Rows Total"},
            "duplicate_displayname_rows": {"higher_is_better": False, "label": "Duplicate DisplayName Rows"},
            "missing_department": {"higher_is_better": False, "label": "Missing Department"},
            "missing_business_role": {"higher_is_better": False, "label": "Missing Business Role"},
            "zero_groups_users": {"higher_is_better": False, "label": "Zero Groups Users"},
            "invalid_last_login": {"higher_is_better": False, "label": "Invalid LastLogin"},
            "stale_users": {"higher_is_better": False, "label": "Stale Users"},
            "overprivileged_users": {"higher_is_better": False, "label": "Overprivileged Users"},
            "policy_violations": {"higher_is_better": False, "label": "Policy Violations"},
            "ambiguous_users": {"higher_is_better": False, "label": "Ambiguous Users"},
            "ai_anomaly_users": {"higher_is_better": False, "label": "AI Anomaly Users"},
        }

        compare_rows = []
        improved = 0
        worsened = 0
        unchanged = 0
        for k, m in meta.items():
            a_val = float(scored_a["metrics"].get(k, 0))
            b_val = float(scored_b["metrics"].get(k, 0))
            diff = round(b_val - a_val, 4)
            hib = bool(m["higher_is_better"])
            if diff == 0:
                trend = "unchanged"
                unchanged += 1
            else:
                better = diff > 0 if hib else diff < 0
                trend = "improved" if better else "worsened"
                if better:
                    improved += 1
                else:
                    worsened += 1
            compare_rows.append({"metric": k, "label": m["label"], "a": a_val, "b": b_val, "diff": diff, "trend": trend})

        score_diff = round(float(scored_b["score"]) - float(scored_a["score"]), 2)
        winner = scored_b["name"] if score_diff > 0 else (scored_a["name"] if score_diff < 0 else "tie")
        return {
            "datasetA": scored_a,
            "datasetB": scored_b,
            "scoreDiff": score_diff,
            "winner": winner,
            "comparison": compare_rows,
            "summary": {"improved": improved, "worsened": worsened, "unchanged": unchanged},
        }

    @app.get("/api/ai-lab/fairness")
    def ai_lab_fairness(username: str = Depends(require_auth)):
        cache_key = "ailab_fairness"
        cached = response_cache.get(cache_key)
        if cached:
            return cached

        users = _ai_lab_users()
        if not users:
            return {"overallErrorRate": 0.0, "byDepartment": [], "byAccountType": []}

        def _err(u: Dict[str, Any]) -> int:
            risk = 0
            if len(u.get("groups") or []) == 0:
                risk += 1
            if not (u.get("businessRole") or "").strip():
                risk += 1
            if str(u.get("accountType") or "").lower() in {"external", "contractor"} and len(u.get("groups") or []) > 7:
                risk += 1
            return 1 if risk > 0 else 0

        overall = np.mean([_err(u) for u in users]) if users else 0.0

        def _aggregate(key_name: str) -> List[Dict[str, Any]]:
            buckets = defaultdict(list)
            for u in users:
                k = str(u.get(key_name) or "Unknown").strip() or "Unknown"
                buckets[k].append(u)
            out = []
            for k, arr in buckets.items():
                err_rate = float(np.mean([_err(x) for x in arr])) if arr else 0.0
                out.append(
                    {
                        "group": k,
                        "size": len(arr),
                        "errorRate": round(err_rate, 4),
                        "gapVsOverall": round(err_rate - overall, 4),
                    }
                )
            out.sort(key=lambda x: abs(x["gapVsOverall"]), reverse=True)
            return out

        res = {
            "overallErrorRate": round(float(overall), 4),
            "byDepartment": _aggregate("department")[:20],
            "byAccountType": _aggregate("accountType")[:20],
        }
        response_cache.set(cache_key, res, ttl_seconds=600)
        return res

    @app.get("/api/ai-lab/synthetic")
    def ai_lab_synthetic(username: str = Depends(require_auth)):
        cache_key = "ailab_synthetic"
        cached = response_cache.get(cache_key)
        if cached:
            return cached

        templates = [
            {"id": "svc_admin_overlap", "label": "Service con gruppi admin", "risk": "high"},
            {"id": "missing_identity_keys", "label": "Chiavi identita mancanti", "risk": "medium"},
            {"id": "future_last_login", "label": "LastLogin futura", "risk": "medium"},
            {"id": "department_role_mismatch", "label": "Dipartimento/BusinessRole incoerenti", "risk": "high"},
            {"id": "ghost_manager", "label": "Manager non esistente", "risk": "high"},
        ]
        res = {"templates": templates, "lastGenerated": state.get("ai_synthetic_cases", [])[:100]}
        response_cache.set(cache_key, res, ttl_seconds=300)
        return res

    @app.post("/api/ai-lab/synthetic/generate")
    def ai_lab_synthetic_generate(body: SyntheticGenerateRequest, username: str = Depends(require_auth)):
        users = _ai_lab_users()
        templates = ["svc_admin_overlap", "missing_identity_keys", "future_last_login", "department_role_mismatch", "ghost_manager"]
        count = max(1, min(int(body.count or 30), 300))
        generated = []
        for i in range(count):
            t = body.scenario if body.scenario != "mixed" else templates[i % len(templates)]
            ref = users[i % len(users)] if users else {}
            generated.append(
                {
                    "id": f"syn-{int(time.time()*1000)}-{i}",
                    "template": t,
                    "displayName": f"syn_{(ref.get('displayName') or 'utente').replace(' ', '_').lower()}_{i+1}",
                    "department": ref.get("department") or "Unknown",
                    "businessRole": ref.get("businessRole") or "Unassigned",
                    "groups": (ref.get("groups") or [])[:4],
                    "severity": "high" if t in {"svc_admin_overlap", "department_role_mismatch", "ghost_manager"} else "medium",
                }
            )
        if body.persist:
            state["ai_synthetic_cases"] = generated
            invalidate_hot_caches(ailab=True)
        return {"ok": True, "count": len(generated), "items": generated}

    @app.get("/api/ai-lab/feedback")
    def ai_lab_feedback(username: str = Depends(require_auth)):
        cache_key = "ailab_feedback"
        cached = response_cache.get(cache_key)
        if cached:
            return cached

        events = state.get("ai_feedback_events") or []
        total = len(events)
        recent = sorted(events, key=lambda x: str(x.get("ts") or ""), reverse=True)[:200]
        by_corrected = Counter([str(e.get("corrected_type") or "Unknown") for e in events])
        history = list(state.get("manual_user_changes") or [])
        history = sorted(history, key=lambda x: str(x.get("ts") or ""), reverse=True)[:500]
        res = {
            "total": total,
            "byCorrectedType": [{"type": k, "count": v} for k, v in by_corrected.most_common()],
            "items": recent,
            "history": history,
        }
        response_cache.set(cache_key, res, ttl_seconds=300)
        return res

    @app.post("/api/ai-lab/feedback")
    def ai_lab_feedback_add(body: FeedbackEventRequest, background_tasks: BackgroundTasks, username: str = Depends(require_auth)):
        users = state.get("last_extract", {}).get("users") or []
        target = next((u for u in users if str(u.get("username") or "") == body.username), None)
        if target:
            target["accountType"] = body.corrected_type
        event = {
            "id": f"fb-{int(time.time()*1000)}",
            "ts": datetime.now(timezone.utc).isoformat(),
            "author": username,
            "username": body.username,
            "predicted_type": body.predicted_type,
            "corrected_type": body.corrected_type,
            "confidence": float(body.confidence),
            "note": body.note or "",
        }
        events = state.setdefault("ai_feedback_events", [])
        events.append(event)
        events[:] = events[-2000:]
        dq_ev = state.setdefault("dq_feedback_events", [])
        dq_ev.append(
            {
                "kind": "ai-feedback",
                "username": body.username,
                "predicted": body.predicted_type,
                "corrected": body.corrected_type,
                "ts": event["ts"],
            }
        )
        dq_ev[:] = dq_ev[-3000:]
        record_llm_learning_event(
            actor=username,
            source="ai-lab-feedback",
            signal_type="supervised-correction",
            entity=body.username,
            details={
                "predicted_type": body.predicted_type,
                "corrected_type": body.corrected_type,
                "confidence": float(body.confidence),
            },
        )
        manual_event = record_manual_user_change(
            actor=username,
            username=body.username,
            display_name=target.get("displayName") if target else body.username,
            action="feedback-correction",
            source="ai-lab-feedback",
            details={
                "predicted_type": body.predicted_type,
                "corrected_type": body.corrected_type,
                "confidence": float(body.confidence),
                "note": body.note or "",
            },
            persist=False,
        )
        background_tasks.add_task(state.save)
        invalidate_hot_caches(ailab=True)
        return {"ok": True, "event": event, "manualEvent": manual_event}

