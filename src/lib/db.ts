import Database from "better-sqlite3";
import path from "path";

const DB_PATH = path.join(process.cwd(), "data", "catchup.db");

let db: Database.Database;

export function getDb(): Database.Database {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma("journal_mode = WAL");
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
      is_read INTEGER DEFAULT 0,
      is_archived INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_articles_read ON articles(is_read);

    CREATE TABLE IF NOT EXISTS interests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      article_id INTEGER REFERENCES articles(id),
      paragraph_index INTEGER,
      paragraph_text TEXT,
      keywords TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);
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
  is_read: number;
  is_archived: number;
  created_at: string;
}
