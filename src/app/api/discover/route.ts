import { NextResponse } from "next/server";
import { verifyRequest } from "@/lib/auth";
import { discoverAndCrawlFeeds } from "@/lib/feeds";

export async function POST(request: Request) {
  if (!verifyRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await discoverAndCrawlFeeds();
  return NextResponse.json(result);
}
