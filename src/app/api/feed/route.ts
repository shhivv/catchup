import { NextResponse } from "next/server";
import { verifyRequest } from "@/lib/auth";
import { getDb, Article } from "@/lib/db";
import { buildProfile, scoreArticle } from "@/lib/tfidf";
import { seedInitialFeed } from "@/lib/crawl";

export async function GET(request: Request) {
  if (!verifyRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const page = parseInt(searchParams.get("page") || "1");
  const limit = parseInt(searchParams.get("limit") || "20");
  const filter = searchParams.get("filter") || "unread";

  const db = getDb();

  const totalCount = (
    db.prepare("SELECT COUNT(*) as c FROM articles").get() as { c: number }
  ).c;

  if (totalCount === 0) {
    await seedInitialFeed();
  }

  let where = "is_archived = 0";
  if (filter === "unread") where += " AND is_read = 0";
  else if (filter === "read") where += " AND is_read = 1";

  const allArticles = db
    .prepare(
      `SELECT * FROM articles WHERE ${where} AND word_count > 0
       ORDER BY created_at DESC`
    )
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

  return NextResponse.json({
    articles,
    suggestions: [],
    total,
    page,
    pages: Math.ceil(total / limit),
    hasInterests: interests.length > 0,
  });
}
