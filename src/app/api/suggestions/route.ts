import { NextResponse } from "next/server";
import { verifyRequest } from "@/lib/auth";
import { getDb, Article } from "@/lib/db";

export async function GET(request: Request) {
  if (!verifyRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const limit = parseInt(searchParams.get("limit") || "10");

  const db = getDb();

  const suggestions = db
    .prepare(
      `SELECT * FROM articles
       WHERE capture_method = 'suggested' AND is_read = 0 AND is_archived = 0
       ORDER BY created_at DESC
       LIMIT ?`
    )
    .all(limit) as Article[];

  return NextResponse.json({ suggestions });
}
