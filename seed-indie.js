const Database = require("better-sqlite3");
const path = require("path");

const DB_PATH = path.join(__dirname, "data", "catchup.db");

const FEEDS = [
  { name: "Julia Evans", feed: "https://jvns.ca/atom.xml" },
  { name: "Dan Luu", feed: "https://danluu.com/atom.xml" },
  { name: "Simon Willison", feed: "https://simonwillison.net/atom/everything/" },
  { name: "Lilian Weng", feed: "https://lilianweng.github.io/index.xml" },
  { name: "Gwern Branwen", feed: "https://gwern.net/feed" },
  { name: "Chris Olah", feed: "https://colah.github.io/rss.xml" },
  { name: "Sebastian Raschka", feed: "https://sebastianraschka.com/rss_feed.xml" },
  { name: "Jay Alammar", feed: "https://jalammar.github.io/feed.xml" },
  { name: "Bruce Schneier", feed: "https://www.schneier.com/feed/atom/" },
  { name: "Troy Hunt", feed: "https://www.troyhunt.com/rss/" },
  { name: "Filippo Valsorda", feed: "https://words.filippo.io/rss/" },
  { name: "Martin Fowler", feed: "https://martinfowler.com/feed.atom" },
  { name: "Joel Spolsky", feed: "https://www.joelonsoftware.com/feed/" },
  { name: "rachelbythebay", feed: "https://rachelbythebay.com/w/atom.xml" },
  { name: "Brandur Leach", feed: "https://brandur.org/articles.atom" },
  { name: "Amos (fasterthanli.me)", feed: "https://fasterthanli.me/index.xml" },
  { name: "Alex Kladov (matklad)", feed: "https://matklad.github.io/feed.xml" },
  { name: "Drew DeVault", feed: "https://drewdevault.com/blog/index.xml" },
  { name: "Eli Bendersky", feed: "https://eli.thegreenplace.net/feeds/all.atom.xml" },
  { name: "Antirez", feed: "http://antirez.com/rss" },
  { name: "Nelson Elhage", feed: "https://blog.nelhage.com/atom.xml" },
  { name: "Patrick McKenzie (patio11)", feed: "https://www.kalzumeus.com/feed/articles/" },
  { name: "Scott Aaronson", feed: "https://scottaaronson.blog/?feed=rss2" },
  { name: "Nikita Prokopov (tonsky)", feed: "https://tonsky.me/blog/atom.xml" },
  { name: "Chris Wellons (null program)", feed: "https://nullprogram.com/feed/" },
  { name: "Ben Kuhn", feed: "https://www.benkuhn.net/index.xml" },
  { name: "Bartosz Ciechanowski", feed: "https://ciechanow.ski/atom.xml" },
  { name: "Xe Iaso", feed: "https://xeiaso.net/blog.rss" },
  { name: "Tania Rascia", feed: "https://www.taniarascia.com/rss.xml" },
  { name: "Jamie Brandon", feed: "https://www.scattered-thoughts.net/atom.xml" },
  { name: "Thorsten Ball", feed: "https://thorstenball.com/atom.xml" },
  { name: "Hillel Wayne", feed: "https://www.hillelwayne.com/index.xml" },
  { name: "Paul Graham", feed: "https://www.aaronsw.com/2002/feeds/pgessays.rss" },
  { name: "Jeff Atwood (Coding Horror)", feed: "https://blog.codinghorror.com/rss/" },
  { name: "Bob Nystrom", feed: "https://journal.stuffwithstuff.com/atom.xml" },
  { name: "Aria Beingessner (Gankra)", feed: "https://faultlore.com/blah/atom.xml" },
  { name: "Will Larson", feed: "https://lethain.com/feeds/" },
  { name: "Nadia Asparouhova", feed: "https://nadia.xyz/feed.xml" },
  { name: "Dario Amodei", feed: "https://darioamodei.com/rss.xml" },
  // Economics, political philosophy, liberalism
  { name: "Marginal Revolution", feed: "https://marginalrevolution.com/feed" },
  { name: "John Cochrane (Grumpy Economist)", feed: "https://johnhcochrane.blogspot.com/feeds/posts/default?alt=rss" },
  { name: "Arnold Kling", feed: "https://www.arnoldkling.com/blog/feed/" },
  { name: "Cafe Hayek", feed: "https://cafehayek.com/feed" },
  { name: "EconLog", feed: "https://www.econlib.org/feed/" },
  { name: "Noah Smith (Noahpinion)", feed: "https://www.noahpinion.blog/feed" },
  { name: "Matt Levine (Money Stuff)", feed: "https://www.bloomberg.com/opinion/authors/ARbTQlRLRjE/matthew-s-levine.rss" },
  { name: "Mises Institute", feed: "https://mises.org/feed" },
];

async function parseFeed(url) {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "CatchupBot/1.0" },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return [];
    const xml = await res.text();

    const items = [];
    // Parse both RSS <item> and Atom <entry>
    const isAtom = xml.includes("<feed") || xml.includes("<entry>");

    if (isAtom) {
      const entries = xml.split(/<entry[\s>]/);
      for (let i = 1; i < entries.length; i++) {
        const entry = entries[i];
        const title = entry.match(/<title[^>]*>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/s)?.[1]?.trim();
        let link = entry.match(/<link[^>]*href=["']([^"']+)["'][^>]*\/?\s*>/)?.[1];
        if (!link) link = entry.match(/<link[^>]*>([^<]+)<\/link>/)?.[1];
        const published = entry.match(/<(?:published|updated)[^>]*>([^<]+)/)?.[1];
        const summary = entry.match(/<(?:summary|content)[^>]*>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/(?:summary|content)>/s)?.[1];
        if (title && link) {
          items.push({ title: decodeEntities(title), url: link.trim(), published, summary: cleanHtml(summary || "") });
        }
      }
    } else {
      const rssItems = xml.split(/<item[\s>]/);
      for (let i = 1; i < rssItems.length; i++) {
        const item = rssItems[i];
        const title = item.match(/<title[^>]*>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/s)?.[1]?.trim();
        const link = item.match(/<link[^>]*>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/link>/s)?.[1]?.trim();
        const published = item.match(/<pubDate[^>]*>([^<]+)/)?.[1] || item.match(/<dc:date[^>]*>([^<]+)/)?.[1];
        const desc = item.match(/<description[^>]*>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/description>/s)?.[1];
        const content = item.match(/<content:encoded[^>]*>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/content:encoded>/s)?.[1];
        if (title && link) {
          items.push({ title: decodeEntities(title), url: link.trim(), published, summary: cleanHtml(content || desc || "") });
        }
      }
    }

    return items;
  } catch (err) {
    console.log(`  ✗ fetch failed: ${err.message}`);
    return [];
  }
}

function decodeEntities(str) {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#8217;/g, "'")
    .replace(/&#8220;/g, '"')
    .replace(/&#8221;/g, '"')
    .replace(/&#8211;/g, "–")
    .replace(/&#8212;/g, "—");
}

function cleanHtml(html) {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 500);
}

async function scrapeArticle(url) {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "CatchupBot/1.0" },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return null;
    const html = await res.text();

    // Extract main content heuristically
    const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    const body = bodyMatch ? bodyMatch[1] : html;

    // Try to find article/main content
    let content = "";
    const articleMatch = body.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
    const mainMatch = body.match(/<main[^>]*>([\s\S]*?)<\/main>/i);
    const entryMatch = body.match(/<div[^>]*class="[^"]*(?:entry|post|article|content)[^"]*"[^>]*>([\s\S]*?)<\/div>\s*(?:<\/div>|<footer)/i);

    content = articleMatch?.[1] || mainMatch?.[1] || entryMatch?.[1] || body;

    // Strip nav, header, footer, script, style
    content = content
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<nav[\s\S]*?<\/nav>/gi, "")
      .replace(/<header[\s\S]*?<\/header>/gi, "")
      .replace(/<footer[\s\S]*?<\/footer>/gi, "");

    const textContent = content.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    const wordCount = textContent.split(/\s+/).length;

    if (wordCount < 100) return null;

    return { content, textContent, wordCount };
  } catch {
    return null;
  }
}

async function main() {
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");

  db.exec(`
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
  `);

  const cols = db.prepare("PRAGMA table_info(articles)").all();
  if (!cols.some((c) => c.name === "is_bookmarked")) {
    db.exec("ALTER TABLE articles ADD COLUMN is_bookmarked INTEGER DEFAULT 0");
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS interests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      article_id INTEGER REFERENCES articles(id),
      paragraph_index INTEGER, paragraph_text TEXT, keywords TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);

  const insert = db.prepare(`
    INSERT OR IGNORE INTO articles (url, title, content, text_content, excerpt, author, site_name, word_count, published_date)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  let totalInserted = 0;

  for (const source of FEEDS) {
    console.log(`\n[${source.name}]`);
    const items = await parseFeed(source.feed);
    console.log(`  ${items.length} items from feed`);

    let inserted = 0;
    for (const item of items.slice(0, 15)) {
      // Skip if already exists
      const existing = db.prepare("SELECT id FROM articles WHERE url = ?").get(item.url);
      if (existing) continue;

      const scraped = await scrapeArticle(item.url);
      if (!scraped) {
        console.log(`  ✗ ${item.title.slice(0, 50)}`);
        continue;
      }

      insert.run(
        item.url,
        item.title,
        scraped.content,
        scraped.textContent,
        item.summary?.slice(0, 300) || scraped.textContent.slice(0, 300),
        source.name,
        source.name,
        scraped.wordCount,
        item.published || null
      );
      inserted++;
      console.log(`  + ${item.title.slice(0, 60)}`);
    }
    totalInserted += inserted;
  }

  const count = db.prepare("SELECT COUNT(*) as c FROM articles WHERE word_count > 100").get();
  console.log(`\nDone. Inserted ${totalInserted} new articles. Total in DB: ${count.c}`);
  db.close();
}

main().catch(console.error);
