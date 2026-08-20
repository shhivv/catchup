import { NextResponse } from "next/server";
import { verifyRequest } from "@/lib/auth";
import { getDb, Article } from "@/lib/db";
import { buildProfile, scoreArticle } from "@/lib/tfidf";

export async function GET(request: Request) {
  if (!verifyRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const limit = parseInt(searchParams.get("limit") || "20");

  const db = getDb();

  const allSuggestions = db
    .prepare(
      `SELECT * FROM articles
       WHERE capture_method = 'suggested' AND is_read = 0 AND is_archived = 0
         AND word_count > 0`
    )
    .all() as (Article & { relevance_score: number; discovered_from: string })[];

  const interests = db
    .prepare("SELECT keywords FROM interests ORDER BY created_at DESC LIMIT 200")
    .all() as { keywords: string }[];

  if (interests.length > 0) {
    const allKeywords = interests.map((i) => {
      try {
        return JSON.parse(i.keywords);
      } catch {
        return [];
      }
    });
    const profile = buildProfile(allKeywords);

    const userDomains = new Set(
      (
        db
          .prepare(
            `SELECT DISTINCT url FROM articles WHERE capture_method != 'suggested'`
          )
          .all() as { url: string }[]
      ).map((r) => {
        try {
          return new URL(r.url).origin;
        } catch {
          return "";
        }
      })
    );

    for (const s of allSuggestions) {
      const relevance = scoreArticle(
        s.text_content || s.excerpt || s.title,
        profile
      );
      const fromUserSource = userDomains.has(
        (() => { try { return new URL(s.url).origin; } catch { return ""; } })()
      );
      s.relevance_score = relevance * (fromUserSource ? 1.5 : 1.0);
    }

    allSuggestions.sort((a, b) => b.relevance_score - a.relevance_score);
  } else {
    allSuggestions.sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  }

  return NextResponse.json({
    suggestions: allSuggestions.slice(0, limit),
  });
}
