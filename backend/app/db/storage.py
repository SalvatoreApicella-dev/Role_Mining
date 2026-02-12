"""
File-based persistent storage to replace in-memory state dictionary.
Uses JSON for simplicity and human-readability.
"""
import json
import os
from pathlib import Path
from typing import Any, Dict, Optional
from datetime import datetime, timezone
import threading


class JsonFileStore:
    """Thread-safe JSON file storage for application state."""
    
    def __init__(self, filepath: str = "data/storage.json"):
        self.filepath = Path(filepath)
        self._lock = threading.RLock()
        self._state: Dict[str, Any] = {}
        self._ensure_file()
        self.load()
    
    def _ensure_file(self):
        """Create storage file and directory if they don't exist."""
        self.filepath.parent.mkdir(parents=True, exist_ok=True)
        if not self.filepath.exists():
            self.filepath.write_text("{}")
    
    def load(self):
        """Load state from file."""
        with self._lock:
            try:
                with open(self.filepath, 'r', encoding='utf-8') as f:
                    raw_data = json.load(f)
                    self._state = self._restore_from_json(raw_data)
            except (json.JSONDecodeError, FileNotFoundError):
                self._state = {}
                self.save()
    
    def save(self):
        """Persist state to file."""
        with self._lock:
            # Convert sets to lists for JSON serialization
            serializable_state = self._prepare_for_json(self._state)
            with open(self.filepath, 'w', encoding='utf-8') as f:
                json.dump(serializable_state, f, indent=2, ensure_ascii=False)
    
    def _prepare_for_json(self, obj: Any) -> Any:
        """Recursively convert non-JSON-serializable types."""
        if isinstance(obj, (str, int, float, bool)) or obj is None:
            return obj
        if isinstance(obj, bytes):
            try:
                return obj.decode("utf-8")
            except UnicodeDecodeError:
                return obj.hex()
        if isinstance(obj, set):
            return list(obj)
        elif isinstance(obj, dict):
            prepared = {}
            for k, v in obj.items():
                if isinstance(k, bytes):
                    try:
                        key = k.decode("utf-8")
                    except UnicodeDecodeError:
                        key = k.hex()
                else:
                    key = str(k) if not isinstance(k, str) else k
                prepared[key] = self._prepare_for_json(v)
            return prepared
        elif isinstance(obj, list):
            return [self._prepare_for_json(item) for item in obj]
        return str(obj)
    
    def _restore_from_json(self, obj: Any, key: str = "") -> Any:
        """Restore sets from lists where appropriate."""
        # Known set fields
        set_fields = {"business_roles", "businessroles"}
        
        if isinstance(obj, dict):
            return {k: self._restore_from_json(v, k) for k, v in obj.items()}
        elif isinstance(obj, list) and key in set_fields:
            return set(obj)
        elif isinstance(obj, list):
            return [self._restore_from_json(item, key) for item in obj]
        return obj
    
    def get(self, key: str, default: Any = None) -> Any:
        """Get value from state."""
        with self._lock:
            return self._state.get(key, default)
    
    def set(self, key: str, value: Any):
        """Set value in state and persist."""
        with self._lock:
            self._state[key] = value
            self.save()
    
    def setdefault(self, key: str, default: Any) -> Any:
        """Set default value if key doesn't exist."""
        with self._lock:
            if key not in self._state:
                self._state[key] = default
                self.save()
            return self._state[key]
    
    def update(self, updates: Dict[str, Any]):
        """Update multiple keys at once."""
        with self._lock:
            self._state.update(updates)
            self.save()
    
    def __getitem__(self, key: str) -> Any:
        """Dict-like access."""
        with self._lock:
            return self._state[key]
    
    def __setitem__(self, key: str, value: Any):
        """Dict-like assignment."""
        self.set(key, value)
    
    def __contains__(self, key: str) -> bool:
        """Check if key exists."""
        with self._lock:
            return key in self._state
    
    def keys(self):
        """Return state keys."""
        with self._lock:
            return self._state.keys()
    
    def items(self):
        """Return state items."""
        with self._lock:
            return self._state.items()
    
    def clear(self):
        """Clear all state."""
        with self._lock:
            self._state = {}
            self.save()


# Global instance
_store: Optional[JsonFileStore] = None


def get_store() -> JsonFileStore:
    """Get or create the global storage instance."""
    global _store
    if _store is None:
        _store = JsonFileStore()
    return _store


def init_default_state():
    """Initialize default state structure if empty."""
    store = get_store()
    
    defaults = {
        "connector": {
            "server": "mock",
            "bind_user": "",
            "bind_password": "",
            "base_dn": "",
            "auth": "SIMPLE",
        },
        "last_extract": {
            "ou": "",
            "users": [],
            "groups": [],
            "ts": None,
        },
        "last_mining": {
            "clusters": [],
            "matrix": {},
            "kpi": {},
            "ts": None,
        },
        "logs": [],
        "role_meta": {},
        "business_roles": set(),
        "user_business_role": {},
        "last_ingest_stats": {
            "source": None,
            "rowsTotal": 0,
            "rowsKept": 0,
            "duplicateDisplayName": 0,
            "missingDepartment": 0,
            "missingBusinessRole": 0,
            "missingDisplayName": 0,
            "missingUsername": 0,
            "ts": None,
        },
        "ingest_sources": {},
        "ingest_candidates": [],
        "choice_by_displayName": {},
        "duplicate_autoselect": {},
        "dq_rules": {
            "duplicate_resolution_order": [
                "last_login",
                "groups_count",
                "dept_group_correlation",
                "has_department",
            ],
            "reject_empty_groups": False,
        },
        "dq_feedback_events": [],
        "ai_feedback_events": [],
        "manual_user_changes": [],
        "llm_learning_history": [],
        "br_pattern_rules": [],
        "br_assignment_pattern_rules": [],
        "dq_model_preset": "manufacturing",
        "dq_model_weights": {
            "role_entropy": 0.08,
            "template_coverage": 0.11,
            "noise_ratio": 0.10,
            "ambiguity": 0.07,
            "temporal_drift": 0.09,
            "matrix_density": 0.06,
            "orphan_weighted": 0.09,
            "overprivileged": 0.10,
            "stale_access": 0.09,
            "policy_violation": 0.08,
            "manual_override": 0.06,
            "generalization": 0.07,
        },
        "mining_dirty": True,
        "last_mining_params": {"n_clusters": None, "role_support": 0.6},
        "last_rejects": [],
        "brdb_group_stats": {},
        "brdb_token_stats": {},
        "brdb_cache": {},
        "brdb_ready": False,
    }
    
    for key, value in defaults.items():
        store.setdefault(key, value)
    
    # Back-compat aliases
    if "role_meta" in store._state:
        store._state["rolemeta"] = store._state["role_meta"]
    if "business_roles" in store._state:
        store._state["businessroles"] = store._state["business_roles"]
    if "user_business_role" in store._state:
        store._state["userbusinessrole"] = store._state["user_business_role"]
