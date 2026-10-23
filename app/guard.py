"""T0 guard: normalization, injection scoring, sessions, token buckets, bans."""
import base64
import hashlib
import hmac
import json
import re
import time
import unicodedata
from collections import defaultdict, deque

import httpx

from . import config


# ---------------------------------------------------------------- normalization
def normalize(text: str) -> tuple[str, int]:
    """NFKC -> drop hidden/control characters -> collapse whitespace.

    Returns (clean_text, removed_count). Case is preserved; lowercasing happens
    later when the cache key is built.
    """
    text = unicodedata.normalize("NFKC", text)
    text = text.replace("\t", " ").replace("\r", "\n")
    kept, removed = [], 0
    for ch in text:
        if ch == "\n":
            kept.append(" ")
        elif unicodedata.category(ch) in ("Cc", "Cf"):
            # Cf covers zero-width, direction overrides, joiners, BOM, tag chars
            removed += 1
        else:
            kept.append(ch)
    return re.sub(r"\s+", " ", "".join(kept)).strip(), removed


# ---------------------------------------------------------------- injection score
_HARD = [re.compile(p, re.I) for p in (
    r"ignore (all |any |the |your )?(previous|prior|above|earlier)? ?(instructions|rules|prompts?)",
    r"disregard .{0,30}(instructions|rules)",
    r"\b(no|without|any) (rules|restrictions|limits|guidelines)\b",
    r"system prompt",
    r"jailbreak",
    r"developer mode",
    r"do anything now",
    r"reveal .{0,30}(prompt|instructions)",
)]
_SOFT = [re.compile(p, re.I) for p in (
    r"\bact as\b", r"\bpretend\b", r"role ?play", r"you are now",
    r"\bforget\b.{0,20}\b(everything|instructions)", r"repeat (the|your) (above|instructions|prompt)",
    r"\boverride\b", r"\bbypass\b",
)]


def injection_status(text: str, removed: int) -> str:
    """'clean' | 'flagged' (answer from KB only, LLM off) | 'unsupported' (refuse)."""
    score = sum(5 for p in _HARD if p.search(text)) + sum(2 for p in _SOFT if p.search(text))
    if removed >= 3:
        score += 2
    if score >= 5:
        return "unsupported"
    return "flagged" if score >= 2 else "clean"


# ---------------------------------------------------------------- sessions
def _sign(payload: str) -> str:
    return hmac.new(config.SESSION_SECRET.encode(), payload.encode(), hashlib.sha256).hexdigest()


def issue_session(sid: str) -> tuple[str, int]:
    exp = int(time.time()) + config.SESSION_TTL
    payload = base64.urlsafe_b64encode(json.dumps({"sid": sid, "exp": exp}).encode()).decode()
    return f"{payload}.{_sign(payload)}", exp


def verify_session(token: str | None) -> str | None:
    try:
        payload, sig = (token or "").split(".", 1)
        if not hmac.compare_digest(sig, _sign(payload)):
            return None
        data = json.loads(base64.urlsafe_b64decode(payload))
        return data["sid"] if data["exp"] > time.time() else None
    except Exception:
        return None


async def verify_turnstile(token: str | None, ip: str) -> bool:
    if not config.TURNSTILE_SECRET:
        return True
    if not token:
        return False
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            r = await client.post(
                "https://challenges.cloudflare.com/turnstile/v0/siteverify",
                data={"secret": config.TURNSTILE_SECRET, "response": token, "remoteip": ip},
            )
        return bool(r.json().get("success"))
    except Exception:
        return False


# ---------------------------------------------------------------- rate limiting
class Limiter:
    def __init__(self, clock=time.monotonic):
        self.clock = clock
        self._buckets: dict[str, list[float]] = {}  # key -> [tokens, last_ts]
        self._denials: dict[str, deque] = defaultdict(deque)
        self._strikes: dict[str, deque] = defaultdict(deque)
        self._ban_until: dict[str, float] = {}
        self._ban_count: dict[str, int] = defaultdict(int)

    def _refill(self, key: str, burst: float, rate: float) -> list[float]:
        now = self.clock()
        b = self._buckets.setdefault(key, [burst, now])
        b[0] = min(burst, b[0] + (now - b[1]) * rate)
        b[1] = now
        return b

    def take(self, specs: list[tuple[str, tuple[int, float]]]) -> float:
        """All-or-nothing token take. Returns 0 on success, else seconds to wait."""
        buckets = [(self._refill(k, *cfg), cfg) for k, cfg in specs]
        wait = max(((1 - b[0]) / cfg[1] for b, cfg in buckets if b[0] < 1), default=0.0)
        if wait == 0:
            for b, _ in buckets:
                b[0] -= 1
        return wait

    def check_message(self, sid: str, ip: str) -> float:
        wait = self.take([
            (f"s:{sid}", config.SESSION_BUCKET),
            (f"ip:{ip}", config.IP_BUCKET),
            ("global", config.GLOBAL_BUCKET),
        ])
        if wait:
            self._record_denial(ip)
        return wait

    def check_session_create(self, ip: str) -> float:
        return self.take([(f"new:{ip}", config.SESSION_CREATE_BUCKET)])

    def check_llm(self, sid: str) -> bool:
        return self.take([(f"llm:{sid}", config.LLM_BUCKET)]) == 0

    # --- bans
    def banned_for(self, ip: str) -> float:
        return max(0.0, self._ban_until.get(ip, 0) - self.clock())

    def _record_denial(self, ip: str) -> None:
        now = self.clock()
        d = self._denials[ip]
        d.append(now)
        while d and now - d[0] > 60:
            d.popleft()
        if len(d) < config.DENIALS_PER_STRIKE:
            return
        d.clear()
        s = self._strikes[ip]
        s.append(now)
        while s and now - s[0] > 600:
            s.popleft()
        if len(s) >= config.STRIKES_PER_BAN:
            s.clear()
            ladder = config.BAN_LADDER
            self._ban_until[ip] = now + ladder[min(self._ban_count[ip], len(ladder) - 1)]
            self._ban_count[ip] += 1
