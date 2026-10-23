"""Message flow: Guard (T0) -> Cache (T1) -> Router (T2) -> Retrieval (T3) -> LLM (T4) -> Fallback (T5)."""
import hashlib
import json
import re
import time
from datetime import datetime, timezone

from . import config
from .cache import ResponseCache, cache_key, is_cacheable
from .guard import Limiter
from .llm import LLM
from .retrieval import KnowledgeBase
from .router import DEFAULT_CHIPS, card, contact_reply, reply, route, source

_FOLLOWUP = re.compile(r"\b(it|its|this|that|they|them|those|these)\b|^(and|what about|how much|pricing|price|cost)\b", re.I)
_TOPICS = re.compile(r"\b(zerra|zenith)\b", re.I)
_PII = re.compile(r"[\w.+-]+@[\w-]+\.[\w.]+|\+?\d[\d\s().-]{6,}\d")


def refusal(kb: KnowledgeBase) -> dict:
    text = ("Please try another prompt.\nThis request is not supported.\n"
            f"I can help with questions about {kb.data['company']}: our Services, "
            "Products (Zerra & Zenith), Case Studies and Careers.")
    return reply("T0", text, kind="refusal",
                 chips=["What services do you offer?", "Tell me about Zerra", "Are you hiring?"])


def fallback(kb: KnowledgeBase, hits) -> dict:
    chips = ["Talk to a person", "Contact us"]
    r = contact_reply(kb, "I don't have a confirmed answer for that. A person on our team can help, "
                          "or you can try one of these.", handoff=True)
    r.update(tier="T5", chips=chips, sources=[])
    return r


def extract(text: str, sentences: int = 2) -> str:
    return " ".join(re.split(r"(?<=[.!?])\s+", text)[:sentences])


class Pipeline:
    def __init__(self, kb: KnowledgeBase, cache: ResponseCache, llm: LLM, limiter: Limiter):
        self.kb, self.cache, self.llm, self.limiter = kb, cache, llm, limiter
        self._topic: dict[str, str] = {}

    # --- follow-up rewrite: returns (standalone question, resolvable)
    def _rewrite(self, sid: str, text: str) -> tuple[str, bool]:
        if _TOPICS.search(text):
            self._topic[sid] = _TOPICS.search(text).group(1).capitalize()
            return text, True
        if len(text.split()) <= 5 and _FOLLOWUP.search(text):
            topic = self._topic.get(sid)
            return (f"{text} ({topic})", True) if topic else (text, False)
        return text, True

    async def run(self, sid: str, text: str, status: str, quick_action: str | None = None) -> dict:
        if status == "unsupported":
            resp = refusal(self.kb)
            self._log(sid, resp, text, status)
            return resp
        flagged = status == "flagged"
        question, resolvable = self._rewrite(sid, text)
        use_cache = resolvable and not flagged and not quick_action
        key = cache_key(question, self.kb.version)

        if use_cache:
            hit = self.cache.get(key)
            if hit:
                hit["cached"] = True
                self._log(sid, hit, text, status)
                return hit

        resp = route(self.kb, question, quick_action) or await self._answer(sid, question, flagged)

        if use_cache and is_cacheable(question, resp, flagged):
            ttl = config.TTL_LLM if resp["tier"] == "T4" else config.TTL_CURATED
            self.cache.set(key, resp, ttl, resp["entry_ids"])
        topic = next((self.kb.by_id[i]["topic"] for i in resp["entry_ids"]
                      if self.kb.by_id[i].get("topic") in ("Zerra", "Zenith")), None)
        if topic:
            self._topic[sid] = topic
        self._log(sid, resp, text, status)
        return resp

    async def _answer(self, sid: str, question: str, flagged: bool) -> dict:
        hits = self.kb.search(question)
        top = hits[0] if hits else None
        if top and top.score >= config.HIGH_CONFIDENCE and top.entry["kind"] == "faq":
            e = top.entry
            return reply("T3", e["answer"], cards=[card(e)] if "card" in e else [], sources=[source(e)],
                         chips=e.get("chips"), entry_ids=[e["id"]])
        if top and top.score >= config.MEDIUM_CONFIDENCE:
            chunks = [h.entry for h in hits if h.score >= config.MEDIUM_CONFIDENCE * 0.6][:5]
            sources = _unique([source(c) for c in chunks])[:2]
            ids = [c["id"] for c in chunks]
            # Flagged requests never reach the LLM; the strictest path answers from the KB only.
            if self.llm.enabled and not flagged and self.limiter.check_llm(sid):
                text = await self.llm.answer(question, chunks)
                if text:
                    return reply("T4", text, sources=sources, chips=["Services", "Contact us", "Talk to a person"],
                                 entry_ids=ids)
            if top.score >= 0.45:
                return reply("T3", extract(top.entry["answer"]), sources=sources[:1],
                             chips=top.entry.get("chips"), entry_ids=[top.entry["id"]])
        return fallback(self.kb, hits)

    def _log(self, sid: str, resp: dict, text: str, status: str) -> None:
        row = {"ts": datetime.now(timezone.utc).isoformat(timespec="seconds"),
               "sid": hashlib.sha256(sid.encode()).hexdigest()[:10],
               "tier": resp["tier"], "kind": resp["kind"], "cached": resp["cached"], "status": status}
        if resp["tier"] == "T5":  # question logged for the content team, personal data removed
            row["question"] = _PII.sub("[removed]", text)[:200]
        try:
            with open(config.LOG_PATH, "a", encoding="utf-8") as f:
                f.write(json.dumps(row) + "\n")
        except OSError:
            pass


def _unique(items: list[dict]) -> list[dict]:
    seen, out = set(), []
    for i in items:
        if i["url"] not in seen:
            seen.add(i["url"])
            out.append(i)
    return out
