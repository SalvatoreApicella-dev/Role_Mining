"""
File-based persistent storage to replace in-memory state dictionary.
Uses JSON for simplicity; optionally encrypted at rest via Fernet.

Encryption:
  Set STORAGE_ENCRYPTION_KEY to a Fernet key (base64 URL-safe 32-byte token).
  Generate one with:
    python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
  If the env var is absent encryption is disabled (plain JSON, backward-compat).
  Existing plain-text files are migrated transparently on first load and rewritten encrypted.

Tenant isolation:
  Every domain maps to exactly one tenant, enforced via a global domain_registry.json.
  A new domain always creates a brand-new, isolated tenant and can never be silently
  redirected to an existing tenant.
"""
import json
import os
import logging
from pathlib import Path
from typing import Any, Dict, Optional, List
from datetime import datetime, timezone
import threading
import fcntl
from contextlib import contextmanager
from contextvars import ContextVar, Token
import tempfile
import re

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Optional Fernet encryption helpers
# ---------------------------------------------------------------------------

def _get_fernet():
    """Return a Fernet instance if STORAGE_ENCRYPTION_KEY is set, else None."""
    key_raw = os.getenv("STORAGE_ENCRYPTION_KEY", "").strip()
    if not key_raw:
        return None
    try:
        from cryptography.fernet import Fernet
        return Fernet(key_raw.encode() if isinstance(key_raw, str) else key_raw)
    except Exception as exc:
        logger.error("STORAGE_ENCRYPTION_KEY is set but invalid; encryption disabled: %s", exc)
        return None


_FERNET_TOKEN_PREFIX = b"gAAAAA"  # Fernet tokens always start with this


def _encrypt_bytes(data: bytes, fernet) -> bytes:
    """Encrypt raw bytes with Fernet; returns ciphertext bytes."""
    return fernet.encrypt(data)


def _decrypt_bytes(data: bytes, fernet) -> bytes:
    """Decrypt Fernet ciphertext; raises on invalid token."""
    return fernet.decrypt(data)


# ---------------------------------------------------------------------------
# JsonFileStore
# ---------------------------------------------------------------------------

class JsonFileStore:
    """Thread-safe JSON file storage for application state (optionally encrypted)."""
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
        """Load JSON from path, decrypting transparently if needed."""
        # Multi-process safety: acquire shared lock for reading
        if not path.exists():
            return {}
            
        with path.open("rb") as f:
            try:
                fcntl.flock(f, fcntl.LOCK_SH)
                raw = f.read()
            finally:
                fcntl.flock(f, fcntl.LOCK_UN)

        if not raw:
            return {}
        fernet = _get_fernet()
        if fernet is not None and raw.startswith(_FERNET_TOKEN_PREFIX):
            # Encrypted file – decrypt first.
            try:
                raw = _decrypt_bytes(raw, fernet)
            except Exception as exc:
                raise json.JSONDecodeError(
                    f"Fernet decryption failed for {path}: {exc}", "", 0
                )
        # raw is now either plaintext bytes or decrypted bytes
        text = raw.decode("utf-8")
        data = json.loads(text)
        # If the file was plaintext but encryption is enabled, rewrite it encrypted now.
        if fernet is not None and not path.read_bytes().startswith(_FERNET_TOKEN_PREFIX):
            self._atomic_write_json(path, self._prepare_for_json(data))
        return data

    def _atomic_write_json(self, path: Path, payload: Dict[str, Any]) -> None:
        """Serialize JSON and write atomically (optionally encrypted)."""
        path.parent.mkdir(parents=True, exist_ok=True)
        json_bytes = json.dumps(
            payload,
            indent=self._json_indent,
            ensure_ascii=False,
            separators=(",", ":") if self._json_indent is None else None,
        ).encode("utf-8")
        fernet = _get_fernet()
        write_bytes = _encrypt_bytes(json_bytes, fernet) if fernet is not None else json_bytes
        with tempfile.NamedTemporaryFile(
            mode="wb",
            dir=str(path.parent),
            prefix=f"{path.name}.tmp.",
            suffix=".json",
            delete=False,
        ) as tf:
            tf.write(write_bytes)
            tf.flush()
            os.fsync(tf.fileno())
            temp_name = tf.name

        # Multi-process safety: acquire exclusive lock during the actual replace
        lock_path = path.with_suffix(".lock")
        with lock_path.open("w") as lf:
            try:
                fcntl.flock(lf, fcntl.LOCK_EX)
                os.replace(temp_name, path)
            finally:
                fcntl.flock(lf, fcntl.LOCK_UN)

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


# ---------------------------------------------------------------------------
# Tenant context helpers
# ---------------------------------------------------------------------------

DEFAULT_TENANT_ID = (
    os.getenv("DEFAULT_TENANT_ID", "example.internal").strip().lower() or "example.internal"
)
_TENANT_ID_PATTERN = re.compile(r"^[a-z0-9._-]+$")
_TENANT_CTX: ContextVar[str] = ContextVar("role_mining_tenant_id", default=DEFAULT_TENANT_ID)


def normalize_tenant_id(raw: Optional[str]) -> str:
    candidate = str(raw or "").strip().lower()
    if not candidate:
        return DEFAULT_TENANT_ID
    if not _TENANT_ID_PATTERN.fullmatch(candidate):
        return DEFAULT_TENANT_ID
    return candidate


def get_current_tenant_id() -> str:
    return normalize_tenant_id(_TENANT_CTX.get())


def push_tenant_context(tenant_id: Optional[str]) -> Token:
    return _TENANT_CTX.set(normalize_tenant_id(tenant_id))


def pop_tenant_context(token: Token) -> None:
    _TENANT_CTX.reset(token)


@contextmanager
def tenant_context(tenant_id: Optional[str]):
    token = push_tenant_context(tenant_id)
    try:
        yield normalize_tenant_id(tenant_id)
    finally:
        pop_tenant_context(token)


# ---------------------------------------------------------------------------
# Per-tenant storage paths
# ---------------------------------------------------------------------------

def _tenant_storage_path(tenant_id: str) -> Path:
    return Path("data") / "tenants" / normalize_tenant_id(tenant_id) / "storage.json"


def _maybe_migrate_legacy_storage(target_path: Path, tenant_id: str) -> None:
    """
    One-shot migration from legacy single-tenant file `data/storage.json`
    into the default tenant path.
    """
    if normalize_tenant_id(tenant_id) != DEFAULT_TENANT_ID:
        return
    if target_path.exists():
        return
    legacy = Path("data") / "storage.json"
    if not legacy.exists():
        return
    target_path.parent.mkdir(parents=True, exist_ok=True)
    try:
        with legacy.open("r", encoding="utf-8") as rf:
            raw = json.load(rf)
        fernet = _get_fernet()
        json_bytes = json.dumps(raw, ensure_ascii=False).encode("utf-8")
        write_bytes = _encrypt_bytes(json_bytes, fernet) if fernet is not None else json_bytes
        with tempfile.NamedTemporaryFile(
            mode="wb",
            dir=str(target_path.parent),
            prefix=f"{target_path.name}.tmp.",
            suffix=".json",
            delete=False,
        ) as tf:
            tf.write(write_bytes)
            tf.flush()
            os.fsync(tf.fileno())
            temp_name = tf.name
        os.replace(temp_name, target_path)
    except Exception:
        # Migration best-effort only.
        return


# ---------------------------------------------------------------------------
# Domain registry  (global, not per-tenant)
# Enforces strict 1:1 domain -> tenant mapping so every new domain always
# creates a brand-new isolated tenant and can never share one.
# ---------------------------------------------------------------------------

_DOMAIN_REGISTRY_LOCK = threading.RLock()


def _domain_registry_path() -> Path:
    return Path("data") / "domain_registry.json"


def _load_domain_registry() -> Dict[str, str]:
    """Load domain-to-tenant mapping from global registry file."""
    path = _domain_registry_path()
    if not path.exists():
        return {}
    try:
        raw = path.read_bytes()
        fernet = _get_fernet()
        if fernet is not None and raw.startswith(_FERNET_TOKEN_PREFIX):
            raw = _decrypt_bytes(raw, fernet)
        data = json.loads(raw.decode("utf-8"))
        if isinstance(data, dict):
            return {str(k): str(v) for k, v in data.items()}
    except Exception as exc:
        logger.error("Failed to load domain_registry.json: %s", exc)
    return {}


def _save_domain_registry(registry: Dict[str, str]) -> None:
    """Atomically persist domain-to-tenant registry."""
    path = _domain_registry_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    json_bytes = json.dumps(registry, ensure_ascii=False, indent=2).encode("utf-8")
    fernet = _get_fernet()
    write_bytes = _encrypt_bytes(json_bytes, fernet) if fernet is not None else json_bytes
    with tempfile.NamedTemporaryFile(
        mode="wb",
        dir=str(path.parent),
        prefix=f"{path.name}.tmp.",
        suffix=".json",
        delete=False,
    ) as tf:
        tf.write(write_bytes)
        tf.flush()
        os.fsync(tf.fileno())
        temp_name = tf.name
    os.replace(temp_name, path)


def lookup_registered_domain(domain: str) -> Optional[str]:
    """Return the tenant_id for a registered domain, or None if not found."""
    with _DOMAIN_REGISTRY_LOCK:
        registry = _load_domain_registry()
    return registry.get(domain)


def register_domain_mapping(domain: str, tenant_id: str) -> str:
    """
    Register a strict 1:1 mapping domain -> tenant_id.

    Rules (enforced atomically):
    - Idempotent: if domain already maps to tenant_id, return existing.
    - Conflict: if domain already maps to a different tenant, raise ValueError.
    - Collision: if tenant_id is already owned by a different domain, raise ValueError.
    - Otherwise: write new entry and return tenant_id.
    """
    with _DOMAIN_REGISTRY_LOCK:
        registry = _load_domain_registry()

        existing_tenant = registry.get(domain)
        if existing_tenant is not None:
            if existing_tenant == tenant_id:
                return tenant_id  # idempotent
            raise ValueError(
                f"Domain '{domain}' is already registered to tenant '{existing_tenant}'. "
                "Delete the existing registration before re-registering."
            )

        # Check if tenant_id is already claimed by a different domain.
        for existing_domain, existing_tid in registry.items():
            if existing_tid == tenant_id and existing_domain != domain:
                raise ValueError(
                    f"Tenant '{tenant_id}' is already owned by domain '{existing_domain}'. "
                    "Each domain must have its own isolated tenant."
                )

        registry[domain] = tenant_id
        _save_domain_registry(registry)
    return tenant_id


def list_registered_domains() -> Dict[str, str]:
    """Return a snapshot of the full domain-to-tenant registry."""
    with _DOMAIN_REGISTRY_LOCK:
        return dict(_load_domain_registry())


def tenant_storage_exists(tenant_id: str) -> bool:
    """Return True when a tenant already has a storage file on disk."""
    return _tenant_storage_path(tenant_id).exists()


# ---------------------------------------------------------------------------
# Default state initializer
# ---------------------------------------------------------------------------

def _init_default_state_on_store(store: "JsonFileStore") -> None:
    """Initialize default state structure for a specific tenant store."""
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
        # Seeded by backend auth bootstrap with hashed credentials.
        "system_users": [],
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


# ---------------------------------------------------------------------------
# TenantStoreProxy
# ---------------------------------------------------------------------------

class TenantStoreProxy:
    """
    Tenant-aware facade that routes every state call to the active tenant store.
    The active tenant is selected via context var (`push_tenant_context`).
    """

    def __init__(self):
        self._stores: Dict[str, JsonFileStore] = {}
        self._lock = threading.RLock()

    def _get_tenant_store(self, tenant_id: Optional[str] = None) -> JsonFileStore:
        tid = normalize_tenant_id(tenant_id or get_current_tenant_id())
        with self._lock:
            store = self._stores.get(tid)
            if store is None:
                path = _tenant_storage_path(tid)
                _maybe_migrate_legacy_storage(path, tid)
                store = JsonFileStore(filepath=str(path))
                _init_default_state_on_store(store)
                self._stores[tid] = store
            return store

    def for_tenant(self, tenant_id: Optional[str]) -> JsonFileStore:
        return self._get_tenant_store(tenant_id)

    def list_tenant_ids(self) -> List[str]:
        ids = set(self._stores.keys())
        base = Path("data") / "tenants"
        if base.exists():
            for entry in base.iterdir():
                if entry.is_dir():
                    tid = normalize_tenant_id(entry.name)
                    if tid:
                        ids.add(tid)
        ids.add(DEFAULT_TENANT_ID)
        return sorted(ids)

    @property
    def _state(self) -> Dict[str, Any]:
        return self._get_tenant_store()._state

    def get(self, key: str, default: Any = None) -> Any:
        return self._get_tenant_store().get(key, default)

    def set(self, key: str, value: Any):
        self._get_tenant_store().set(key, value)

    def setdefault(self, key: str, default: Any) -> Any:
        return self._get_tenant_store().setdefault(key, default)

    def update(self, updates: Dict[str, Any]):
        self._get_tenant_store().update(updates)

    def save(self):
        self._get_tenant_store().save()

    def load(self):
        self._get_tenant_store().load()

    def clear(self):
        self._get_tenant_store().clear()

    def __getitem__(self, key: str) -> Any:
        return self._get_tenant_store()[key]

    def __setitem__(self, key: str, value: Any):
        self._get_tenant_store()[key] = value

    def __contains__(self, key: str) -> bool:
        return key in self._get_tenant_store()

    def keys(self):
        return self._get_tenant_store().keys()

    def items(self):
        return self._get_tenant_store().items()

    @contextmanager
    def batch(self):
        with self._get_tenant_store().batch():
            yield self


# ---------------------------------------------------------------------------
# Global singletons
# ---------------------------------------------------------------------------

# Global tenant-aware store proxy
_store: Optional[TenantStoreProxy] = None


def get_store() -> TenantStoreProxy:
    """Get or create the tenant-aware storage proxy."""
    global _store
    if _store is None:
        _store = TenantStoreProxy()
    return _store


def list_known_tenant_ids() -> List[str]:
    return get_store().list_tenant_ids()


def init_default_state(tenant_id: Optional[str] = None):
    """Initialize default state structure for a specific tenant."""
    store = get_store().for_tenant(tenant_id or get_current_tenant_id())
    _init_default_state_on_store(store)


def reset_tenant_state(tenant_id: Optional[str] = None):
    """Replace a tenant store with the empty default state."""
    store = get_store().for_tenant(tenant_id or get_current_tenant_id())
    store.clear()
    _init_default_state_on_store(store)
    store.save()
