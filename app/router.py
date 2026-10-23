"""T2 router: rules for greetings, contacts, hours, links and quick actions. No search, no LLM."""
import re

from .retrieval import KnowledgeBase

DEFAULT_CHIPS = ["Services", "Products", "Talk to a person"]
ENTRY_QUICK_ACTIONS = {
    "about": "about", "services": "services", "products": "products",
    "careers": "careers", "case_studies": "case-studies",
}


def reply(tier: str, text: str, kind: str = "answer", cards=None, sources=None, chips=None,
          handoff: bool = False, entry_ids=None) -> dict:
    return {
        "tier": tier, "kind": kind, "text": text, "cards": cards or [], "sources": sources or [],
        "chips": chips if chips is not None else DEFAULT_CHIPS, "handoff": handoff,
        "entry_ids": entry_ids or [], "cached": False,
    }


def card(entry: dict) -> dict:
    c = entry["card"]
    return {"title": c["title"], "subtitle": c["subtitle"], "cta": "Explore", "url": entry["url"]}


def source(entry: dict) -> dict:
    return {"title": entry.get("source_title", entry["title"]), "url": entry["url"]}


def entry_reply(kb: KnowledgeBase, entry_id: str, tier: str) -> dict:
    e = kb.by_id[entry_id]
    if entry_id == "services":
        cards = [card(x) for x in kb.entries if x.get("topic") == "service" and "card" in x]
    elif entry_id == "products":
        cards = [card(kb.by_id["zerra"]), card(kb.by_id["zenith"])]
    else:
        cards = [card(e)] if "card" in e else []
    return reply(tier, e["answer"], cards=cards, sources=[source(e)],
                 chips=e.get("chips"), entry_ids=[entry_id])


def contact_reply(kb: KnowledgeBase, text: str, handoff: bool = False) -> dict:
    c = kb.contact
    facts = [f"{label}: {c[k]}" for k, label in (("email", "Email"), ("phone", "Phone")) if c.get(k)]
    body = text + ("\n" + "\n".join(facts) if facts else "")
    return reply("T2", body, sources=[{"title": "Contact us", "url": c.get("url", "/contact")}],
                 chips=["Services", "Products", "Careers"], handoff=handoff)


_RULES = [
    ("greeting", re.compile(r"^(hi|hello|hey|hola|good (morning|afternoon|evening))\b[\s!.,]*$", re.I)),
    ("thanks", re.compile(r"^(thanks?|thank you|thx|cheers|bye|goodbye|ok(ay)?)\b[\s!.,]*$", re.I)),
    ("human", re.compile(r"\b(talk|speak|chat|connect)\b.{0,25}\b(person|human|someone|agent|team|representative|sales)\b|\b(real|live) (person|human|agent)\b|\bhuman\b", re.I)),
    ("hours", re.compile(r"\b(hours|opening|working hours|business hours|timings?|open on)\b", re.I)),
    ("contact", re.compile(r"\b(contact|phone|call you|email|e-mail|address|reach you|phone number)\b", re.I)),
    ("careers", re.compile(r"\b(careers?|hiring|jobs?|openings?|vacanc\w+|internships?)\b", re.I)),
    ("case_studies", re.compile(r"\bcase stud(y|ies)\b", re.I)),
    ("products", re.compile(r"\bproducts\b|see other products", re.I)),
    ("services", re.compile(r"\bservices?\b|what do you (do|offer)|\boffer(ings)?\b", re.I)),
    ("about", re.compile(r"\babout (the )?(company|us|softworks)\b|\bwho are you\b|\bwhat is softworks\b|^company$", re.I)),
]
_PRODUCT_AMBIGUOUS = re.compile(r"\bproduct\b", re.I)
_PRODUCT_NAMED = re.compile(r"\b(zerra|zenith)\b", re.I)


def route(kb: KnowledgeBase, text: str, quick_action: str | None = None) -> dict | None:
    if quick_action in ENTRY_QUICK_ACTIONS:
        return entry_reply(kb, ENTRY_QUICK_ACTIONS[quick_action], "T2")

    if _PRODUCT_AMBIGUOUS.search(text) and not _PRODUCT_NAMED.search(text) and not _RULES_MATCH("products", text):
        return reply("T2", "Which product do you mean?", kind="clarify",
                     chips=["Zerra", "Zenith"], entry_ids=["products"])

    for name, rx in _RULES:
        if not rx.search(text):
            continue
        if name == "greeting":
            return reply("T2", "Hello! I can help you explore our Services, Products, Case Studies and Careers.")
        if name == "thanks":
            return reply("T2", "You're welcome! Ask me anything else about Softworks Technologies.")
        if name == "human":
            return contact_reply(kb, "Sure, a person on our team can help. You can reach us here.", handoff=True)
        if name == "hours":
            hours = kb.contact.get("hours")
            return contact_reply(kb, f"Our hours: {hours}" if hours else
                                 "I don't have our hours listed here. Please use our contact page.")
        if name == "contact":
            return contact_reply(kb, "You can reach our team through our contact page.")
        return entry_reply(kb, ENTRY_QUICK_ACTIONS[name], "T2")
    return None


def _RULES_MATCH(name: str, text: str) -> bool:
    return any(n == name and rx.search(text) for n, rx in _RULES)
