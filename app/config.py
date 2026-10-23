import os
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def _env(name: str, default: str = "") -> str:
    return os.getenv(name, default)


SITE_ID = _env("SITE_ID", "softworks")
LANGUAGE = "en"
KB_PATH = Path(_env("KB_PATH", str(ROOT / "data" / "kb.json")))
LOG_PATH = Path(_env("LOG_PATH", str(ROOT / "data" / "tier_log.jsonl")))
STATIC_DIR = ROOT / "static"

# Input limits (T0 guard, step 1)
MAX_CHARS = 500
MAX_LINES = 30

# Sessions
SESSION_SECRET = _env("SESSION_SECRET", "dev-only-change-me")
SESSION_TTL = 30 * 60
TURNSTILE_SECRET = _env("TURNSTILE_SECRET")  # empty = skip verification (local dev)
TRUST_PROXY = _env("TRUST_PROXY") == "1"

# Token buckets: (burst, refill tokens per second)
SESSION_CREATE_BUCKET = (5, 10 / 3600)
SESSION_BUCKET = (8, 1 / 6)
IP_BUCKET = (30, 0.5)
GLOBAL_BUCKET = (600, 10.0)
LLM_BUCKET = (3, 1 / 20)  # stricter limit right before any LLM call

# Abuse escalation
DENIALS_PER_STRIKE = 20  # denials within 60 s add a strike
STRIKES_PER_BAN = 5  # strikes within 10 min trigger a ban
BAN_LADDER = [15 * 60, 3600, 4 * 3600, 16 * 3600, 24 * 3600]

# Retrieval confidence
HIGH_CONFIDENCE = 0.70
MEDIUM_CONFIDENCE = 0.35

# Cache
REDIS_URL = _env("REDIS_URL")
TTL_CURATED = 7 * 24 * 3600
TTL_LLM = 24 * 3600

# LLM (T4). Leave the key empty to run without a language model.
ANTHROPIC_API_KEY = _env("ANTHROPIC_API_KEY")
LLM_MODEL = _env("LLM_MODEL", "claude-haiku-5-5")
LLM_TIMEOUT = 12.0

ADMIN_TOKEN = _env("ADMIN_TOKEN")  # empty disables the admin endpoints
