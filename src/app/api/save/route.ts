import { NextResponse } from "next/server";
import { verifyApiKey } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { downloadAndStoreImage, processContentImages } from "@/lib/images";

export async function POST(request: Request) {
  const apiKey = request.headers.get("x-api-key");
  if (!apiKey || !verifyApiKey(apiKey)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const {
    url,
    title,
    content,
    textContent,
    excerpt,
    author,
    siteName,
    publishedDate,
    leadImageUrl,
    wordCount,
    sourceType = "article",
    scrollDepth = 0,
    timeSpent = 0,
    captureMethod = "manual",
  } = body;

  if (!url || !title) {
    return NextResponse.json(
      { error: "url and title are required" },
      { status: 400 }
    );
  }

  const db = getDb();

  const existing = db
    .prepare("SELECT id FROM articles WHERE url = ?")
    .get(url);
  if (existing) {
    return NextResponse.json({ ok: true, id: (existing as { id: number }).id, existing: true });
  }

  let processedContent = content || "";
  let storedLeadImage = leadImageUrl || null;

  if (processedContent) {
    processedContent = await processContentImages(processedContent);
  }

  if (storedLeadImage) {
    const localImage = await downloadAndStoreImage(storedLeadImage);
    if (localImage) storedLeadImage = localImage;
  }

  const result = db
    .prepare(
      `INSERT INTO articles (url, title, content, text_content, excerpt, author, site_name, published_date, lead_image_url, word_count, source_type, scroll_depth, time_spent, capture_method)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      url,
      title,
      processedContent,
      textContent || "",
      excerpt || "",
      author || "",
      siteName || "",
      publishedDate || "",
      storedLeadImage,
      wordCount || 0,
      sourceType,
      scrollDepth,
      timeSpent,
      captureMethod
    );

  return NextResponse.json({ ok: true, id: result.lastInsertRowid });
}
