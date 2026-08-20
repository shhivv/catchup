import { NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";
import { getDb, Article } from "@/lib/db";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await verifySession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const db = getDb();
  const article = db
    .prepare("SELECT * FROM articles WHERE id = ?")
    .get(id) as Article | undefined;

  if (!article) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(article);
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await verifySession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json();
  const db = getDb();

  const updates: string[] = [];
  const values: (string | number)[] = [];

  if (body.is_read !== undefined) {
    updates.push("is_read = ?");
    values.push(body.is_read ? 1 : 0);
  }
  if (body.is_archived !== undefined) {
    updates.push("is_archived = ?");
    values.push(body.is_archived ? 1 : 0);
  }

  if (updates.length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  updates.push("updated_at = datetime('now')");
  values.push(parseInt(id));

  db.prepare(
    `UPDATE articles SET ${updates.join(", ")} WHERE id = ?`
  ).run(...values);

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await verifySession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const db = getDb();
  db.prepare("DELETE FROM articles WHERE id = ?").run(id);

  return NextResponse.json({ ok: true });
}
