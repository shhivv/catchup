import { NextResponse } from "next/server";
import { verifyRequest } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { downloadAndStoreImage, processContentImages } from "@/lib/images";
import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";

export async function POST(request: Request) {
  if (!verifyRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { url } = await request.json();
  if (!url) {
    return NextResponse.json({ error: "url is required" }, { status: 400 });
  }

  const db = getDb();
  const existing = db.prepare("SELECT id FROM articles WHERE url = ?").get(url);
  if (existing) {
    return NextResponse.json({ ok: true, id: (existing as { id: number }).id, existing: true });
  }

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
      },
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: `Failed to fetch: ${res.status}` },
        { status: 400 }
      );
    }

    const html = await res.text();
    const dom = new JSDOM(html, { url });
    const reader = new Readability(dom.window.document);
    const parsed = reader.parse();

    if (!parsed) {
      return NextResponse.json(
        { error: "Could not extract article content" },
        { status: 400 }
      );
    }

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

    const siteName = getMeta(['meta[property="og:site_name"]', 'meta[name="application-name"]']);
    const leadImageUrl = getMeta(['meta[property="og:image"]', 'meta[name="twitter:image"]']);
    const publishedDate = getMeta(['meta[property="article:published_time"]', 'meta[name="date"]']);

    let processedContent = parsed.content || "";
    let storedLeadImage = leadImageUrl || null;

    if (processedContent) {
      processedContent = await processContentImages(processedContent);
    }
    if (storedLeadImage) {
      const local = await downloadAndStoreImage(storedLeadImage);
      if (local) storedLeadImage = local;
    }

    const wordCount = (parsed.textContent || "").split(/\s+/).filter(Boolean).length;

    const result = db
      .prepare(
        `INSERT INTO articles (url, title, content, text_content, excerpt, author, site_name, published_date, lead_image_url, word_count, source_type, capture_method)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'article', 'manual')`
      )
      .run(
        url,
        parsed.title || "",
        processedContent,
        parsed.textContent || "",
        parsed.excerpt || "",
        parsed.byline || "",
        siteName || parsed.siteName || "",
        publishedDate || "",
        storedLeadImage,
        wordCount
      );

    return NextResponse.json({ ok: true, id: result.lastInsertRowid });
  } catch (err) {
    return NextResponse.json(
      { error: `Scrape failed: ${err instanceof Error ? err.message : "unknown"}` },
      { status: 500 }
    );
  }
}
