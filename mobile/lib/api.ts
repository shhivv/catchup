const SERVER_URL = "https://catchup.shivshanmugam.com";
const API_KEY = "8c723846e9d7ded08fa69366f01862c1";

export async function isConfigured(): Promise<boolean> {
  return true;
}

async function apiFetch(path: string, options: RequestInit = {}) {
  const res = await fetch(`${SERVER_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "x-api-key": API_KEY,
      ...options.headers,
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `API error: ${res.status}`);
  }

  return res.json();
}

export interface Article {
  id: number;
  url: string;
  title: string;
  content: string;
  text_content: string;
  excerpt: string;
  author: string;
  site_name: string;
  published_date: string;
  lead_image_url: string;
  word_count: number;
  is_read: number;
  is_archived: number;
  created_at: string;
}

export async function getFeed(
  filter: "unread" | "read" | "all" = "unread",
  page = 1,
  limit = 20
) {
  return apiFetch(`/api/feed?filter=${filter}&page=${page}&limit=${limit}`);
}

export async function getArticle(id: number) {
  return apiFetch(`/api/articles/${id}`);
}

export async function markRead(id: number) {
  return apiFetch(`/api/articles/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ is_read: true }),
  });
}

export async function archiveArticle(id: number) {
  return apiFetch(`/api/articles/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ is_archived: true }),
  });
}

export async function recordInterest(
  articleId: number,
  paragraphIndex: number,
  paragraphText: string
) {
  return apiFetch("/api/interests", {
    method: "POST",
    body: JSON.stringify({ articleId, paragraphIndex, paragraphText }),
  });
}

export interface Segment {
  html: string;
  text: string;
  index: number;
}
