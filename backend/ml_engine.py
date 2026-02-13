"""
Local ML Engine for Account Classification and Group Assignment Learning.

This module provides:
1. AccountClassifier: ML-based account type classification
2. GroupAssignmentLearner: Learns user→group patterns from historical data
3. FeedbackLoop: Records corrections for model retraining
4. Persistence: Saves/loads models to disk

Uses scikit-learn (Multinomial Naive Bayes / Logistic Regression) for lightweight,
CPU-friendly classification without requiring GPU.
"""

import os
import json
import time
import pickle
import re
from datetime import datetime
from collections import defaultdict
from typing import Any, Dict, List, Optional, Tuple, Set, DefaultDict, Union
import numpy as np
import threading

# scikit-learn imports (lightweight ML)
try:
    from sklearn.feature_extraction.text import TfidfVectorizer
    from sklearn.naive_bayes import MultinomialNB
    from sklearn.linear_model import LogisticRegression
    from sklearn.pipeline import Pipeline
    from sklearn.preprocessing import LabelEncoder
    SKLEARN_AVAILABLE = True
except ImportError:
    SKLEARN_AVAILABLE = False
    print("[ML Engine] WARNING: scikit-learn not available. ML features disabled.")


# =============================================================================
# ACCOUNT TYPES - Extended for Enterprise Context
# =============================================================================

ACCOUNT_TYPES = [
    "Internal",        # Standard employees (default)
    "External",        # Contractors, consultants, guests
    "Administrative",  # IT admins, privileged access
    "Service",         # Service accounts, bots, batch jobs
    "BlueCollar",      # Factory/plant workers
    "Executive",       # C-level, VIPs, directors
    "Manager",         # Team/department managers
    "Technical",       # IT/Dev staff
    "Temporary",       # Interns, temps, trainees
    "Shared",          # Shared/generic accounts
    "Disabled",        # Deactivated accounts
    "Application",     # Application identities, API accounts
]

# Rule-based detection patterns for each type
ACCOUNT_TYPE_PATTERNS = {
    "Service": {
        "display_name": ["svc", "service", "bot", "batch", "backup", "system", "scheduler", "job_", "task_"],
        "ou": ["service", "serviceaccounts", "automation"],
        "employee_type": ["service", "system", "bot"],
    },
    "Administrative": {
        "display_name": ["admin", "adm_", "root", "superuser", "priv_", "elevated"],
        "ou": ["admin", "privileged", "it_admin", "security"],
        "employee_type": ["admin", "administrator", "privileged"],
    },
    "External": {
        "display_name": ["ext", "consultant", "collaboratore", "guest", "vendor", "partner", "fornitore"],
        "ou": ["external", "guest", "contractor", "vendor", "partners"],
        "employee_type": ["external", "contractor", "consultant", "vendor", "guest"],
    },
    "Executive": {
        "display_name": ["ceo", "cfo", "cio", "cto", "coo", "vp_", "director", "executive", "president"],
        "ou": ["executive", "vip", "management", "board"],
        "employee_type": ["executive", "director", "vp", "c-level"],
    },
    "Manager": {
        "display_name": ["manager", "responsabile", "head_", "lead_", "supervisor", "coordinat"],
        "ou": ["management", "managers"],
        "employee_type": ["manager", "supervisor", "head", "lead"],
    },
    "Technical": {
        "display_name": ["dev_", "developer", "engineer", "tech_", "architect", "devops", "sre_"],
        "ou": ["it", "development", "engineering", "tech"],
        "employee_type": ["developer", "engineer", "technical", "devops"],
    },
    "BlueCollar": {
        "display_name": ["operaio", "worker_", "factory_", "plant_", "production_"],
        "ou": ["factory", "plant", "production", "warehouse", "logistics"],
        "employee_type": ["bluecollar", "worker", "operator", "production"],
    },
    "Temporary": {
        "display_name": ["intern", "temp_", "trainee", "stagista", "apprentice", "probation"],
        "ou": ["intern", "trainee", "temporary", "stage"],
        "employee_type": ["intern", "temporary", "trainee", "temp"],
    },
    "Shared": {
        "display_name": ["shared", "generic", "test", "demo", "training_", "lab_"],
        "ou": ["shared", "generic", "test"],
        "employee_type": ["shared", "generic", "test"],
    },
    "Disabled": {
        "display_name": ["disabled", "old_", "archived", "deleted_", "deactivated", "inactive"],
        "ou": ["disabled", "archived", "inactive"],
        "employee_type": ["disabled", "inactive", "terminated"],
    },
    "Application": {
        "display_name": ["app_", "application", "api_", "integration_", "connector_", "sync_"],
        "ou": ["application", "integration", "api"],
        "employee_type": ["application", "api", "integration"],
    },
}


class MLEngine:
    """
    Local ML system for account classification and group suggestion learning.
    
    Features:
    - Account type classification (ML + rule-based fallback)
    - Group assignment learning from user data
    - Feedback loop for manual corrections
    - Persistent model storage
    """
    
    def __init__(self, data_dir: str = "./ml_data"):
        self.data_dir = data_dir
        os.makedirs(data_dir, exist_ok=True)
        
        # Model paths
        self.classifier_path = os.path.join(data_dir, "account_classifier.pkl")
        self.group_model_path = os.path.join(data_dir, "group_predictor.pkl")
        self.history_path = os.path.join(data_dir, "training_history.json")
        self.brdb_path = os.path.join(data_dir, "brdb_state.json")
        self.custom_patterns_path = os.path.join(data_dir, "pattern_rules.json")
        
        # In-memory state
        self.classifier = None
        self.label_encoder = None
        self.vectorizer = None
        self.training_history = {"corrections": [], "confirmations": [], "last_train": None}
        
        # Knowledge Base (LLM derived)
        self.kb_path = os.path.join(data_dir, "knowledge_base.json")
        self.kb = {}
        
        # Custom regex patterns (user-defined, loaded from JSON)
        self.custom_patterns: List[Dict[str, str]] = []
        
        # BRDB state (Business Role DB)
        self.brdb = {
            "role_group_counts": defaultdict(lambda: defaultdict(float)),  # role -> group -> count
            "group_role_primary": {},  # group -> primary role
            "total_assignments": 0,
            "role_suggestions": {}, # Pre-calculated suggestions
        }
        
        self.lock = threading.Lock()
        
        
        # Load all persisted state
        self._load_state()

    @property
    def _role_group_counts(self) -> Any:
        """Type-safe access to role_group_counts."""
        return self.brdb.get("role_group_counts", {})

    @property
    def _group_role_primary(self) -> Any:
        """Type-safe access to group_role_primary."""
        return self.brdb.get("group_role_primary", {})

    @property
    def _total_assignments(self) -> int:
        """Type-safe access to total_assignments."""
        val = self.brdb.get("total_assignments", 0)
        if isinstance(val, int):
            return val
        return 0

    def _set_total_assignments(self, value: int):
        self.brdb["total_assignments"] = value

    # ... (skipping to classify_account_ml)

    def classify_account_ml(self, display_name: str, ou: str, employee_type: str) -> Tuple[str, float]:
        """
        ML-based account classification.
        
        Returns: (predicted_type, confidence)
        """
        if not self.is_ready():
            # Fall back to rules
            return self.classify_account_rules(display_name, ou, employee_type), 0.5
        
        # Assertions for type checker
        assert self.vectorizer is not None
        assert self.classifier is not None
        assert self.label_encoder is not None

        try:
            feature_text = self._build_feature_text(display_name, ou, employee_type)
            X = self.vectorizer.transform([feature_text])
            
            # Get prediction and probability
            pred_encoded = self.classifier.predict(X)[0]
            pred_proba = self.classifier.predict_proba(X)[0]
            
            predicted_type = self.label_encoder.inverse_transform([pred_encoded])[0]
            confidence = max(pred_proba)
            
            return predicted_type, float(confidence)
        except Exception as e:
            print(f"[ML Engine] Classification error: {e}")
            return self.classify_account_rules(display_name, ou, employee_type), 0.5
    
    def _load_state(self):
        """Load all persisted state components."""
        self._load_classifier()
        self._load_training_history()
        self._load_custom_patterns()
        self._load_knowledge_base()
        self._load_brdb()

    def _load_knowledge_base(self):
        """Load the LLM-derived knowledge base."""
        if os.path.exists(self.kb_path):
            try:
                with open(self.kb_path, "r", encoding="utf-8") as f:
                    self.kb = json.load(f)
                # Optimization: pre-lower KB roles for faster matching
                kb_defs = self.kb.get("role_definitions", {})
                self._kb_roles_lowered = {k.lower(): v for k, v in kb_defs.items()}
            except Exception as e:
                print(f"[ML Engine] Failed to load KB: {e}")
                self._kb_roles_lowered = {}
        else:
            self._kb_roles_lowered = {}

    def _load_classifier(self):
        """Load classifier and vectorizer models."""
        if os.path.exists(self.classifier_path) and SKLEARN_AVAILABLE:
            try:
                with open(self.classifier_path, "rb") as f:
                    data = pickle.load(f)
                    self.classifier = data.get("classifier")
                    self.label_encoder = data.get("label_encoder")
                    self.vectorizer = data.get("vectorizer")
            except Exception as e:
                print(f"[ML Engine] Failed to load classifier: {e}")

    def _load_training_history(self):
        """Load persisted training history."""
        if os.path.exists(self.history_path):
            try:
                with open(self.history_path, "r", encoding="utf-8") as f:
                    self.training_history = json.load(f)
            except Exception as e:
                print(f"[ML Engine] Failed to load history: {e}")

    def _load_custom_patterns(self):
        """Load user-defined regex patterns."""
        if os.path.exists(self.custom_patterns_path):
            try:
                with open(self.custom_patterns_path, "r", encoding="utf-8") as f:
                    self.custom_patterns = json.load(f)
            except Exception as e:
                print(f"[ML Engine] Failed to load custom patterns: {e}")
                self.custom_patterns = []

    def _load_brdb(self):
        """Load BRDB state from disk."""
        if os.path.exists(self.brdb_path):
            try:
                with open(self.brdb_path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    
                    # Reconstruct correctly typed defaultdicts
                    role_group_counts: Any = defaultdict(lambda: defaultdict(float))
                    if "role_group_counts" in data:
                        for role, groups in data["role_group_counts"].items():
                            for group, count in groups.items():
                                role_group_counts[role][group] = float(count)
                    
                    self.brdb = {
                        "role_group_counts": role_group_counts,
                        "group_role_primary": data.get("group_role_primary", {}),
                        "total_assignments": int(data.get("total_assignments", 0)),
                        "role_suggestions": data.get("role_suggestions", {}),
                    }
            except Exception as e:
                print(f"[ML Engine] Failed to load BRDB: {e}")
                self._reset_brdb()
        else:
            self._reset_brdb()
            
    def _reset_brdb(self):
        self.brdb = {
            "role_group_counts": defaultdict(lambda: defaultdict(float)),
            "group_role_primary": {}, 
            "total_assignments": 0,
            "role_suggestions": {},
        }
    
    def _save_state(self):
        """Persist models and training history."""
        # Save classifier
        if self.classifier is not None and SKLEARN_AVAILABLE:
            try:
                with open(self.classifier_path, "wb") as f:
                    pickle.dump({
                        "classifier": self.classifier,
                        "label_encoder": self.label_encoder,
                        "vectorizer": self.vectorizer
                    }, f)
            except Exception as e:
                print(f"[ML Engine] Failed to save classifier: {e}")
        
        # Save history
        try:
            with open(self.history_path, "w", encoding="utf-8") as f:
                json.dump(self.training_history, f, indent=2)
        except Exception as e:
            print(f"[ML Engine] Failed to save history: {e}")
            
        # Save BRDB
        with self.lock:
            try:
                # Take a snapshot to avoid "dictionary changed size during iteration"
                snapshot_counts = {k: dict(v) for k, v in self.brdb["role_group_counts"].items()}
                snapshot_primaries = dict(self.brdb.get("group_role_primary", {}))
                snapshot_suggestions = dict(self.brdb.get("role_suggestions", {}))
                
                with open(self.brdb_path, "w", encoding="utf-8") as f:
                    serializable_brdb = {
                        "role_group_counts": snapshot_counts,
                        "group_role_primary": snapshot_primaries,
                        "total_assignments": int(self.brdb.get("total_assignments", 0)),
                        "role_suggestions": snapshot_suggestions,
                    }
                    json.dump(serializable_brdb, f, indent=2)
            except Exception as e:
                print(f"[ML Engine] Failed to save BRDB: {e}")

    def is_ready(self) -> bool:
        """Check if ML classifier is trained and ready."""
        return self.classifier is not None and self.vectorizer is not None and SKLEARN_AVAILABLE

    def check_custom_rules(self, field_map: Dict[str, str]) -> Optional[str]:
        """Check user-defined custom regex rules."""
        for rule in (self.custom_patterns or []):
            field = rule.get("field", "")
            regex = rule.get("regex", "")
            atype = rule.get("account_type", "")
            
            if not field or not regex or not atype:
                continue
            
            # Allow matching against any field in field_map
            # If field is not in map, it's empty string (no match)
            value = field_map.get(field, "")
            
            if value:
                try:
                    if re.search(regex, value, re.IGNORECASE):
                        return atype
                except re.error:
                    continue  # Skip invalid regex
        return None

    def classify_account_rules(self, display_name: str, ou: str, employee_type: str, attributes: Dict[str, Any] = None) -> str:
        """
        Rule-based classification fallback (Static patterns only).
        Note: Custom rules are now handled in classify_account before ML.
        This method checks STATIC patterns defined in ACCOUNT_TYPE_PATTERNS.
        """
        dn = (display_name or "").lower()
        ou_lower = (ou or "").lower()
        etype = (employee_type or "").lower()
        
        # 2) Check static patterns in priority order
        type_priority = [
            "Service", "Administrative", "Application", "Disabled",
            "External", "Executive", "Manager", "Technical",
            "BlueCollar", "Temporary", "Shared", "Internal"
        ]
        
        for account_type in type_priority:
            if account_type == "Internal":
                continue  # Default fallback
            
            patterns = ACCOUNT_TYPE_PATTERNS.get(account_type, {})
            
            # Check display_name patterns
            for p in patterns.get("display_name", []):
                if p in dn:
                    return account_type
            
            # Check OU patterns
            for p in patterns.get("ou", []):
                if p in ou_lower:
                    return account_type
            
            # Check employee_type patterns
            for p in patterns.get("employee_type", []):
                if p in etype:
                    return account_type
        
        return "Internal"

    def classify_account(self, display_name: str, ou: str, employee_type: str, 
                         confidence_threshold: float = 0.75, attributes: Dict[str, Any] = None) -> Tuple[str, float, str]:
        """
        Hybrid classification: Custom Rules -> ML -> Static Rules.
        
        Returns: (account_type, confidence, method)
            method: "custom_rule", "ml", or "static_rule"
        """
        # Prepare field map for custom rules
        dn = (display_name or "").lower()
        ou_lower = (ou or "").lower()
        etype = (employee_type or "").lower()
        
        field_map = {"display_name": dn, "ou": ou_lower, "employee_type": etype}
        if attributes:
            for k, v in attributes.items():
                if isinstance(v, str):
                    field_map[k] = v.lower()
                elif isinstance(v, list) and v and isinstance(v[0], str):
                     field_map[k] = " ".join(v).lower()
                else:
                    field_map[k] = str(v).lower()

        # 1. Check Custom Rules (Highest Priority)
        custom_type = self.check_custom_rules(field_map)
        if custom_type:
            return custom_type, 1.0, "custom_rule"

        # 2. ML Classification
        if self.is_ready():
            try:
                # ML currently only uses base fields, but could be extended
                # We catch exceptions here to be safe
                ml_type, ml_conf = self.classify_account_ml(display_name, ou, employee_type)
                if ml_conf >= confidence_threshold:
                    return ml_type, ml_conf, "ml"
            except Exception as e:
                print(f"[ML Engine] Prediction error: {e}")
        
        # 3. Static Rules Fallback
        rule_type = self.classify_account_rules(display_name, ou, employee_type, attributes=attributes)
        return rule_type, 0.6, "static_rule"
    
    # =========================================================================
    # CUSTOM PATTERN MANAGEMENT
    # =========================================================================
    
    def get_patterns(self) -> Dict[str, Any]:
        """Return all patterns: static defaults + custom user-defined."""
        return {
            "static": {k: v for k, v in ACCOUNT_TYPE_PATTERNS.items()},
            "custom": list(self.custom_patterns),
        }
    
    def add_pattern(self, account_type: str, field: str, regex: str) -> Dict[str, Any]:
        """Add a new custom regex pattern rule."""
        # Validate regex
        try:
            re.compile(regex)
        except re.error as e:
            return {"success": False, "error": f"Invalid regex: {e}"}
        
        if not field:
             return {"success": False, "error": "Field cannot be empty"}

        # Add account type to ACCOUNT_TYPES if new
        if account_type not in ACCOUNT_TYPES:
            ACCOUNT_TYPES.append(account_type)
        
        rule = {
            "account_type": account_type,
            "field": field,
            "regex": regex,
            "created_at": datetime.now().isoformat(),
        }
        self.custom_patterns.append(rule)
        self._save_custom_patterns()
        return {"success": True, "rule": rule, "total_custom_rules": len(self.custom_patterns)}
    
    def delete_pattern(self, index: int) -> Dict[str, Any]:
        """Delete a custom pattern by index."""
        if index < 0 or index >= len(self.custom_patterns):
            return {"success": False, "error": "Invalid index"}
        removed = self.custom_patterns.pop(index)
        self._save_custom_patterns()
        return {"success": True, "removed": removed, "total_custom_rules": len(self.custom_patterns)}
    
    def _save_custom_patterns(self):
        """Persist custom patterns to disk."""
        try:
            with open(self.custom_patterns_path, "w", encoding="utf-8") as f:
                json.dump(self.custom_patterns, f, indent=2, default=str)
        except Exception as e:
            print(f"[ML Engine] Failed to save custom patterns: {e}")
    
    def classify_account_ml(self, display_name: str, ou: str, employee_type: str) -> Tuple[str, float]:
        """
        ML-based account classification.
        
        Returns: (predicted_type, confidence)
        """
        if not self.is_ready():
            # Fall back to rules
            return self.classify_account_rules(display_name, ou, employee_type), 0.5
        
        try:
            feature_text = self._build_feature_text(display_name, ou, employee_type)
            # Ensure vectorizer is valid (is_ready checks this, but for lint safety)
            if self.vectorizer is None: 
                raise ValueError("Vectorizer is None")

            X = self.vectorizer.transform([feature_text])
            
            # Get prediction and probability
            pred_encoded = self.classifier.predict(X)[0]
            pred_proba = self.classifier.predict_proba(X)[0]
            
            predicted_type = self.label_encoder.inverse_transform([pred_encoded])[0]
            confidence = max(pred_proba)
            
            return predicted_type, float(confidence)
        except Exception as e:
            print(f"[ML Engine] Classification error: {e}")
            return self.classify_account_rules(display_name, ou, employee_type), 0.5

    
    def _save_state(self):
        """Persist models and training history."""
        # Save classifier
        if self.classifier is not None and SKLEARN_AVAILABLE:
            try:
                with open(self.classifier_path, "wb") as f:
                    pickle.dump({
                        "classifier": self.classifier,
                        "label_encoder": self.label_encoder,
                        "vectorizer": self.vectorizer,
                    }, f)
            except Exception as e:
                print(f"[ML Engine] Failed to save classifier: {e}")
        
        # Save training history
        try:
            with open(self.history_path, "w", encoding="utf-8") as f:
                json.dump(self.training_history, f, indent=2, default=str)
        except Exception as e:
            print(f"[ML Engine] Failed to save history: {e}")
        
        # Save BRDB state
        try:
            with open(self.brdb_path, "w", encoding="utf-8") as f:
                json.dump({
                    "role_group_counts": {k: dict(v) for k, v in self.brdb["role_group_counts"].items()},
                    "group_role_primary": self.brdb["group_role_primary"],
                    "total_assignments": self.brdb["total_assignments"],
                }, f, indent=2)
        except Exception as e:
            print(f"[ML Engine] Failed to save BRDB: {e}")
    
    # =========================================================================
    # ACCOUNT CLASSIFICATION
    # =========================================================================
    
    def is_ready(self) -> bool:
        """Check if ML classifier is trained and ready."""
        return self.classifier is not None and SKLEARN_AVAILABLE
    
    def _build_feature_text(self, display_name: str, ou: str, employee_type: str) -> str:
        """Create feature text from user attributes for ML vectorization."""
        parts = []
        if display_name:
            parts.append(f"dn_{display_name.lower().replace(' ', '_')}")
        if ou:
            parts.append(f"ou_{ou.lower().replace(' ', '_')}")
        if employee_type:
            parts.append(f"et_{employee_type.lower().replace(' ', '_')}")
        return " ".join(parts)
    
    def check_custom_rules(self, field_map: Dict[str, str]) -> Optional[str]:
        """Check user-defined custom regex rules."""
        for rule in (self.custom_patterns or []):
            field = rule.get("field", "")
            regex = rule.get("regex", "")
            atype = rule.get("account_type", "")
            
            if not field or not regex or not atype:
                continue
            
            # Allow matching against any field in field_map
            # If field is not in map, it's empty string (no match)
            value = field_map.get(field, "")
            
            if value:
                try:
                    if re.search(regex, value, re.IGNORECASE):
                        return atype
                except re.error:
                    continue  # Skip invalid regex
        return None

    def classify_account_rules(self, display_name: str, ou: str, employee_type: str, attributes: Dict[str, Any] = None) -> str:
        """
        Rule-based classification fallback (Static patterns only).
        Note: Custom rules are now handled in classify_account before ML.
        This method checks STATIC patterns defined in ACCOUNT_TYPE_PATTERNS.
        """
        dn = (display_name or "").lower()
        ou_lower = (ou or "").lower()
        etype = (employee_type or "").lower()
        
        # 2) Check static patterns in priority order
        type_priority = [
            "Service", "Administrative", "Application", "Disabled",
            "External", "Executive", "Manager", "Technical",
            "BlueCollar", "Temporary", "Shared", "Internal"
        ]
        
        for account_type in type_priority:
            if account_type == "Internal":
                continue  # Default fallback
            
            patterns = ACCOUNT_TYPE_PATTERNS.get(account_type, {})
            
            # Check display_name patterns
            for p in patterns.get("display_name", []):
                if p in dn:
                    return account_type
            
            # Check OU patterns
            for p in patterns.get("ou", []):
                if p in ou_lower:
                    return account_type
            
            # Check employee_type patterns
            for p in patterns.get("employee_type", []):
                if p in etype:
                    return account_type
        
        return "Internal"

    def classify_account(self, display_name: str, ou: str, employee_type: str, 
                         confidence_threshold: float = 0.75, attributes: Dict[str, Any] = None) -> Tuple[str, float, str]:
        """
        Hybrid classification: Custom Rules -> ML -> Static Rules.
        
        Returns: (account_type, confidence, method)
            method: "custom_rule", "ml", or "static_rule"
        """
        # Prepare field map for custom rules
        dn = (display_name or "").lower()
        ou_lower = (ou or "").lower()
        etype = (employee_type or "").lower()
        
        field_map = {"display_name": dn, "ou": ou_lower, "employee_type": etype}
        if attributes:
            for k, v in attributes.items():
                if isinstance(v, str):
                    field_map[k] = v.lower()
                elif isinstance(v, list) and v and isinstance(v[0], str):
                     field_map[k] = " ".join(v).lower()
                else:
                    field_map[k] = str(v).lower()

        # 1. Check Custom Rules (Highest Priority)
        custom_type = self.check_custom_rules(field_map)
        if custom_type:
            return custom_type, 1.0, "custom_rule"

        # 2. ML Classification
        if self.is_ready():
            try:
                # ML currently only uses base fields, but could be extended
                # We catch exceptions here to be safe
                ml_type, ml_conf = self.classify_account_ml(display_name, ou, employee_type)
                if ml_conf >= confidence_threshold:
                    return ml_type, ml_conf, "ml"
            except Exception as e:
                print(f"[ML Engine] Prediction error: {e}")
        
        # 3. Static Rules Fallback
        rule_type = self.classify_account_rules(display_name, ou, employee_type, attributes=attributes)
        return rule_type, 0.6, "static_rule"
    
    # =========================================================================
    # CUSTOM PATTERN MANAGEMENT
    # =========================================================================
    
    def get_patterns(self) -> Dict[str, Any]:
        """Return all patterns: static defaults + custom user-defined."""
        return {
            "static": {k: v for k, v in ACCOUNT_TYPE_PATTERNS.items()},
            "custom": list(self.custom_patterns),
        }
    
    def add_pattern(self, account_type: str, field: str, regex: str) -> Dict[str, Any]:
        """Add a new custom regex pattern rule."""
        # Validate regex
        try:
            re.compile(regex)
        except re.error as e:
            return {"success": False, "error": f"Invalid regex: {e}"}
        
        # Validate field - REMOVED strict validation to allow custom AD attributes
        # valid_fields = ["display_name", "ou", "employee_type"]
        # if field not in valid_fields:
        #    return {"success": False, "error": f"Invalid field. Must be one of: {valid_fields}"}
        
        if not field:
             return {"success": False, "error": "Field cannot be empty"}

        # Add account type to ACCOUNT_TYPES if new
        if account_type not in ACCOUNT_TYPES:
            ACCOUNT_TYPES.append(account_type)
        
        rule = {
            "account_type": account_type,
            "field": field,
            "regex": regex,
            "created_at": datetime.now().isoformat(),
        }
        self.custom_patterns.append(rule)
        self._save_custom_patterns()
        return {"success": True, "rule": rule, "total_custom_rules": len(self.custom_patterns)}
    
    def delete_pattern(self, index: int) -> Dict[str, Any]:
        """Delete a custom pattern by index."""
        if index < 0 or index >= len(self.custom_patterns):
            return {"success": False, "error": "Invalid index"}
        removed = self.custom_patterns.pop(index)
        self._save_custom_patterns()
        return {"success": True, "removed": removed, "total_custom_rules": len(self.custom_patterns)}
    
    def _save_custom_patterns(self):
        """Persist custom patterns to disk."""
        try:
            with open(self.custom_patterns_path, "w", encoding="utf-8") as f:
                json.dump(self.custom_patterns, f, indent=2, default=str)
        except Exception as e:
            print(f"[ML Engine] Failed to save custom patterns: {e}")
    
    def classify_account_ml(self, display_name: str, ou: str, employee_type: str) -> Tuple[str, float]:
        """
        ML-based account classification.
        
        Returns: (predicted_type, confidence)
        """
        if not self.is_ready():
            # Fall back to rules
            return self.classify_account_rules(display_name, ou, employee_type), 0.5
        
        try:
            feature_text = self._build_feature_text(display_name, ou, employee_type)
            X = self.vectorizer.transform([feature_text])
            
            # Get prediction and probability
            pred_encoded = self.classifier.predict(X)[0]
            pred_proba = self.classifier.predict_proba(X)[0]
            
            predicted_type = self.label_encoder.inverse_transform([pred_encoded])[0]
            confidence = max(pred_proba)
            
            return predicted_type, float(confidence)
        except Exception as e:
            print(f"[ML Engine] Classification error: {e}")
            return self.classify_account_rules(display_name, ou, employee_type), 0.5
    
    # =========================================================================
    # TRAINING & FEEDBACK
    # =========================================================================
    
    def record_correction(self, username: str, display_name: str, ou: str, 
                          employee_type: str, old_type: str, new_type: str):
        """Record a manual correction for model retraining."""
        self.training_history["corrections"].append({
            "timestamp": datetime.now().isoformat(),
            "username": username,
            "display_name": display_name,
            "ou": ou,
            "employee_type": employee_type,
            "old_type": old_type,
            "new_type": new_type,
        })
        self._save_state()
    
    def record_confirmation(self, username: str, display_name: str, ou: str,
                            employee_type: str, confirmed_type: str):
        """Record when a user confirms a classification is correct."""
        self.training_history["confirmations"].append({
            "timestamp": datetime.now().isoformat(),
            "username": username,
            "display_name": display_name,
            "ou": ou,
            "employee_type": employee_type,
            "confirmed_type": confirmed_type,
        })
        self._save_state()
    
    def train_classifier(self, training_data: List[Dict[str, Any]], force: bool = False) -> Dict[str, Any]:
        """
        Train the account classifier from labeled data.
        
        training_data: list of {"display_name", "ou", "employee_type", "account_type"}
        """
        if not SKLEARN_AVAILABLE:
            return {"success": False, "error": "scikit-learn not available"}
        
        if len(training_data) < 10 and not force:
            return {"success": False, "error": "Need at least 10 samples to train"}
        
        try:
            # Build features and labels
            texts = []
            labels = []
            for item in training_data:
                text = self._build_feature_text(
                    item.get("display_name", ""),
                    item.get("ou", ""),
                    item.get("employee_type", "")
                )
                texts.append(text)
                labels.append(item.get("account_type", "Internal"))
            
            # Encode labels
            self.label_encoder = LabelEncoder()
            y = self.label_encoder.fit_transform(labels)
            
            # Vectorize text features
            self.vectorizer = TfidfVectorizer(
                ngram_range=(1, 2),
                max_features=1000,
                min_df=1,
            )
            X = self.vectorizer.fit_transform(texts)
            
            # Train classifier (Naive Bayes or Logistic Regression)
            if len(set(labels)) > 2:
                # Use LogisticRegression for multiclass (sklearn auto-handles multiclass)
                self.classifier = LogisticRegression(
                    max_iter=500,
                    solver="lbfgs",
                    random_state=42,
                )
            else:
                self.classifier = MultinomialNB()
            
            self.classifier.fit(X, y)
            
            # Record training
            self.training_history["last_train"] = datetime.now().isoformat()
            self._save_state()
            
            return {
                "success": True,
                "samples": len(training_data),
                "classes": list(self.label_encoder.classes_),
                "trained_at": self.training_history["last_train"],
            }
        except Exception as e:
            return {"success": False, "error": str(e)}
    
    def retrain_from_history(self) -> Dict[str, Any]:
        """Retrain using accumulated corrections and confirmations."""
        training_data = []
        
        # Use confirmations as positive samples
        for c in self.training_history.get("confirmations", []):
            training_data.append({
                "display_name": c.get("display_name", ""),
                "ou": c.get("ou", ""),
                "employee_type": c.get("employee_type", ""),
                "account_type": c.get("confirmed_type", "Internal"),
            })
        
        # Use corrections (the corrected type is the ground truth)
        for c in self.training_history.get("corrections", []):
            training_data.append({
                "display_name": c.get("display_name", ""),
                "ou": c.get("ou", ""),
                "employee_type": c.get("employee_type", ""),
                "account_type": c.get("new_type", "Internal"),
            })
        
        if not training_data:
            return {"success": False, "error": "No training data available"}
        
        return self.train_classifier(training_data, force=True)
    
    # =========================================================================
    # BRDB: Business Role Database (Group-Role Learning)
    # =========================================================================
    
    
    def brdb_learn_assignment(self, role: str, groups: List[str], weight: float = 1.0, suppress_save: bool = False):
        """Record a confirmed role→groups assignment for learning."""
        role = (role or "").strip()
        if not role or not groups:
            return
        
        with self.lock:
            counts = self._role_group_counts

            for g in groups:
                g = (g or "").strip()
                if not g:
                    continue
                counts[role][g] += weight
            
            self._set_total_assignments(self._total_assignments + 1)
        
        if not suppress_save:
            # Update primary role for each group
            self._update_group_primaries()
            # Update cache for this role specifically
            self.brdb["role_suggestions"][role] = self._calculate_suggestions(role, set(), 0.1, 100)
            self._save_state()
    
    def _update_group_primaries(self):
        """Update the primary role for each group based on counts."""
        group_totals = defaultdict(lambda: defaultdict(float))
        
        counts = self._role_group_counts
        
        for role, groups in counts.items():
            for group, count in groups.items():
                group_totals[group][role] += count
        
        for group, role_counts in group_totals.items():
            if role_counts:
                primary = max(role_counts.items(), key=lambda x: x[1])[0]
                self._group_role_primary[group] = primary
        if isinstance(counts, int): 
            return

        for role, groups in counts.items():
            for group, count in groups.items():
                group_totals[group][role] += count
        
        for group, role_counts in group_totals.items():
            if role_counts:
                primary = max(role_counts.items(), key=lambda x: x[1])[0]
                self.brdb["group_role_primary"][group] = primary
    
    def brdb_infer_group(self, group: str) -> Dict[str, Any]:
        """Infer which role a group belongs to based on learned patterns."""
        group = (group or "").strip()
        if not group:
            return {"role": None, "confidence": 0.0, "evidence": {}}
        
        # Check direct primary mapping. Cast to dict ensures type safety.
        primaries = self._group_role_primary
        
        primary = primaries.get(group)
        if not primary:
            return {"role": None, "confidence": 0.0, "evidence": {"reason": "never seen"}}
        
        # Calculate confidence based on count distribution
        role_counts = {}
        total = 0.0
        
        counts = self._role_group_counts
        
        for role, groups in counts.items():
            if group in groups:
                role_counts[role] = groups[group]
                total += groups[group]
        
        if total == 0:
            return {"role": None, "confidence": 0.0, "evidence": {}}
        
        confidence = role_counts.get(primary, 0) / total
        
        return {
            "role": primary,
            "confidence": round(confidence, 3),
            "evidence": {
                "total_assignments": int(total),
                "role_counts": {k: int(v) for k, v in role_counts.items()},
            }
        }
    
    def brdb_rebuild(self, users: List[Dict[str, Any]]):
        """Rebuild BRDB from user data."""
        with self.lock:
            # Reset counts
            self.brdb["role_group_counts"] = defaultdict(lambda: defaultdict(float))
            self.brdb["group_role_primary"] = {}
            self.brdb["total_assignments"] = 0
            # role_suggestions is kept to allow stale hits while rebuilding
            for u in users:
                # Defensive: AD extracts may contain null businessRole
                role = (u.get("businessRole") or "").strip()
                groups = u.get("groups", [])
                
                if role and role != "Unassigned" and groups:
                    # Optimized: skip saving/updating on every single user
                    # Pass weight=1.0 directly to logic since we are under the lock
                    # and we don't want to nested-lock by calling brdb_learn_assignment
                    for g in groups:
                        g = (g or "").strip()
                        if not g: continue
                        self.brdb["role_group_counts"][role][g] += 1.0
                    self.brdb["total_assignments"] += 1
        
        # Final batch update
        self._update_group_primaries()
        # Optimization: remove synchronous precompute to avoid long hangs.
        # Cache will be populated on-demand.
        self._save_state()
    
    def brdb_suggest_groups(self, role: str, exclude: set = None, min_conf: float = 0.5, limit: int = 50) -> List[Dict[str, Any]]:
        """Suggest groups for a role based on learned patterns and LLM Knowledge Base."""
        role = (role or "").strip()
        exclude = exclude or set()
        
        if not role:
            return []

        # 1. Use cached suggestions if available and no specific exclude/min_conf constraint
        # (Actually, we always filter by exclude/min_conf/limit for safety)
        cached = self.brdb.get("role_suggestions", {}).get(role)
        if cached:
            out = []
            for item in cached:
                if item["group"] in exclude: continue
                if item["confidence"] < min_conf: continue
                out.append(item)
                if len(out) >= limit: break
            if out: return out
            # If out is empty, it might be because min_conf is too strict, 
            # or the cache is just old. We'll recalculate.

        # 2. Fallback to calculation
        suggestions = self._calculate_suggestions(role, exclude, min_conf, limit)
        
        # 3. On-demand cache population
        # We store the most complete version (low min_conf, NO exclude) to the cache
        complete_suggestions = self._calculate_suggestions(role, set(), 0.1, 100)
        with self.lock:
            self.brdb["role_suggestions"][role] = complete_suggestions
            
        return suggestions

    def _calculate_suggestions(self, role: str, exclude: set, min_conf: float, limit: int) -> List[Dict[str, Any]]:
        counts = self.brdb["role_group_counts"]
        if isinstance(counts, int): return []
        
        role_groups = counts.get(role, {})
        total = sum(role_groups.values()) if role_groups else 0
        
        suggestions = []
        seen_groups = set()

        # A) Add groups from Statistical analysis
        if total > 0:
            for group, count in role_groups.items():
                if group in exclude: continue
                conf = count / total
                if conf >= min_conf:
                    suggestions.append({
                        "group": group,
                        "confidence": round(conf, 3),
                        "count": int(count),
                        "source": "statistical"
                    })
                    seen_groups.add(group)

        # B) Add groups from Knowledge Base (LLM-based confidence)
        # These are high-priority/high-confidence suggestions
        kb_role_defs = self.kb.get("role_definitions", {})
        
        # Optimized lookup: lower role once
        role_lowered = role.lower()
        role_kb_groups = kb_role_defs.get(role) # exact match first
        
        if not role_kb_groups:
             # Try optimized substring match using pre-lowered keys
             for k_low, v in self._kb_roles_lowered.items():
                 if k_low in role_lowered or role_lowered in k_low:
                     role_kb_groups = v
                     break
        
        if role_kb_groups:
            for group in role_kb_groups:
                if group in exclude: continue
                # Boost confidence for KB-defined groups
                if group in seen_groups:
                    for s in suggestions:
                        if s["group"] == group:
                            s["confidence"] = max(s["confidence"], 0.95)
                            s["source"] = "hybrid"
                else:
                    suggestions.append({
                        "group": group,
                        "confidence": 0.95,
                        "count": 0,
                        "source": "llm_kb"
                    })
                    seen_groups.add(group)

        suggestions.sort(key=lambda x: x["confidence"], reverse=True)
        return suggestions[:limit]

    def _precompute_all_suggestions(self):
        """Pre-calculate and store suggestions for all known roles."""
        roles = list(self.brdb["role_group_counts"].keys())
        kb_roles = list(self.kb.get("role_definitions", {}).keys())
        all_roles = set(roles) | set(kb_roles)
        
        suggestions_cache = {}
        for role in all_roles:
            # We calculate with low min_conf and high limit for the cache
            suggestions_cache[role] = self._calculate_suggestions(role, set(), 0.1, 100)
        
        self.brdb["role_suggestions"] = suggestions_cache
    
    # =========================================================================
    # STATUS & METRICS
    # =========================================================================
    
    def get_status(self) -> Dict[str, Any]:
        """Return ML engine status and metrics."""
        return {
            "sklearn_available": SKLEARN_AVAILABLE,
            "classifier_ready": self.is_ready(),
            "account_types": ACCOUNT_TYPES,
            "training_history": {
                "corrections": len(self.training_history.get("corrections", [])),
                "confirmations": len(self.training_history.get("confirmations", [])),
                "last_train": self.training_history.get("last_train"),
            },
            "brdb": {
                "roles_tracked": len(self.brdb["role_group_counts"]),
                "groups_mapped": len(self.brdb["group_role_primary"]),
                "total_assignments": self.brdb["total_assignments"],
            },
        }


# =============================================================================
# SINGLETON INSTANCE
# =============================================================================

_ml_engine_instance: Optional[MLEngine] = None

def get_ml_engine(data_dir: str = "./ml_data") -> MLEngine:
    """Get or create the singleton ML engine instance."""
    global _ml_engine_instance
    if _ml_engine_instance is None:
        _ml_engine_instance = MLEngine(data_dir=data_dir)
    return _ml_engine_instance
