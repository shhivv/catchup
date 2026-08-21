"""Seed the database with articles from RSS feeds and direct URLs."""

import html
import re
import sqlite3
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import URLError

DB_PATH = Path(__file__).resolve().parent.parent / "data" / "catchup.db"

FEEDS = [
    ("Julia Evans", "https://jvns.ca/atom.xml"),
    ("Dan Luu", "https://danluu.com/atom.xml"),
    ("Simon Willison", "https://simonwillison.net/atom/everything/"),
    ("Lilian Weng", "https://lilianweng.github.io/index.xml"),
    ("Gwern Branwen", "https://gwern.net/feed"),
    ("Chris Olah", "https://colah.github.io/rss.xml"),
    ("Sebastian Raschka", "https://sebastianraschka.com/rss_feed.xml"),
    ("Jay Alammar", "https://jalammar.github.io/feed.xml"),
    ("Bruce Schneier", "https://www.schneier.com/feed/atom/"),
    ("Troy Hunt", "https://www.troyhunt.com/rss/"),
    ("Filippo Valsorda", "https://words.filippo.io/rss/"),
    ("Martin Fowler", "https://martinfowler.com/feed.atom"),
    ("Joel Spolsky", "https://www.joelonsoftware.com/feed/"),
    ("rachelbythebay", "https://rachelbythebay.com/w/atom.xml"),
    ("Brandur Leach", "https://brandur.org/articles.atom"),
    ("Amos (fasterthanli.me)", "https://fasterthanli.me/index.xml"),
    ("Alex Kladov (matklad)", "https://matklad.github.io/feed.xml"),
    ("Drew DeVault", "https://drewdevault.com/blog/index.xml"),
    ("Eli Bendersky", "https://eli.thegreenplace.net/feeds/all.atom.xml"),
    ("Antirez", "http://antirez.com/rss"),
    ("Nelson Elhage", "https://blog.nelhage.com/atom.xml"),
    ("Patrick McKenzie (patio11)", "https://www.kalzumeus.com/feed/articles/"),
    ("Scott Aaronson", "https://scottaaronson.blog/?feed=rss2"),
    ("Nikita Prokopov (tonsky)", "https://tonsky.me/blog/atom.xml"),
    ("Chris Wellons (null program)", "https://nullprogram.com/feed/"),
    ("Bartosz Ciechanowski", "https://ciechanow.ski/atom.xml"),
    ("Xe Iaso", "https://xeiaso.net/blog.rss"),
    ("Jamie Brandon", "https://www.scattered-thoughts.net/atom.xml"),
    ("Thorsten Ball", "https://thorstenball.com/atom.xml"),
    ("Hillel Wayne", "https://www.hillelwayne.com/index.xml"),
    ("Paul Graham", "https://www.aaronsw.com/2002/feeds/pgessays.rss"),
    ("Jeff Atwood (Coding Horror)", "https://blog.codinghorror.com/rss/"),
    ("Bob Nystrom", "https://journal.stuffwithstuff.com/atom.xml"),
    ("Aria Beingessner (Gankra)", "https://faultlore.com/blah/atom.xml"),
    ("Dario Amodei", "https://darioamodei.com/rss.xml"),
    ("Marginal Revolution", "https://marginalrevolution.com/feed"),
    ("John Cochrane (Grumpy Economist)", "https://johnhcochrane.blogspot.com/feeds/posts/default?alt=rss"),
    ("Arnold Kling", "https://www.arnoldkling.com/blog/feed/"),
    ("Cafe Hayek", "https://cafehayek.com/feed"),
    ("EconLog", "https://www.econlib.org/feed/"),
    ("Noah Smith (Noahpinion)", "https://www.noahpinion.blog/feed"),
    ("Matt Levine (Money Stuff)", "https://www.bloomberg.com/opinion/authors/ARbTQlRLRjE/matthew-s-levine.rss"),
    ("Mises Institute", "https://mises.org/feed"),
    ("The Economist", "https://www.economist.com/finance-and-economics/rss.xml"),
    ("The Economist", "https://www.economist.com/briefing/rss.xml"),
    ("The Economist", "https://www.economist.com/leaders/rss.xml"),
]

SHLOKED_URLS = [
    "https://www.shloked.com/chatgpt-work",
    "https://www.shloked.com/interaction-acquisition",
    "https://www.shloked.com/fable-5",
    "https://www.shloked.com/chatgpt-memory-2026",
    "https://www.shloked.com/vajra",
    "https://www.shloked.com/claude-code",
    "https://www.shloked.com/gemini-memory",
    "https://www.shloked.com/claude-memory-tool",
    "https://www.shloked.com/openpoke",
    "https://www.shloked.com/bangalore-mumbai-bangalore",
    "https://www.shloked.com/claude-memory",
    "https://www.shloked.com/chatgpt-memory",
    "https://www.shloked.com/san-francisco",
    "https://www.shloked.com/first-ai-product",
    "https://www.shloked.com/rahman",
    "https://www.shloked.com/crypto-cycles",
    "https://www.shloked.com/deep-research",
    "https://www.shloked.com/aixbt",
    "https://www.shloked.com/decentralized-compute",
    "https://www.shloked.com/bitcoin-superconductor",
    "https://www.shloked.com/sentient-ai-models",
    "https://www.shloked.com/does-crypto-matter",
    "https://www.shloked.com/avs",
    "https://www.shloked.com/trusted-enclaves",
    "https://www.shloked.com/bootstrapping-networks",
    "https://www.shloked.com/abstracting-chains",
    "https://www.shloked.com/runes",
    "https://www.shloked.com/on-token-migrations",
    "https://www.shloked.com/the-data-must-flow",
    "https://www.shloked.com/danke-jurgen",
    "https://www.shloked.com/sanctum",
    "https://www.shloked.com/mev-on-solana",
    "https://www.shloked.com/solana-validators",
    "https://www.shloked.com/2023",
    "https://www.shloked.com/openrouter",
    "https://www.shloked.com/llm-pricing",
    "https://www.shloked.com/llm-capabilities",
    "https://www.shloked.com/mardi-himal",
    "https://www.shloked.com/time-to-code",
    "https://www.shloked.com/on-leaving-web3-gaming",
    "https://www.shloked.com/zynga-mafia",
    "https://www.shloked.com/south-korea-web3-gaming",
    "https://www.shloked.com/skyweaver",
]

TAG_RE = re.compile(r"<[^>]+>")


def _fetch(url: str, timeout: int = 15) -> str | None:
    try:
        req = Request(url, headers={"User-Agent": "CatchupBot/1.0"})
        with urlopen(req, timeout=timeout) as resp:
            return resp.read().decode("utf-8", errors="replace")
    except (URLError, TimeoutError, OSError):
        return None


def _decode_entities(s: str) -> str:
    return html.unescape(s)


def _clean_html(raw: str) -> str:
    return TAG_RE.sub(" ", raw).strip()[:500]


def _parse_feed(url: str) -> list[dict]:
    xml = _fetch(url, timeout=10)
    if not xml:
        return []

    items: list[dict] = []
    is_atom = "<feed" in xml or "<entry>" in xml

    if is_atom:
        for entry in re.split(r"<entry[\s>]", xml)[1:]:
            title_m = re.search(r"<title[^>]*>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?</title>", entry, re.S)
            link_m = re.search(r'<link[^>]*href=["\']([^"\']+)["\'][^>]*/?\s*>', entry)
            if not link_m:
                link_m = re.search(r"<link[^>]*>([^<]+)</link>", entry)
            pub_m = re.search(r"<(?:published|updated)[^>]*>([^<]+)", entry)
            sum_m = re.search(r"<(?:summary|content)[^>]*>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?</(?:summary|content)>", entry, re.S)
            if title_m and link_m:
                items.append({
                    "title": _decode_entities(title_m.group(1).strip()),
                    "url": link_m.group(1).strip(),
                    "published": pub_m.group(1) if pub_m else None,
                    "summary": _clean_html(sum_m.group(1)) if sum_m else "",
                })
    else:
        for item in re.split(r"<item[\s>]", xml)[1:]:
            title_m = re.search(r"<title[^>]*>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?</title>", item, re.S)
            link_m = re.search(r"<link[^>]*>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?</link>", item, re.S)
            pub_m = re.search(r"<pubDate[^>]*>([^<]+)", item) or re.search(r"<dc:date[^>]*>([^<]+)", item)
            desc_m = re.search(r"<description[^>]*>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?</description>", item, re.S)
            content_m = re.search(r"<content:encoded[^>]*>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?</content:encoded>", item, re.S)
            if title_m and link_m:
                items.append({
                    "title": _decode_entities(title_m.group(1).strip()),
                    "url": link_m.group(1).strip(),
                    "published": pub_m.group(1) if pub_m else None,
                    "summary": _clean_html((content_m or desc_m).group(1)) if (content_m or desc_m) else "",
                })
    return items


def _scrape_article(url: str) -> dict | None:
    raw = _fetch(url)
    if not raw:
        return None

    body_m = re.search(r"<body[^>]*>([\s\S]*?)</body>", raw, re.I)
    body = body_m.group(1) if body_m else raw

    article_m = re.search(r"<article[^>]*>([\s\S]*?)</article>", body, re.I)
    main_m = re.search(r"<main[^>]*>([\s\S]*?)</main>", body, re.I)
    content = (article_m or main_m or type("", (), {"group": lambda s, _: body})()).group(1)

    for pattern in (r"<script[\s\S]*?</script>", r"<style[\s\S]*?</style>",
                    r"<nav[\s\S]*?</nav>", r"<header[\s\S]*?</header>", r"<footer[\s\S]*?</footer>"):
        content = re.sub(pattern, "", content, flags=re.I)

    text = re.sub(r"\s+", " ", TAG_RE.sub(" ", content)).strip()
    word_count = len(text.split())
    if word_count < 100:
        return None
    return {"content": content, "text_content": text, "word_count": word_count}


def main():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(str(DB_PATH))
    db.execute("PRAGMA journal_mode=WAL")

    db.executescript("""
        CREATE TABLE IF NOT EXISTS articles (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            url TEXT UNIQUE, title TEXT, content TEXT, text_content TEXT,
            excerpt TEXT, author TEXT, site_name TEXT, published_date TEXT,
            lead_image_url TEXT, word_count INTEGER DEFAULT 0,
            is_read INTEGER DEFAULT 0, is_archived INTEGER DEFAULT 0,
            is_bookmarked INTEGER DEFAULT 0,
            created_at TEXT DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_articles_read ON articles(is_read);
        CREATE INDEX IF NOT EXISTS idx_articles_bookmarked ON articles(is_bookmarked);
        CREATE TABLE IF NOT EXISTS interests (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            article_id INTEGER REFERENCES articles(id),
            paragraph_index INTEGER, paragraph_text TEXT, keywords TEXT,
            created_at TEXT DEFAULT (datetime('now'))
        );
    """)

    total_inserted = 0

    for name, feed_url in FEEDS:
        print(f"\n[{name}]")
        items = _parse_feed(feed_url)
        print(f"  {len(items)} items from feed")

        inserted = 0
        for item in items[:15]:
            exists = db.execute("SELECT id FROM articles WHERE url = ?", (item["url"],)).fetchone()
            if exists:
                continue
            scraped = _scrape_article(item["url"])
            if not scraped:
                print(f"  x {item['title'][:50]}")
                continue
            db.execute(
                "INSERT OR IGNORE INTO articles (url, title, content, text_content, excerpt, author, site_name, word_count, published_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (item["url"], item["title"], scraped["content"], scraped["text_content"],
                 (item["summary"] or scraped["text_content"])[:300], name, name, scraped["word_count"],
                 item.get("published")),
            )
            inserted += 1
            print(f"  + {item['title'][:60]}")
        db.commit()
        total_inserted += inserted

    print(f"\n[Shlok Khemani]")
    shloked_inserted = 0
    for url in SHLOKED_URLS:
        exists = db.execute("SELECT id FROM articles WHERE url = ?", (url,)).fetchone()
        if exists:
            continue
        raw = _fetch(url)
        if not raw:
            continue
        title_m = re.search(r"<title[^>]*>([^<]+)</title>", raw, re.I)
        title = _decode_entities(re.sub(r"\s*\|.*$", "", title_m.group(1).strip())) if title_m else url.rsplit("/", 1)[-1]
        scraped = _scrape_article(url)
        if not scraped:
            print(f"  x {title[:50]}")
            continue
        db.execute(
            "INSERT OR IGNORE INTO articles (url, title, content, text_content, excerpt, author, site_name, word_count) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (url, title, scraped["content"], scraped["text_content"],
             scraped["text_content"][:300], "Shlok Khemani", "shloked.com", scraped["word_count"]),
        )
        shloked_inserted += 1
        print(f"  + {title[:60]}")
    db.commit()
    total_inserted += shloked_inserted

    count = db.execute("SELECT COUNT(*) FROM articles WHERE word_count > 100").fetchone()[0]
    print(f"\nDone. Inserted {total_inserted} new articles. Total in DB: {count}")
    db.close()


if __name__ == "__main__":
    main()
