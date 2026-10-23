"""T3 retrieval: hybrid search = keyword coverage (IDF-weighted) + character n-gram similarity."""
import json
import math
import re
from collections import Counter
from dataclasses import dataclass

from . import config

_STOP = set("""a an the and or but of to in on at for with from by is are was were be been am do does did can could would
should will you your yours we our us i me my it its this that these those what which who how when where why please tell
about get give show want need like have has had there here any some more also so if as not no just""".split()) - {"no", "not"}


def tokens(text: str) -> list[str]:
    out = []
    for w in re.findall(r"[a-z0-9]+", text.lower()):
        if w in _STOP:
            continue
        for suf in ("ing", "es", "s"):
            if len(w) > 4 and w.endswith(suf):
                w = w[: -len(suf)]
                break
        out.append(w)
    return out


def _grams(text: str) -> Counter:
    t = f" {' '.join(tokens(text))} "
    return Counter(t[i:i + 3] for i in range(len(t) - 2))


def _cos(a: Counter, b: Counter) -> float:
    dot = sum(v * b.get(k, 0) for k, v in a.items())
    na = math.sqrt(sum(v * v for v in a.values()))
    nb = math.sqrt(sum(v * v for v in b.values()))
    return dot / (na * nb) if na and nb else 0.0


@dataclass
class Hit:
    entry: dict
    score: float


class KnowledgeBase:
    def __init__(self, path=config.KB_PATH):
        self.reload(path)

    def reload(self, path=config.KB_PATH) -> None:
        data = json.loads(open(path, encoding="utf-8").read())
        self.data = data
        self.version = data["version"]
        self.contact = data.get("contact", {})
        self.entries = data["entries"]
        self.by_id = {e["id"]: e for e in self.entries}
        self._doc_tokens = []
        self._phrases = []
        df: Counter = Counter()
        for e in self.entries:
            text = " ".join([e["title"], *e.get("keywords", []), *e.get("questions", []), e["answer"]])
            toks = set(tokens(text))
            self._doc_tokens.append(toks)
            df.update(toks)
            phrases = [e["title"], " ".join(e.get("keywords", [])), *e.get("questions", [])]
            self._phrases.append([_grams(p) for p in phrases])
        n = len(self.entries)
        self._idf = {t: math.log(1 + n / c) for t, c in df.items()}
        self._max_idf = math.log(1 + n)

    def search(self, query: str, k: int = 5) -> list[Hit]:
        q = tokens(query)
        if not q:
            return []
        qset = set(q)
        weight = {t: self._idf.get(t, self._max_idf) for t in qset}
        total = sum(weight.values())
        qgrams = _grams(query)
        hits = []
        for e, toks, phrases in zip(self.entries, self._doc_tokens, self._phrases):
            kw = sum(w for t, w in weight.items() if t in toks) / total
            sem = max((_cos(qgrams, p) for p in phrases), default=0.0)
            hits.append(Hit(e, 0.6 * kw + 0.4 * sem))
        hits.sort(key=lambda h: h.score, reverse=True)
        return hits[:k]
