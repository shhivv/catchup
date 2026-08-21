import json
import os

from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.responses import JSONResponse

from db import get_db
from tfidf import extract_keywords, segment_html

app = FastAPI()

API_KEY = os.environ.get("CATCHUP_API_KEY", "catchup-extension-key")


def verify(x_api_key: str | None = Header(None), authorization: str | None = Header(None)):
    if x_api_key == API_KEY:
        return
    if authorization and authorization.startswith("Bearer ") and authorization[7:] == API_KEY:
        return
    raise HTTPException(401, "Unauthorized")


# ---------- feed ----------

@app.get("/api/feed")
def feed(
    page: int = 1,
    limit: int = 20,
    filter: str = "all",
    x_api_key: str | None = Header(None),
    authorization: str | None = Header(None),
):
    verify(x_api_key, authorization)
    db = get_db()

    where = "word_count > 0"
    if filter == "bookmarked":
        where += " AND is_bookmarked = 1"
    else:
        where += " AND is_archived = 0"

    total = db.execute(f"SELECT COUNT(*) AS c FROM articles WHERE {where}").fetchone()["c"]
    offset = (page - 1) * limit
    cols = (
        "id, url, title, excerpt, author, site_name, published_date, "
        "lead_image_url, word_count, is_read, is_archived, is_bookmarked, created_at"
    )
    rows = db.execute(
        f"SELECT {cols} FROM articles WHERE {where} ORDER BY created_at DESC LIMIT ? OFFSET ?",
        (limit, offset),
    ).fetchall()

    return {
        "articles": [dict(r) for r in rows],
        "total": total,
        "page": page,
        "pages": -(-total // limit),
    }


# ---------- articles ----------

@app.get("/api/articles/{article_id}")
def get_article(
    article_id: int,
    x_api_key: str | None = Header(None),
    authorization: str | None = Header(None),
):
    verify(x_api_key, authorization)
    db = get_db()
    row = db.execute("SELECT * FROM articles WHERE id = ?", (article_id,)).fetchone()
    if not row:
        raise HTTPException(404, "Not found")

    article = dict(row)
    segments = segment_html(article["content"]) if article.get("content") else []
    tapped = db.execute(
        "SELECT paragraph_index FROM interests WHERE article_id = ?", (article_id,)
    ).fetchall()

    return {**article, "segments": segments, "tappedParagraphs": list({r["paragraph_index"] for r in tapped})}


@app.patch("/api/articles/{article_id}")
async def patch_article(
    article_id: int,
    request: Request,
    x_api_key: str | None = Header(None),
    authorization: str | None = Header(None),
):
    verify(x_api_key, authorization)
    body = await request.json()
    db = get_db()

    updates, values = [], []
    for field in ("is_read", "is_archived", "is_bookmarked"):
        if field in body:
            updates.append(f"{field} = ?")
            values.append(1 if body[field] else 0)
    if not updates:
        raise HTTPException(400, "Nothing to update")

    values.append(article_id)
    db.execute(f"UPDATE articles SET {', '.join(updates)} WHERE id = ?", values)
    db.commit()
    return {"ok": True}


@app.delete("/api/articles/{article_id}")
def delete_article(
    article_id: int,
    x_api_key: str | None = Header(None),
    authorization: str | None = Header(None),
):
    verify(x_api_key, authorization)
    db = get_db()
    db.execute("DELETE FROM articles WHERE id = ?", (article_id,))
    db.commit()
    return {"ok": True}


# ---------- interests ----------

@app.post("/api/interests")
async def create_interest(
    request: Request,
    x_api_key: str | None = Header(None),
    authorization: str | None = Header(None),
):
    verify(x_api_key, authorization)
    body = await request.json()
    text = body.get("paragraphText", "")
    article_id = body.get("articleId")
    if not text or article_id is None:
        raise HTTPException(400, "articleId and paragraphText required")

    keywords = extract_keywords(text)
    db = get_db()
    db.execute(
        "INSERT INTO interests (article_id, paragraph_index, paragraph_text, keywords) VALUES (?, ?, ?, ?)",
        (article_id, body.get("paragraphIndex", 0), text, json.dumps(keywords)),
    )
    db.commit()
    return {"ok": True, "keywords": keywords}


@app.get("/api/interests")
def list_interests(
    x_api_key: str | None = Header(None),
    authorization: str | None = Header(None),
):
    verify(x_api_key, authorization)
    db = get_db()
    rows = db.execute("SELECT * FROM interests ORDER BY created_at DESC LIMIT 50").fetchall()
    return {"interests": [dict(r) for r in rows]}
