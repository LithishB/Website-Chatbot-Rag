"""T1 exact-match response cache (Redis if REDIS_URL is set, else in-process)."""
import hashlib
import json
import re
import time

from . import config

_TIME_SENSITIVE = re.compile(r"\b(today|tonight|tomorrow|now|latest|current|currently|this week|right now)\b", re.I)
_PERSONAL = re.compile(r"\b(my|mine|i am|i'm|we are|we're|our)\b", re.I)
_PII = re.compile(r"[\w.+-]+@[\w-]+\.[\w.]+|\+?\d[\d\s().-]{6,}\d")


def canonicalize(text: str) -> str:
    """Lowercase, drop punctuation, collapse spaces. Words like 'not' stay."""
    text = re.sub(r"[^\w\s]", " ", text.lower())
    return re.sub(r"\s+", " ", text).strip()


def cache_key(question: str, version: str) -> str:
    digest = hashlib.sha256(canonicalize(question).encode()).hexdigest()
    return f"{config.SITE_ID}:{config.LANGUAGE}:{version}:{digest}"


def is_cacheable(question: str, resp: dict, flagged: bool) -> bool:
    return (
        resp.get("tier") in ("T3", "T4")
        and resp.get("kind") == "answer"
        and bool(resp.get("sources"))
        and not flagged
        and not _TIME_SENSITIVE.search(question)
        and not _PERSONAL.search(question)
        and not _PII.search(question)
    )


class ResponseCache:
    def __init__(self):
        self._mem: dict[str, tuple[float, str]] = {}
        self._by_entry: dict[str, set[str]] = {}
        self.hits: dict[str, int] = {}
        self._redis = None
        if config.REDIS_URL:
            try:
                import redis  # type: ignore
                self._redis = redis.Redis.from_url(config.REDIS_URL, socket_timeout=0.2)
            except Exception:
                self._redis = None

    def get(self, key: str) -> dict | None:
        """Any backend error is a miss: the cache never breaks the chat."""
        try:
            if self._redis:
                raw = self._redis.get(key)
                if raw:
                    self._redis.incr(f"hits:{key}")
                return json.loads(raw) if raw else None
            item = self._mem.get(key)
            if not item or item[0] < time.time():
                self._mem.pop(key, None)
                return None
            self.hits[key] = self.hits.get(key, 0) + 1
            return json.loads(item[1])
        except Exception:
            return None

    def set(self, key: str, resp: dict, ttl: int, entry_ids: list[str]) -> None:
        try:
            raw = json.dumps(resp)
            if self._redis:
                self._redis.setex(key, ttl, raw)
                for eid in entry_ids:
                    self._redis.sadd(f"entry:{eid}", key)
            else:
                self._mem[key] = (time.time() + ttl, raw)
                for eid in entry_ids:
                    self._by_entry.setdefault(eid, set()).add(key)
        except Exception:
            pass

    def invalidate_entry(self, entry_id: str) -> int:
        """KB entry edited -> delete only the answers built from it."""
        try:
            if self._redis:
                keys = [k.decode() for k in self._redis.smembers(f"entry:{entry_id}")]
                if keys:
                    self._redis.delete(*keys)
                self._redis.delete(f"entry:{entry_id}")
                return len(keys)
            keys = self._by_entry.pop(entry_id, set())
            for k in keys:
                self._mem.pop(k, None)
            return len(keys)
        except Exception:
            return 0
