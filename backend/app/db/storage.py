"""
File-based persistent storage to replace in-memory state dictionary.
Uses JSON for simplicity and human-readability.
"""
import json
import os
from pathlib import Path
from typing import Any, Dict, Optional, List
from datetime import datetime, timezone
import threading
from contextlib import contextmanager
import tempfile


class JsonFileStore:
    """Thread-safe JSON file storage for application state."""
    # Keys that are persisted as lists but restored in-memory as sets.
    _SET_FIELDS = {"business_roles", "businessroles"}
    
    def __init__(self, filepath: str = "data/storage.json"):
        self.filepath = Path(filepath)
        self._lock = threading.RLock()
        self._state: Dict[str, Any] = {}
        self._batch_depth = 0
        self._dirty = False
        self._json_indent = 2 if os.getenv("STATE_JSON_PRETTY", "0") == "1" else None
        self._ensure_file()
        self.load()

    def _schedule_save_locked(self):
        if self._batch_depth > 0:
            self._dirty = True
            return
        self.save()

    @staticmethod
    def _normalize_json_key(key: Any) -> str:
        """
        Ensure JSON object keys are always strings.
        Bytes keys are decoded when possible, otherwise represented as hex.
        """
        if isinstance(key, bytes):
            try:
                return key.decode("utf-8")
            except UnicodeDecodeError:
                return key.hex()
        return key if isinstance(key, str) else str(key)
    
    def _ensure_file(self):
        """Create storage file and directory if they don't exist."""
        self.filepath.parent.mkdir(parents=True, exist_ok=True)
        if not self.filepath.exists():
            self.filepath.write_text("{}")
    
    def load(self):
        """Load state from file."""
        with self._lock:
            try:
                raw_data = self._load_json_file(self.filepath)
                self._state = self._restore_from_json(raw_data)
            except FileNotFoundError:
                # First boot path: keep empty in-memory state; caller will initialize defaults.
                self._state = {}
            except json.JSONDecodeError as exc:
                self._quarantine_corrupted_primary()
                restored = self._restore_from_latest_backup()
                if restored is not None:
                    self._state = self._restore_from_json(restored)
                    # Heal primary file immediately from recovered backup.
                    self.save()
                    return
                raise RuntimeError(
                    f"Persistent storage is corrupted and no valid backup was found: {self.filepath}"
                ) from exc
    
    def save(self):
        """Persist state to file."""
        with self._lock:
            # Convert sets to lists for JSON serialization
            serializable_state = self._prepare_for_json(self._state)
            self._atomic_write_json(self.filepath, serializable_state)

    def _load_json_file(self, path: Path) -> Dict[str, Any]:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)

    def _atomic_write_json(self, path: Path, payload: Dict[str, Any]) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        with tempfile.NamedTemporaryFile(
            mode="w",
            encoding="utf-8",
            dir=str(path.parent),
            prefix=f"{path.name}.tmp.",
            suffix=".json",
            delete=False,
        ) as tf:
            json.dump(
                payload,
                tf,
                indent=self._json_indent,
                ensure_ascii=False,
                separators=(",", ":") if self._json_indent is None else None,
            )
            tf.flush()
            os.fsync(tf.fileno())
            temp_name = tf.name
        os.replace(temp_name, path)

    def _backup_candidates(self) -> List[Path]:
        pattern = f"{self.filepath.name}.backup_*"
        return sorted(self.filepath.parent.glob(pattern), key=lambda p: p.stat().st_mtime, reverse=True)

    def _restore_from_latest_backup(self) -> Optional[Dict[str, Any]]:
        candidates = self._backup_candidates()
        if not candidates:
            return None
        for backup in candidates:
            try:
                return self._load_json_file(backup)
            except Exception:
                continue
        return None

    def _quarantine_corrupted_primary(self) -> None:
        try:
            if not self.filepath.exists():
                return
            ts = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
            corrupt = self.filepath.with_name(f"{self.filepath.name}.corrupt_{ts}")
            os.replace(self.filepath, corrupt)
        except Exception:
            # Never block startup because quarantine failed.
            pass
    
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
                key = self._normalize_json_key(k)
                prepared[key] = self._prepare_for_json(v)
            return prepared
        elif isinstance(obj, list):
            return [self._prepare_for_json(item) for item in obj]
        return str(obj)
    
    def _restore_from_json(self, obj: Any, key: str = "") -> Any:
        """Restore sets from lists where appropriate."""
        if isinstance(obj, dict):
            return {k: self._restore_from_json(v, k) for k, v in obj.items()}
        elif isinstance(obj, list) and key in self._SET_FIELDS:
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
            self._schedule_save_locked()
    
    def setdefault(self, key: str, default: Any) -> Any:
        """Set default value if key doesn't exist."""
        with self._lock:
            if key not in self._state:
                self._state[key] = default
                self._schedule_save_locked()
            return self._state[key]
    
    def update(self, updates: Dict[str, Any]):
        """Update multiple keys at once."""
        with self._lock:
            self._state.update(updates)
            self._schedule_save_locked()
    
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
            self._schedule_save_locked()

    @contextmanager
    def batch(self):
        """
        Group multiple state mutations into a single disk save.
        Nested batches are supported.
        """
        with self._lock:
            self._batch_depth += 1
        try:
            yield self
        finally:
            with self._lock:
                self._batch_depth = max(0, self._batch_depth - 1)
                if self._batch_depth == 0 and self._dirty:
                    self._dirty = False
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
            "sap_base_url": "",
            "sap_auth_mode": "AUTO",
            "sap_client": "",
            "sap_system": "",
            "sap_username": "",
            "sap_password": "",
            "sap_api_key": "",
            "sap_token_url": "",
            "sap_client_id": "",
            "sap_client_secret": "",
            "sap_oauth_scope": "",
            "sap_company_id": "",
            "sap_users_path": "/sap/opu/odata/sap/ZROLE_MINING_SRV/Users",
            "azure_base_url": "https://graph.microsoft.com",
            "azure_tenant_id": "",
            "azure_client_id": "",
            "azure_client_secret": "",
            "azure_users_path": "/v1.0/users?$select=id,displayName,userPrincipalName,mail,department,accountEnabled",
            "one_identity_base_url": "https://<host>/AppServer",
            "one_identity_token_url": "",
            "one_identity_client_id": "",
            "one_identity_client_secret": "",
            "one_identity_username": "",
            "one_identity_password": "",
            "one_identity_users_path": "/api/entities/person?limit=100",
            "sailpoint_base_url": "https://<tenant>.api.identitynow.com/v3",
            "sailpoint_token_url": "",
            "sailpoint_client_id": "",
            "sailpoint_client_secret": "",
            "sailpoint_users_path": "/accounts",
            "saviynt_base_url": "",
            "saviynt_token_url": "",
            "saviynt_client_id": "",
            "saviynt_client_secret": "",
            "saviynt_username": "",
            "saviynt_password": "",
            "saviynt_users_path": "",
            "servicenow_base_url": "",
            "servicenow_username": "",
            "servicenow_password": "",
            "servicenow_users_path": "/api/now/table/sys_user?sysparm_fields=sys_id,user_name,name,email,department,active",
            "salesforce_base_url": "",
            "salesforce_token_url": "https://login.salesforce.com/services/oauth2/token",
            "salesforce_client_id": "",
            "salesforce_client_secret": "",
            "salesforce_users_path": "/services/data/v60.0/query?q=SELECT+Id,Name,Username,Email,Department,IsActive+FROM+User",
            "m365_base_url": "https://graph.microsoft.com",
            "m365_tenant_id": "",
            "m365_client_id": "",
            "m365_client_secret": "",
            "m365_users_path": "/v1.0/users?$select=id,displayName,userPrincipalName,mail,department,accountEnabled",
            "discovery_schedules": {},
            "discovery_results": {},
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
        "system_users": [
            {
                "username": "admin",
                "display_name": "Administrator",
                "password": "admin123",
                "active": True,
                "permissions": {
                    "can_view_analytics": True,
                    "can_view_cluster": True,
                    "can_view_users": True,
                    "can_view_business_roles": True,
                    "can_view_ai_training": True,
                    "can_view_configurations": True,
                    "can_view_logs": True,
                    "can_view_system_users": True,
                    "can_manage_settings": True,
                    "can_manage_assignments": True,
                },
            },
            {
                "username": "user",
                "display_name": "User Viewer",
                "password": "user123",
                "active": True,
                "permissions": {
                    "can_view_analytics": True,
                    "can_view_cluster": True,
                    "can_view_users": True,
                    "can_view_business_roles": True,
                    "can_view_ai_training": True,
                    "can_view_configurations": False,
                    "can_view_logs": False,
                    "can_view_system_users": False,
                    "can_manage_settings": False,
                    "can_manage_assignments": False,
                },
            },
        ],
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
