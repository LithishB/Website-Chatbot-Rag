# Website Chatbot RAG

A website chatbot for Softworks Technologies. Free tiers answer first; the language model is the last resort.

```
Visitor input → T0 Guard → T1 Cache → T2 Router → T3 Retrieval → T4 Small LLM → T5 Fallback
```

| Tier | Where | What it does |
|---|---|---|
| T0 Guard | `app/guard.py` | 500 char / 30 line cap, Turnstile bot check, signed 30-min sessions, token buckets (session, IP, global), strikes and growing bans, Unicode NFKC + hidden-character removal, injection scoring (clean / flagged / unsupported) |
| T1 Cache | `app/cache.py` | Exact match on `site:lang:content-version:sha256(canonical question)`. In-process, or Redis with `REDIS_URL`. Only grounded, non-personal, non-flagged T3/T4 answers are stored. Errors count as a miss. |
| T2 Router | `app/router.py` | Rules for greetings, contact, hours, human handoff, quick actions, "which product?" clarifying question |
| T3 Retrieval | `app/retrieval.py` | Hybrid search (IDF keyword coverage + character n-gram similarity). High confidence returns the curated answer, medium returns an extract |
| T4 LLM | `app/llm.py` | Only with `ANTHROPIC_API_KEY`. 3 to 5 chunks, short answer, output checks, extra per-session limit. Never used for flagged requests |
| T5 Fallback | `app/pipeline.py` | Contact route and handoff flag. The question is logged (personal data removed) to `data/tier_log.jsonl` along with the tier that answered |

The UI in `static/widget.js` follows the "Softworks Chat Widget" canvas: welcome, quick actions, cards, sources, suggestion chips, character counter states, server-rejected prompt with Edit prompt, unsupported prompt, rate-limit countdown, clarifying question, light and dark themes.

## Run

```bash
pip install -r requirements.txt
python -m uvicorn app.main:app --port 8000
```

Open http://localhost:8000. Test with `pip install pytest && python -m pytest`.

## Embed

```html
<script src="https://YOUR-HOST/widget.js" data-api="https://YOUR-HOST"
        data-site="https://www.your-site.com" data-turnstile-sitekey="..." defer></script>
```

## Content

Edit `data/kb.json` (see `.env.example` for settings). Fill in `contact.email`, `contact.phone`, `contact.hours`, the real page URLs, and the Zenith description, which is a placeholder. After editing, bump `version` (every old cached answer stops matching) or call `POST /v1/admin/invalidate?entry_id=...` for one entry, then `POST /v1/admin/reload` (both need `ADMIN_TOKEN` in `X-Admin-Token`).

## Not built

Similar-question cache (semantic) and a real embedding model are not included; retrieval is lexical plus n-grams and can be swapped behind `KnowledgeBase.search`.
