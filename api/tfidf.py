import math
import re

STOP_WORDS = {
    "the", "be", "to", "of", "and", "a", "in", "that", "have", "i", "it",
    "for", "not", "on", "with", "he", "as", "you", "do", "at", "this",
    "but", "his", "by", "from", "they", "we", "say", "her", "she", "or",
    "an", "will", "my", "one", "all", "would", "there", "their", "what",
    "so", "up", "out", "if", "about", "who", "get", "which", "go", "me",
    "when", "make", "can", "like", "time", "no", "just", "him", "know",
    "take", "people", "into", "year", "your", "good", "some", "could",
    "them", "see", "other", "than", "then", "now", "look", "only", "come",
    "its", "over", "think", "also", "back", "after", "use", "two", "how",
    "our", "work", "first", "well", "way", "even", "new", "want",
    "because", "any", "these", "give", "day", "most", "us", "was", "were",
    "been", "has", "had", "are", "did", "does", "is", "am", "more",
    "very", "much", "such", "many", "may", "still", "should", "each",
    "where", "here", "while", "said", "own", "same", "being", "through",
    "between", "both", "those", "under", "since", "down", "before",
    "right", "too", "long", "made", "thing", "things",
}

_WORD_RE = re.compile(r"[a-z0-9'-]+")
_TAG_RE = re.compile(r"<[^>]+>")
_BLOCK_RE = re.compile(
    r"<(p|h[1-6]|blockquote|li|figcaption|pre)[^>]*>([\s\S]*?)</\1>",
    re.IGNORECASE,
)


def tokenize(text: str) -> list[str]:
    return [w for w in _WORD_RE.findall(text.lower()) if len(w) > 2 and w not in STOP_WORDS]


def extract_keywords(text: str, max_keywords: int = 15) -> list[dict]:
    tokens = tokenize(text)
    if not tokens:
        return []
    freq: dict[str, int] = {}
    for t in tokens:
        freq[t] = freq.get(t, 0) + 1
    max_freq = max(freq.values())
    scored = [{"term": t, "weight": c / max_freq} for t, c in freq.items()]
    scored.sort(key=lambda x: x["weight"], reverse=True)
    return scored[:max_keywords]


def segment_html(html: str) -> list[dict]:
    segments: list[dict] = []
    idx = 0
    for m in _BLOCK_RE.finditer(html):
        text = _TAG_RE.sub("", m.group(2)).strip()
        if len(text) > 20:
            segments.append({"html": m.group(0), "text": text, "index": idx})
            idx += 1

    if not segments and html:
        plain = _TAG_RE.sub("", html).strip()
        for p in re.split(r"\n\n+", plain):
            if len(p) > 20:
                segments.append({"html": f"<p>{p}</p>", "text": p, "index": idx})
                idx += 1
    return segments
