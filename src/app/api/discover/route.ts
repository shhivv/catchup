import { NextResponse } from "next/server";
import { verifyRequest } from "@/lib/auth";
import { crawlFromSavedArticles } from "@/lib/crawl";

export async function POST(request: Request) {
  if (!verifyRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await crawlFromSavedArticles();
  return NextResponse.json(result);
}
