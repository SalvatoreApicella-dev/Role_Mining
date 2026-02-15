import re
from datetime import datetime, timezone
from typing import Any, Callable, Dict, Optional

from fastapi import BackgroundTasks, Depends, FastAPI, HTTPException
from pydantic import BaseModel


class PatternRuleRequest(BaseModel):
    account_type: str
    field: str
    regex: str


class BrPatternRuleRequest(BaseModel):
    business_role: str
    field: str
    regex: str


class BrAssignmentPatternRuleRequest(BaseModel):
    business_role: str
    role: Optional[str] = None  # legacy optional gate on exact group name
    regex: str


def register_pattern_rules_routes(
    app: FastAPI,
    *,
    state: Any,
    ml_engine: Any,
    require_auth: Callable[..., Any],
    recalculate_assignments_background: Callable[..., None],
    record_llm_learning_event: Callable[..., Dict[str, Any]],
    log: Callable[[str, str], None],
) -> None:
    @app.get("/api/ml/patterns")
    def get_patterns(username: str = Depends(require_auth)):
        return ml_engine.get_patterns()

    @app.post("/api/ml/patterns")
    def add_pattern(body: PatternRuleRequest, background_tasks: BackgroundTasks, username: str = Depends(require_auth)):
        result = ml_engine.add_pattern(body.account_type, body.field, body.regex)
        if not result.get("success"):
            raise HTTPException(status_code=400, detail=result.get("error", "Failed"))
        log("INFO", f"Pattern added: {body.account_type}/{body.field}/{body.regex} by {username}")
        record_llm_learning_event(
            actor=username,
            source="pattern-rules",
            signal_type="rule-added",
            entity=body.account_type,
            details={"field": body.field, "regex": body.regex},
        )
        background_tasks.add_task(recalculate_assignments_background, "account-pattern-rule-added", username)
        return result

    @app.delete("/api/ml/patterns/{index}")
    def delete_pattern_endpoint(index: int, background_tasks: BackgroundTasks, username: str = Depends(require_auth)):
        result = ml_engine.delete_pattern(index)
        if not result.get("success"):
            raise HTTPException(status_code=400, detail=result.get("error", "Failed"))
        log("INFO", f"Pattern deleted: index={index} by {username}")
        record_llm_learning_event(
            actor=username,
            source="pattern-rules",
            signal_type="rule-deleted",
            entity=str(index),
            details={},
        )
        background_tasks.add_task(recalculate_assignments_background, "account-pattern-rule-deleted", username)
        return result

    @app.get("/api/ml/br-patterns")
    def get_br_patterns(username: str = Depends(require_auth)):
        rules = state.setdefault("br_pattern_rules", [])
        return {"custom": list(rules)}

    @app.post("/api/ml/br-patterns")
    def add_br_pattern(body: BrPatternRuleRequest, background_tasks: BackgroundTasks, username: str = Depends(require_auth)):
        business_role = (body.business_role or "").strip()
        field = (body.field or "").strip()
        regex = (body.regex or "").strip()
        if not business_role:
            raise HTTPException(status_code=400, detail="Business Role is required")
        if not field:
            raise HTTPException(status_code=400, detail="Field is required")
        if not regex:
            raise HTTPException(status_code=400, detail="Regex is required")
        try:
            re.compile(regex)
        except re.error as exc:
            raise HTTPException(status_code=400, detail=f"Invalid regex: {exc}") from exc

        rules = state.setdefault("br_pattern_rules", [])
        rule = {
            "business_role": business_role,
            "field": field,
            "regex": regex,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        rules.append(rule)
        state["br_pattern_rules"] = rules
        state.save()
        log("INFO", f"BR pattern added: {business_role}/{field}/{regex} by {username}")
        record_llm_learning_event(
            actor=username,
            source="pattern-rules",
            signal_type="br-rule-added",
            entity=business_role,
            details={"field": field, "regex": regex},
        )
        background_tasks.add_task(recalculate_assignments_background, "br-pattern-rule-added", username)
        return {"success": True, "rule": rule, "total_custom_rules": len(rules)}

    @app.delete("/api/ml/br-patterns/{index}")
    def delete_br_pattern(index: int, background_tasks: BackgroundTasks, username: str = Depends(require_auth)):
        rules = list(state.setdefault("br_pattern_rules", []))
        if index < 0 or index >= len(rules):
            raise HTTPException(status_code=400, detail="Invalid index")
        removed = rules.pop(index)
        state["br_pattern_rules"] = rules
        state.save()
        log("INFO", f"BR pattern deleted: index={index} by {username}")
        record_llm_learning_event(
            actor=username,
            source="pattern-rules",
            signal_type="br-rule-deleted",
            entity=str(index),
            details={},
        )
        background_tasks.add_task(recalculate_assignments_background, "br-pattern-rule-deleted", username)
        return {"success": True, "removed": removed, "total_custom_rules": len(rules)}

    @app.get("/api/ml/br-assignment-patterns")
    def get_br_assignment_patterns(username: str = Depends(require_auth)):
        rules = state.setdefault("br_assignment_pattern_rules", [])
        return {"custom": list(rules)}

    @app.post("/api/ml/br-assignment-patterns")
    def add_br_assignment_pattern(
        body: BrAssignmentPatternRuleRequest,
        background_tasks: BackgroundTasks,
        username: str = Depends(require_auth),
    ):
        business_role = (body.business_role or "").strip()
        regex = (body.regex or "").strip()
        if not business_role:
            raise HTTPException(status_code=400, detail="Business Role is required")
        if not regex:
            raise HTTPException(status_code=400, detail="Regex is required")
        try:
            re.compile(regex)
        except re.error as exc:
            raise HTTPException(status_code=400, detail=f"Invalid regex: {exc}") from exc

        rules = state.setdefault("br_assignment_pattern_rules", [])
        rule = {
            "business_role": business_role,
            "regex": regex,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        legacy_role = (body.role or "").strip()
        if legacy_role:
            rule["role"] = legacy_role
        rules.append(rule)
        state["br_assignment_pattern_rules"] = rules
        state.save()
        log("INFO", f"BR assignment pattern added: {business_role}/{regex} by {username}")
        record_llm_learning_event(
            actor=username,
            source="pattern-rules",
            signal_type="br-assignment-rule-added",
            entity=business_role,
            details={"regex": regex, "legacyRole": legacy_role},
        )
        background_tasks.add_task(recalculate_assignments_background, "br-assignment-rule-added", username)
        return {"success": True, "rule": rule, "total_custom_rules": len(rules)}

    @app.delete("/api/ml/br-assignment-patterns/{index}")
    def delete_br_assignment_pattern(index: int, background_tasks: BackgroundTasks, username: str = Depends(require_auth)):
        rules = list(state.setdefault("br_assignment_pattern_rules", []))
        if index < 0 or index >= len(rules):
            raise HTTPException(status_code=400, detail="Invalid index")
        removed = rules.pop(index)
        state["br_assignment_pattern_rules"] = rules
        state.save()
        log("INFO", f"BR assignment pattern deleted: index={index} by {username}")
        record_llm_learning_event(
            actor=username,
            source="pattern-rules",
            signal_type="br-assignment-rule-deleted",
            entity=str(index),
            details={},
        )
        background_tasks.add_task(recalculate_assignments_background, "br-assignment-rule-deleted", username)
        return {"success": True, "removed": removed, "total_custom_rules": len(rules)}

