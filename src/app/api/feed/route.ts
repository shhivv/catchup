import { NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";
import { getDb, Article } from "@/lib/db";

export async function GET(request: Request) {
  if (!(await verifySession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const page = parseInt(searchParams.get("page") || "1");
  const limit = parseInt(searchParams.get("limit") || "20");
  const filter = searchParams.get("filter") || "unread";
  const source = searchParams.get("source") || "all";
  const offset = (page - 1) * limit;

  const db = getDb();

  let where = "is_archived = 0";
  if (filter === "unread") where += " AND is_read = 0";
  else if (filter === "read") where += " AND is_read = 1";

  if (source === "article") where += " AND source_type = 'article'";
  else if (source === "tweet") where += " AND source_type = 'tweet'";

  const articles = db
    .prepare(
      `SELECT * FROM articles WHERE ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`
    )
    .all(limit, offset) as Article[];

  const total = db
    .prepare(`SELECT COUNT(*) as count FROM articles WHERE ${where}`)
    .get() as { count: number };

  return NextResponse.json({
    articles,
    total: total.count,
    page,
    pages: Math.ceil(total.count / limit),
  });
}
