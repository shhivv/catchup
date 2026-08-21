import sqlite3
from pathlib import Path

DB_PATH = Path(__file__).resolve().parent.parent / "data" / "catchup.db"


def get_db() -> sqlite3.Connection:
    db = sqlite3.connect(str(DB_PATH))
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA journal_mode=WAL")
    _migrate(db)
    return db


def _migrate(db: sqlite3.Connection):
    db.executescript("""
        CREATE TABLE IF NOT EXISTS articles (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            url TEXT UNIQUE,
            title TEXT,
            content TEXT,
            text_content TEXT,
            excerpt TEXT,
            author TEXT,
            site_name TEXT,
            published_date TEXT,
            lead_image_url TEXT,
            word_count INTEGER DEFAULT 0,
            is_read INTEGER DEFAULT 0,
            is_archived INTEGER DEFAULT 0,
            is_bookmarked INTEGER DEFAULT 0,
            created_at TEXT DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_articles_read ON articles(is_read);
        CREATE INDEX IF NOT EXISTS idx_articles_bookmarked ON articles(is_bookmarked);

        CREATE TABLE IF NOT EXISTS interests (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            article_id INTEGER REFERENCES articles(id),
            paragraph_index INTEGER,
            paragraph_text TEXT,
            keywords TEXT,
            created_at TEXT DEFAULT (datetime('now'))
        );
    """)

    cols = {row[1] for row in db.execute("PRAGMA table_info(articles)").fetchall()}
    if "is_bookmarked" not in cols:
        db.execute("ALTER TABLE articles ADD COLUMN is_bookmarked INTEGER DEFAULT 0")
    db.commit()
