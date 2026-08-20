import { NextResponse } from "next/server";
import { verifyRequest } from "@/lib/auth";
import { getDb, Article } from "@/lib/db";
import { buildProfile, scoreArticle } from "@/lib/tfidf";

export async function GET(request: Request) {
  if (!verifyRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const page = parseInt(searchParams.get("page") || "1");
  const limit = parseInt(searchParams.get("limit") || "20");
  const filter = searchParams.get("filter") || "unread";
  const source = searchParams.get("source") || "all";

  const db = getDb();

  let where = "is_archived = 0 AND capture_method != 'suggested'";
  if (filter === "unread") where += " AND is_read = 0";
  else if (filter === "read") where += " AND is_read = 1";

  if (source === "article") where += " AND source_type = 'article'";
  else if (source === "tweet") where += " AND source_type = 'tweet'";

  const allArticles = db
    .prepare(`SELECT * FROM articles WHERE ${where} ORDER BY created_at DESC`)
    .all() as Article[];

  const total = allArticles.length;

  const interests = db
    .prepare("SELECT keywords FROM interests ORDER BY created_at DESC LIMIT 100")
    .all() as { keywords: string }[];

  let ranked: (Article & { relevance: number })[];

  if (interests.length > 0) {
    const allKeywords = interests.map((i) => {
      try {
        return JSON.parse(i.keywords);
      } catch {
        return [];
      }
    });
    const profile = buildProfile(allKeywords);

    ranked = allArticles.map((article) => {
      const relevance = scoreArticle(
        article.text_content || article.excerpt || article.title,
        profile
      );
      return { ...article, relevance };
    });

    const now = Date.now();
    ranked.sort((a, b) => {
      const ageA = (now - new Date(a.created_at + "Z").getTime()) / 3600000;
      const ageB = (now - new Date(b.created_at + "Z").getTime()) / 3600000;
      const recencyA = 1 / (1 + ageA / 24);
      const recencyB = 1 / (1 + ageB / 24);

      const scoreA = recencyA * 0.4 + a.relevance * 0.6;
      const scoreB = recencyB * 0.4 + b.relevance * 0.6;
      return scoreB - scoreA;
    });
  } else {
    ranked = allArticles.map((a) => ({ ...a, relevance: 0 }));
  }

  const offset = (page - 1) * limit;
  const articles = ranked.slice(offset, offset + limit);

  let suggestions = db
    .prepare(
      `SELECT * FROM articles
       WHERE capture_method = 'suggested' AND is_read = 0 AND is_archived = 0
         AND word_count > 0
       ORDER BY relevance_score DESC, created_at DESC
       LIMIT 10`
    )
    .all() as (Article & { relevance_score: number })[];

  if (interests.length > 0) {
    const allKw2 = interests.map((i) => {
      try { return JSON.parse(i.keywords); } catch { return []; }
    });
    const prof = buildProfile(allKw2);
    for (const s of suggestions) {
      s.relevance_score = scoreArticle(
        s.text_content || s.excerpt || s.title,
        prof
      );
    }
    suggestions.sort((a, b) => b.relevance_score - a.relevance_score);
    suggestions = suggestions.slice(0, 5);
  } else {
    suggestions = suggestions.slice(0, 5);
  }

  return NextResponse.json({
    articles,
    suggestions,
    total,
    page,
    pages: Math.ceil(total / limit),
    hasInterests: interests.length > 0,
  });
}
