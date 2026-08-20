import Database from "better-sqlite3";
import path from "path";

const DB_PATH = path.join(process.cwd(), "data", "catchup.db");

let db: Database.Database;

export function getDb(): Database.Database {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
    migrate(db);
  }
  return db;
}

function migrate(db: Database.Database) {
  db.exec(`
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
      source_type TEXT DEFAULT 'article',
      is_read INTEGER DEFAULT 0,
      is_archived INTEGER DEFAULT 0,
      scroll_depth REAL DEFAULT 0,
      time_spent INTEGER DEFAULT 0,
      capture_method TEXT DEFAULT 'manual',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_articles_created ON articles(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_articles_read ON articles(is_read);
    CREATE INDEX IF NOT EXISTS idx_articles_source ON articles(source_type);
    CREATE INDEX IF NOT EXISTS idx_articles_capture ON articles(capture_method);

    CREATE TABLE IF NOT EXISTS feeds (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      url TEXT UNIQUE,
      site_url TEXT,
      site_name TEXT,
      feed_type TEXT DEFAULT 'rss',
      last_fetched TEXT,
      article_count INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS interests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      article_id INTEGER REFERENCES articles(id),
      paragraph_index INTEGER,
      paragraph_text TEXT,
      keywords TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_interests_created ON interests(created_at DESC);
  `);

  const cols = db.prepare("PRAGMA table_info(articles)").all() as { name: string }[];
  const colNames = new Set(cols.map((c) => c.name));
  if (!colNames.has("relevance_score")) {
    db.exec("ALTER TABLE articles ADD COLUMN relevance_score REAL DEFAULT 0");
  }
  if (!colNames.has("discovered_from")) {
    db.exec("ALTER TABLE articles ADD COLUMN discovered_from TEXT DEFAULT ''");
  }
}

export interface Article {
  id: number;
  url: string;
  title: string;
  content: string;
  text_content: string;
  excerpt: string;
  author: string;
  site_name: string;
  published_date: string;
  lead_image_url: string;
  word_count: number;
  source_type: "article" | "tweet";
  is_read: number;
  is_archived: number;
  scroll_depth: number;
  time_spent: number;
  capture_method: "auto" | "manual" | "bookmark";
  created_at: string;
  updated_at: string;
}
