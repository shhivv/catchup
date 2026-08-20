import { NextResponse } from "next/server";
import { verifyRequest } from "@/lib/auth";
import { getDb, Article } from "@/lib/db";
import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";
import { downloadAndStoreImage, processContentImages } from "@/lib/images";

async function scrapeFullContent(article: Article): Promise<Article> {
  try {
    const res = await fetch(article.url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        Accept: "text/html,application/xhtml+xml",
      },
    });
    if (!res.ok) return article;

    const html = await res.text();
    const dom = new JSDOM(html, { url: article.url });
    const reader = new Readability(dom.window.document);
    const parsed = reader.parse();
    if (!parsed) return article;

    const doc = dom.window.document;
    const getMeta = (sels: string[]) => {
      for (const s of sels) {
        const el = doc.querySelector(s);
        if (el) { const c = el.getAttribute("content"); if (c) return c; }
      }
      return "";
    };

    let content = parsed.content || "";
    let leadImage = article.lead_image_url || getMeta(['meta[property="og:image"]', 'meta[name="twitter:image"]']);

    content = await processContentImages(content);
    if (leadImage) {
      const local = await downloadAndStoreImage(leadImage);
      if (local) leadImage = local;
    }

    const wordCount = (parsed.textContent || "").split(/\s+/).filter(Boolean).length;

    const db = getDb();
    db.prepare(
      `UPDATE articles SET content = ?, text_content = ?, excerpt = CASE WHEN excerpt = '' THEN ? ELSE excerpt END,
       author = CASE WHEN author = '' THEN ? ELSE author END,
       lead_image_url = CASE WHEN lead_image_url = '' THEN ? ELSE lead_image_url END,
       word_count = ?, updated_at = datetime('now') WHERE id = ?`
    ).run(content, parsed.textContent || "", parsed.excerpt || "", parsed.byline || "", leadImage, wordCount, article.id);

    return {
      ...article,
      content,
      text_content: parsed.textContent || "",
      excerpt: article.excerpt || parsed.excerpt || "",
      author: article.author || parsed.byline || "",
      lead_image_url: leadImage || article.lead_image_url,
      word_count: wordCount,
    };
  } catch {
    return article;
  }
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!verifyRequest(_request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const db = getDb();
  let article = db
    .prepare("SELECT * FROM articles WHERE id = ?")
    .get(id) as Article | undefined;

  if (!article) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (!article.content && article.url) {
    article = await scrapeFullContent(article);
  }

  return NextResponse.json(article);
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!verifyRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json();
  const db = getDb();

  const updates: string[] = [];
  const values: (string | number)[] = [];

  if (body.is_read !== undefined) {
    updates.push("is_read = ?");
    values.push(body.is_read ? 1 : 0);
  }
  if (body.is_archived !== undefined) {
    updates.push("is_archived = ?");
    values.push(body.is_archived ? 1 : 0);
  }

  if (updates.length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  updates.push("updated_at = datetime('now')");
  values.push(parseInt(id));

  db.prepare(
    `UPDATE articles SET ${updates.join(", ")} WHERE id = ?`
  ).run(...values);

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!verifyRequest(_request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const db = getDb();
  db.prepare("DELETE FROM articles WHERE id = ?").run(id);

  return NextResponse.json({ ok: true });
}
