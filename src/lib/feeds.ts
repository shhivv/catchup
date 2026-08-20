import { JSDOM } from "jsdom";
import { getDb } from "./db";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36";

interface FeedItem {
  url: string;
  title: string;
  excerpt: string;
  author: string;
  publishedDate: string;
  leadImageUrl: string;
}

function getDomain(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return "";
  }
}

export async function discoverFeed(siteUrl: string): Promise<string | null> {
  const origin = getDomain(siteUrl);
  if (!origin) return null;

  try {
    const res = await fetch(origin, { headers: { "User-Agent": UA } });
    if (!res.ok) return null;
    const html = await res.text();
    const dom = new JSDOM(html);
    const doc = dom.window.document;

    const linkEl = doc.querySelector(
      'link[type="application/rss+xml"], link[type="application/atom+xml"], link[type="application/feed+json"]'
    );
    if (linkEl) {
      const href = linkEl.getAttribute("href");
      if (href) {
        return href.startsWith("http") ? href : new URL(href, origin).toString();
      }
    }
  } catch {}

  const commonPaths = [
    "/feed", "/rss", "/feed.xml", "/rss.xml", "/atom.xml",
    "/index.xml", "/feed/", "/rss/", "/blog/feed", "/blog/rss.xml",
  ];

  for (const path of commonPaths) {
    try {
      const res = await fetch(origin + path, {
        headers: { "User-Agent": UA },
        redirect: "follow",
      });
      if (!res.ok) continue;
      const ct = res.headers.get("content-type") || "";
      const text = await res.text();
      if (ct.includes("xml") || ct.includes("rss") || ct.includes("atom") || text.trimStart().startsWith("<?xml") || text.trimStart().startsWith("<rss") || text.trimStart().startsWith("<feed")) {
        return origin + path;
      }
    } catch {}
  }

  return null;
}

export async function parseFeed(feedUrl: string): Promise<FeedItem[]> {
  try {
    const res = await fetch(feedUrl, { headers: { "User-Agent": UA } });
    if (!res.ok) return [];
    const xml = await res.text();
    const dom = new JSDOM(xml, { contentType: "text/xml" });
    const doc = dom.window.document;

    const items: FeedItem[] = [];

    const rssItems = doc.querySelectorAll("item");
    if (rssItems.length > 0) {
      for (const item of rssItems) {
        const link = item.querySelector("link");
        const url = link?.textContent?.trim() || "";
        if (!url) continue;

        items.push({
          url,
          title: item.querySelector("title")?.textContent?.trim() || "",
          excerpt: stripHtml(
            item.querySelector("description")?.textContent?.trim() || ""
          ).slice(0, 300),
          author: item.querySelector("creator, author")?.textContent?.trim() || "",
          publishedDate: item.querySelector("pubDate")?.textContent?.trim() || "",
          leadImageUrl: extractImageFromContent(
            item.querySelector("encoded, content")?.textContent || ""
          ) || extractMediaContent(item) || "",
        });
      }
      return items;
    }

    const atomEntries = doc.querySelectorAll("entry");
    for (const entry of atomEntries) {
      const linkEl = entry.querySelector('link[rel="alternate"], link:not([rel])');
      const url = linkEl?.getAttribute("href") || "";
      if (!url) continue;

      items.push({
        url: url.startsWith("http") ? url : new URL(url, feedUrl).toString(),
        title: entry.querySelector("title")?.textContent?.trim() || "",
        excerpt: stripHtml(
          entry.querySelector("summary, content")?.textContent?.trim() || ""
        ).slice(0, 300),
        author: entry.querySelector("author name")?.textContent?.trim() || "",
        publishedDate: entry.querySelector("published, updated")?.textContent?.trim() || "",
        leadImageUrl: extractImageFromContent(
          entry.querySelector("content")?.textContent || ""
        ) || "",
      });
    }

    return items;
  } catch {
    return [];
  }
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
}

function extractImageFromContent(html: string): string {
  const match = html.match(/<img[^>]+src=["']([^"']+)["']/i);
  return match?.[1] || "";
}

function extractMediaContent(item: Element): string {
  const media = item.querySelector("thumbnail, enclosure");
  return media?.getAttribute("url") || "";
}

export async function discoverAndCrawlFeeds(): Promise<{
  discovered: number;
  newArticles: number;
}> {
  const db = getDb();
  let discovered = 0;
  let newArticles = 0;

  const topSources = db
    .prepare(
      `SELECT site_name, url, COUNT(*) as cnt
       FROM articles
       WHERE capture_method != 'suggested' AND site_name != ''
       GROUP BY site_name
       ORDER BY cnt DESC
       LIMIT 20`
    )
    .all() as { site_name: string; url: string; cnt: number }[];

  for (const source of topSources) {
    const domain = getDomain(source.url);
    if (!domain) continue;

    const existingFeed = db
      .prepare("SELECT id FROM feeds WHERE site_url = ?")
      .get(domain);
    if (existingFeed) continue;

    const feedUrl = await discoverFeed(source.url);
    if (!feedUrl) continue;

    db.prepare(
      "INSERT OR IGNORE INTO feeds (url, site_url, site_name, article_count) VALUES (?, ?, ?, ?)"
    ).run(feedUrl, domain, source.site_name, source.cnt);
    discovered++;
  }

  const feeds = db
    .prepare(
      `SELECT * FROM feeds ORDER BY article_count DESC`
    )
    .all() as {
      id: number; url: string; site_url: string;
      site_name: string; last_fetched: string; article_count: number;
    }[];

  for (const feed of feeds) {
    const items = await parseFeed(feed.url);

    for (const item of items.slice(0, 10)) {
      const exists = db
        .prepare("SELECT id FROM articles WHERE url = ?")
        .get(item.url);
      if (exists) continue;

      db.prepare(
        `INSERT OR IGNORE INTO articles
         (url, title, excerpt, author, site_name, published_date, lead_image_url,
          source_type, capture_method, word_count)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'article', 'suggested', 0)`
      ).run(
        item.url,
        item.title,
        item.excerpt,
        item.author,
        feed.site_name,
        item.publishedDate,
        item.leadImageUrl
      );
      newArticles++;
    }

    db.prepare(
      "UPDATE feeds SET last_fetched = datetime('now') WHERE id = ?"
    ).run(feed.id);
  }

  return { discovered, newArticles };
}
