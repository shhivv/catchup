import { NextResponse } from "next/server";
import { verifyRequest } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { extractKeywords } from "@/lib/tfidf";

export async function POST(request: Request) {
  if (!verifyRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { articleId, paragraphIndex, paragraphText } = await request.json();

  if (!paragraphText || articleId === undefined) {
    return NextResponse.json(
      { error: "articleId and paragraphText required" },
      { status: 400 }
    );
  }

  const keywords = extractKeywords(paragraphText);
  const db = getDb();

  db.prepare(
    `INSERT INTO interests (article_id, paragraph_index, paragraph_text, keywords)
     VALUES (?, ?, ?, ?)`
  ).run(articleId, paragraphIndex || 0, paragraphText, JSON.stringify(keywords));

  return NextResponse.json({ ok: true, keywords });
}

export async function GET(request: Request) {
  if (!verifyRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getDb();
  const interests = db
    .prepare("SELECT * FROM interests ORDER BY created_at DESC LIMIT 50")
    .all();

  return NextResponse.json({ interests });
}
