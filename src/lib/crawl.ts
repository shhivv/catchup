import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";
import { getDb, Article } from "./db";
import { discoverFeed, parseFeed } from "./feeds";
import { buildProfile, scoreArticle } from "./tfidf";
import { downloadAndStoreImage, processContentImages } from "./images";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

function getDomain(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return "";
  }
}

function isArticleUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.pathname === "/" || u.pathname === "") return false;
    const skip = [
      /\.(css|js|png|jpg|jpeg|gif|svg|webp|ico|woff|woff2|ttf|eot|pdf|zip|mp4|mp3)$/i,
      /^\/?(tag|category|author|page|search|login|signup|about|contact|privacy|terms|faq)\b/i,
      /\/(wp-content|wp-admin|wp-includes|assets|static)\//i,
    ];
    return !skip.some((r) => r.test(u.pathname));
  } catch {
    return false;
  }
}

function extractLinksFromHtml(html: string, baseUrl: string): string[] {
  const links: string[] = [];
  const seen = new Set<string>();
  const regex = /<a[^>]+href=["']([^"'#]+)["']/gi;
  let match;

  while ((match = regex.exec(html)) !== null) {
    try {
      const href = match[1];
      const absolute = href.startsWith("http")
        ? href
        : new URL(href, baseUrl).toString();
      const normalized = absolute.split("?")[0].split("#")[0];
      if (!seen.has(normalized) && isArticleUrl(normalized)) {
        seen.add(normalized);
        links.push(absolute);
      }
    } catch {}
  }

  return links;
}

async function scrapeArticle(url: string): Promise<{
  title: string;
  content: string;
  textContent: string;
  excerpt: string;
  author: string;
  siteName: string;
  publishedDate: string;
  leadImageUrl: string;
  wordCount: number;
} | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml" },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return null;

    const html = await res.text();
    const dom = new JSDOM(html, { url });
    const reader = new Readability(dom.window.document);
    const parsed = reader.parse();
    if (!parsed) return null;

    const doc = dom.window.document;
    const getMeta = (selectors: string[]) => {
      for (const sel of selectors) {
        const el = doc.querySelector(sel);
        if (el) {
          const content = el.getAttribute("content");
          if (content) return content;
        }
      }
      return "";
    };

    return {
      title: parsed.title || "",
      content: parsed.content || "",
      textContent: parsed.textContent || "",
      excerpt: parsed.excerpt || "",
      author: parsed.byline || "",
      siteName:
        getMeta([
          'meta[property="og:site_name"]',
          'meta[name="application-name"]',
        ]) ||
        parsed.siteName ||
        "",
      publishedDate: getMeta([
        'meta[property="article:published_time"]',
        'meta[name="date"]',
      ]),
      leadImageUrl: getMeta([
        'meta[property="og:image"]',
        'meta[name="twitter:image"]',
      ]),
      wordCount: (parsed.textContent || "").split(/\s+/).filter(Boolean).length,
    };
  } catch {
    return null;
  }
}

function getUserInterestProfile(): Map<string, number> {
  const db = getDb();
  const interests = db
    .prepare(
      "SELECT keywords FROM interests ORDER BY created_at DESC LIMIT 200"
    )
    .all() as { keywords: string }[];

  if (interests.length === 0) return new Map();

  const allKeywords = interests.map((i) => {
    try {
      return JSON.parse(i.keywords);
    } catch {
      return [];
    }
  });

  return buildProfile(allKeywords);
}

function getTopSources(): { domain: string; siteName: string; count: number }[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT site_name, url, COUNT(*) as cnt
       FROM articles
       WHERE capture_method != 'suggested' AND url != ''
       GROUP BY site_name
       HAVING cnt >= 1
       ORDER BY cnt DESC
       LIMIT 30`
    )
    .all() as { site_name: string; url: string; cnt: number }[];

  const sources: { domain: string; siteName: string; count: number }[] = [];
  const seen = new Set<string>();

  for (const row of rows) {
    const domain = getDomain(row.url);
    if (domain && !seen.has(domain)) {
      seen.add(domain);
      sources.push({ domain, siteName: row.site_name, count: row.cnt });
    }
  }

  return sources;
}

export async function extractOutboundLinks(articleId: number): Promise<string[]> {
  const db = getDb();
  const article = db
    .prepare("SELECT url, content FROM articles WHERE id = ?")
    .get(articleId) as { url: string; content: string } | undefined;

  if (!article?.content) return [];
  return extractLinksFromHtml(article.content, article.url);
}

async function crawlSitemap(siteUrl: string): Promise<string[]> {
  const urls: string[] = [];
  const sitemapPaths = ["/sitemap.xml", "/sitemap_index.xml", "/sitemap-posts.xml"];

  for (const path of sitemapPaths) {
    try {
      const res = await fetch(siteUrl + path, {
        headers: { "User-Agent": UA },
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) continue;

      const text = await res.text();
      if (!text.includes("<urlset") && !text.includes("<sitemapindex")) continue;

      const locRegex = /<loc>([^<]+)<\/loc>/g;
      let match;
      while ((match = locRegex.exec(text)) !== null) {
        const loc = match[1].trim();
        if (loc.endsWith(".xml")) {
          try {
            const subRes = await fetch(loc, {
              headers: { "User-Agent": UA },
              signal: AbortSignal.timeout(10000),
            });
            if (subRes.ok) {
              const subText = await subRes.text();
              let subMatch;
              const subLocRegex = /<loc>([^<]+)<\/loc>/g;
              while ((subMatch = subLocRegex.exec(subText)) !== null) {
                if (isArticleUrl(subMatch[1].trim())) {
                  urls.push(subMatch[1].trim());
                }
              }
            }
          } catch {}
        } else if (isArticleUrl(loc)) {
          urls.push(loc);
        }
      }

      if (urls.length > 0) break;
    } catch {}
  }

  return urls;
}

async function storeDiscoveredArticle(
  url: string,
  scraped: Awaited<ReturnType<typeof scrapeArticle>>,
  relevanceScore: number,
  sourceMethod: "outbound_link" | "same_source" | "rss"
): Promise<boolean> {
  const db = getDb();

  const exists = db.prepare("SELECT id FROM articles WHERE url = ?").get(url);
  if (exists) return false;

  let content = scraped?.content || "";
  let leadImage = scraped?.leadImageUrl || null;

  if (content) {
    content = await processContentImages(content);
  }
  if (leadImage) {
    const local = await downloadAndStoreImage(leadImage);
    if (local) leadImage = local;
  }

  db.prepare(
    `INSERT OR IGNORE INTO articles
     (url, title, content, text_content, excerpt, author, site_name,
      published_date, lead_image_url, word_count, source_type,
      capture_method, relevance_score, discovered_from)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'article', 'suggested', ?, ?)`
  ).run(
    url,
    scraped?.title || "",
    content,
    scraped?.textContent || "",
    scraped?.excerpt || "",
    scraped?.author || "",
    scraped?.siteName || "",
    scraped?.publishedDate || "",
    leadImage,
    scraped?.wordCount || 0,
    relevanceScore,
    sourceMethod
  );

  return true;
}

export async function crawlFromSavedArticles(): Promise<{
  crawled: number;
  stored: number;
  sources: number;
}> {
  const db = getDb();
  const profile = getUserInterestProfile();

  const savedArticles = db
    .prepare(
      `SELECT id, url, content, site_name
       FROM articles
       WHERE capture_method != 'suggested' AND content != '' AND content IS NOT NULL
       ORDER BY created_at DESC
       LIMIT 50`
    )
    .all() as Pick<Article, "id" | "url" | "content" | "site_name">[];

  let crawled = 0;
  let stored = 0;
  const processedDomains = new Set<string>();

  // phase 1: extract outbound links from saved articles and scrape them
  const outboundUrls = new Set<string>();
  for (const article of savedArticles) {
    if (!article.content) continue;
    const links = extractLinksFromHtml(article.content, article.url);
    for (const link of links) outboundUrls.add(link);
  }

  const existingUrls = new Set(
    (
      db
        .prepare("SELECT url FROM articles")
        .all() as { url: string }[]
    ).map((r) => r.url)
  );

  const newOutbound = [...outboundUrls].filter(
    (u) => !existingUrls.has(u) && !existingUrls.has(u.split("?")[0])
  );

  // score outbound links: prioritize those from domains user already reads
  const userDomains = new Set(
    savedArticles.map((a) => getDomain(a.url)).filter(Boolean)
  );

  const scoredOutbound = newOutbound.map((url) => ({
    url,
    domainBoost: userDomains.has(getDomain(url)) ? 1.5 : 1.0,
  }));

  scoredOutbound.sort((a, b) => b.domainBoost - a.domainBoost);

  for (const { url, domainBoost } of scoredOutbound.slice(0, 30)) {
    const scraped = await scrapeArticle(url);
    crawled++;
    if (!scraped || scraped.wordCount < 100) continue;

    let relevance = 0;
    if (profile.size > 0) {
      relevance = scoreArticle(scraped.textContent, profile) * domainBoost;
    }

    if (await storeDiscoveredArticle(url, scraped, relevance, "outbound_link")) {
      stored++;
    }
  }

  // phase 2: crawl top sources for more articles (rss + sitemap)
  const sources = getTopSources();

  for (const source of sources.slice(0, 10)) {
    if (processedDomains.has(source.domain)) continue;
    processedDomains.add(source.domain);

    // try rss first
    const feedUrl = await discoverFeed(source.domain);
    if (feedUrl) {
      const items = await parseFeed(feedUrl);
      for (const item of items.slice(0, 15)) {
        if (existingUrls.has(item.url)) continue;

        const scraped = await scrapeArticle(item.url);
        crawled++;
        if (!scraped || scraped.wordCount < 100) continue;

        let relevance = 0;
        if (profile.size > 0) {
          relevance = scoreArticle(scraped.textContent, profile) * 1.5;
        }

        if (await storeDiscoveredArticle(item.url, scraped, relevance, "rss")) {
          stored++;
          existingUrls.add(item.url);
        }
      }
    }

    // also try sitemap
    const sitemapUrls = await crawlSitemap(source.domain);
    const newFromSitemap = sitemapUrls
      .filter((u) => !existingUrls.has(u))
      .slice(0, 10);

    for (const url of newFromSitemap) {
      const scraped = await scrapeArticle(url);
      crawled++;
      if (!scraped || scraped.wordCount < 100) continue;

      let relevance = 0;
      if (profile.size > 0) {
        relevance = scoreArticle(scraped.textContent, profile) * 1.3;
      }

      if (await storeDiscoveredArticle(url, scraped, relevance, "same_source")) {
        stored++;
        existingUrls.add(url);
      }
    }
  }

  return { crawled, stored, sources: processedDomains.size };
}

const SEED_FEEDS = [
  { url: "https://www.theverge.com/rss/index.xml", name: "The Verge" },
  { url: "https://feeds.arstechnica.com/arstechnica/index", name: "Ars Technica" },
  { url: "https://www.wired.com/feed/rss", name: "WIRED" },
  { url: "https://feeds.feedburner.com/TheBrowserFeed", name: "The Browser" },
  { url: "https://blog.samaltman.com/feed", name: "Sam Altman" },
  { url: "https://danluu.com/atom.xml", name: "Dan Luu" },
  { url: "https://martinfowler.com/feed.atom", name: "Martin Fowler" },
  { url: "https://simonwillison.net/atom/everything/", name: "Simon Willison" },
  { url: "https://jvns.ca/atom.xml", name: "Julia Evans" },
  { url: "https://www.joelonsoftware.com/feed/", name: "Joel on Software" },
  { url: "https://waitbutwhy.com/feed", name: "Wait But Why" },
  { url: "https://xkcd.com/atom.xml", name: "xkcd" },
  { url: "https://rachelbythebay.com/w/atom.xml", name: "rachelbythebay" },
  { url: "https://scottaaronson.blog/?feed=rss2", name: "Scott Aaronson" },
];

export async function seedInitialFeed(): Promise<{ stored: number }> {
  const db = getDb();

  const count = (
    db.prepare("SELECT COUNT(*) as c FROM articles WHERE word_count > 200").get() as { c: number }
  ).c;
  if (count >= 20) return { stored: 0 };

  let stored = 0;
  const maxPerFeed = 5;

  for (const feed of SEED_FEEDS) {
    const items = await parseFeed(feed.url);
    for (const item of items.slice(0, maxPerFeed)) {
      const scraped = await scrapeArticle(item.url);
      if (!scraped || scraped.wordCount < 200) continue;

      if (
        await storeDiscoveredArticle(item.url, scraped, 0, "rss")
      ) {
        stored++;
      }
    }

    db.prepare(
      "INSERT OR IGNORE INTO feeds (url, site_url, site_name, article_count) VALUES (?, ?, ?, 0)"
    ).run(feed.url, getDomain(feed.url) || feed.url, feed.name);
  }

  return { stored };
}
