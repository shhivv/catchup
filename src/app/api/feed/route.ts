import { NextResponse } from "next/server";
import { verifyRequest } from "@/lib/auth";
import { getDb, Article } from "@/lib/db";

export async function GET(request: Request) {
  if (!verifyRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const page = parseInt(searchParams.get("page") || "1");
  const limit = parseInt(searchParams.get("limit") || "20");

  const db = getDb();

  const total = (
    db
      .prepare("SELECT COUNT(*) as c FROM articles WHERE is_archived = 0 AND word_count > 0")
      .get() as { c: number }
  ).c;

  const offset = (page - 1) * limit;
  const articles = db
    .prepare(
      `SELECT * FROM articles WHERE is_archived = 0 AND word_count > 0
       ORDER BY RANDOM() LIMIT ? OFFSET ?`
    )
    .all(limit, offset) as Article[];

  return NextResponse.json({
    articles,
    total,
    page,
    pages: Math.ceil(total / limit),
  });
}
