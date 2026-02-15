import os
import threading
import time
from typing import Any, Dict, Optional


class ResponseCache:
    """In-memory TTL cache with bounded size and periodic sweeps."""

    def __init__(self):
        self._cache: Dict[str, tuple] = {}  # key -> (value, expire_time)
        self._hits = 0
        self._misses = 0
        self._ops = 0
        self._lock = threading.RLock()
        self._max_keys = max(128, int(os.getenv("RESPONSE_CACHE_MAX_KEYS", "2048")))
        self._sweep_every = max(16, int(os.getenv("RESPONSE_CACHE_SWEEP_EVERY", "256")))

    def _touch_and_should_sweep_locked(self) -> bool:
        self._ops += 1
        return (self._ops % self._sweep_every) == 0

    def _purge_expired_locked(self, now_ts: Optional[float] = None) -> None:
        now = time.time() if now_ts is None else now_ts
        expired = [k for k, (_, exp) in self._cache.items() if exp <= now]
        for k in expired:
            self._cache.pop(k, None)

    def _enforce_capacity_locked(self) -> None:
        if len(self._cache) <= self._max_keys:
            return
        self._purge_expired_locked()
        if len(self._cache) <= self._max_keys:
            return
        overflow = len(self._cache) - self._max_keys
        for key, _ in sorted(self._cache.items(), key=lambda kv: kv[1][1])[:overflow]:
            self._cache.pop(key, None)

    def get(self, key: str) -> Optional[Any]:
        with self._lock:
            now = time.time()
            item = self._cache.get(key)
            if item is not None:
                value, expire_time = item
                if now < expire_time:
                    self._hits += 1
                    if self._touch_and_should_sweep_locked():
                        self._purge_expired_locked(now)
                    return value
                self._cache.pop(key, None)
            self._misses += 1
            if self._touch_and_should_sweep_locked():
                self._purge_expired_locked(now)
            return None

    def set(self, key: str, value: Any, ttl_seconds: float = 30.0) -> None:
        with self._lock:
            expire_at = time.time() + max(0.0, float(ttl_seconds))
            self._cache[key] = (value, expire_at)
            if self._touch_and_should_sweep_locked():
                self._purge_expired_locked()
            self._enforce_capacity_locked()

    def invalidate(self, key: Optional[str] = None) -> None:
        with self._lock:
            if key:
                self._cache.pop(key, None)
            else:
                self._cache.clear()

    def invalidate_prefix(self, prefix: str) -> None:
        if not prefix:
            return
        with self._lock:
            keys = [k for k in self._cache.keys() if k.startswith(prefix)]
            for key in keys:
                self._cache.pop(key, None)

    def stats(self) -> Dict[str, Any]:
        with self._lock:
            total = self._hits + self._misses
            hit_rate = (self._hits / total * 100) if total > 0 else 0
            return {
                "hits": self._hits,
                "misses": self._misses,
                "hit_rate": f"{hit_rate:.1f}%",
                "cached_keys": len(self._cache),
                "max_keys": self._max_keys,
                "sweep_every": self._sweep_every,
            }


# Global cache instance
RESPONSE_CACHE = ResponseCache()

# Cache TTL settings (seconds)
CACHE_TTL_MINING = 60.0  # Mining results (invalidated on new mining)
CACHE_TTL_KPI = 60.0  # KPI data
CACHE_TTL_USERS = 30.0  # User list
CACHE_TTL_ROLES = 30.0  # Business roles


def invalidate_hot_caches(
    *,
    users: bool = False,
    roles: bool = False,
    kpi: bool = False,
    mining: bool = False,
    ailab: bool = False,
) -> None:
    if users:
        RESPONSE_CACHE.invalidate_prefix("users_")
        RESPONSE_CACHE.invalidate("ad_groups")
    if roles:
        RESPONSE_CACHE.invalidate("businessroles")
        RESPONSE_CACHE.invalidate_prefix("role_meta_")
        RESPONSE_CACHE.invalidate_prefix("role_detail_users_")
    if kpi:
        RESPONSE_CACHE.invalidate("kpi")
        RESPONSE_CACHE.invalidate("kpi_cluster_quality_live")
        RESPONSE_CACHE.invalidate_prefix("kpi_drilldown_")
    if mining:
        RESPONSE_CACHE.invalidate_prefix("rolemining_last_")
    if ailab:
        RESPONSE_CACHE.invalidate_prefix("ailab_")

