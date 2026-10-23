import uuid

from fastapi import FastAPI, Header, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from . import config
from .cache import ResponseCache
from .guard import Limiter, injection_status, issue_session, normalize, verify_session, verify_turnstile
from .llm import LLM
from .pipeline import Pipeline
from .retrieval import KnowledgeBase

app = FastAPI(title="Website Chatbot RAG")
kb = KnowledgeBase()
cache = ResponseCache()
limiter = Limiter()
pipeline = Pipeline(kb, cache, LLM(), limiter)


def error(status: int, code: str, message: str, retry_after: int | None = None) -> JSONResponse:
    body = {"error": {"code": code, "message": message}}
    headers = {}
    if retry_after is not None:
        body["error"]["retry_after"] = retry_after
        headers["Retry-After"] = str(retry_after)
    return JSONResponse(body, status_code=status, headers=headers)


def client_ip(request: Request) -> str:
    if config.TRUST_PROXY and request.headers.get("x-forwarded-for"):
        return request.headers["x-forwarded-for"].split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def blocked(wait: float, banned: bool) -> JSONResponse:
    secs = max(1, int(wait + 0.999))
    if banned:
        return error(429, "temporarily_blocked", "Too many requests. Please try again later.", secs)
    return error(429, "rate_limited", f"You're sending messages quickly. Please wait {secs} seconds.", secs)


@app.exception_handler(RequestValidationError)
async def bad_request(_, __):
    return error(400, "bad_request", "That message could not be read.")


class SessionIn(BaseModel):
    turnstile_token: str | None = None


class ChatIn(BaseModel):
    message: str
    quick_action: str | None = None


@app.post("/v1/session")
async def create_session(body: SessionIn, request: Request):
    ip = client_ip(request)
    if (wait := limiter.banned_for(ip)):
        return blocked(wait, True)
    if (wait := limiter.check_session_create(ip)):
        return blocked(wait, False)
    if not await verify_turnstile(body.turnstile_token, ip):
        return error(403, "bot_check_failed", "Verification failed. Please refresh and try again.")
    token, exp = issue_session(uuid.uuid4().hex)
    return {"session_token": token, "expires_at": exp, "welcome": kb.data["welcome"],
            "limits": {"max_chars": config.MAX_CHARS, "max_lines": config.MAX_LINES}}


@app.post("/v1/chat")
async def chat(body: ChatIn, request: Request, authorization: str = Header(default="")):
    ip = client_ip(request)
    msg = body.message
    if not msg.strip():
        return error(400, "empty", "Please type a message.")
    if len(msg) > config.MAX_CHARS or msg.count("\n") + 1 > config.MAX_LINES:
        return error(400, "too_long", "Your prompt is too long. Please reduce the character count or try a shorter prompt.")
    sid = verify_session(authorization.removeprefix("Bearer ").strip())
    if not sid:
        return error(401, "invalid_session", "Your session expired. Reconnecting...")
    if (wait := limiter.banned_for(ip)):
        return blocked(wait, True)
    if (wait := limiter.check_message(sid, ip)):
        return blocked(limiter.banned_for(ip) or wait, bool(limiter.banned_for(ip)))

    clean, removed = normalize(msg)
    if not clean:
        return error(400, "empty", "Please type a message.")
    resp = await pipeline.run(sid, clean, injection_status(clean, removed), body.quick_action)
    resp.pop("entry_ids", None)
    return resp


@app.post("/v1/admin/invalidate")
async def invalidate(entry_id: str, x_admin_token: str = Header(default="")):
    """KB entry edited -> delete only the cached answers built from it."""
    if not config.ADMIN_TOKEN or x_admin_token != config.ADMIN_TOKEN:
        return error(403, "forbidden", "Not allowed.")
    return {"deleted": cache.invalidate_entry(entry_id)}


@app.post("/v1/admin/reload")
async def reload_kb(x_admin_token: str = Header(default="")):
    if not config.ADMIN_TOKEN or x_admin_token != config.ADMIN_TOKEN:
        return error(403, "forbidden", "Not allowed.")
    kb.reload()
    return {"version": kb.version}


@app.get("/v1/health")
async def health():
    return {"ok": True, "llm": pipeline.llm.enabled, "kb_version": kb.version}


app.mount("/", StaticFiles(directory=config.STATIC_DIR, html=True), name="static")
