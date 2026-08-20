const DEFAULT_SERVER_URL = "https://catchup.shivshanmugam.com";
const DEFAULT_API_KEY = "8c723846e9d7ded08fa69366f01862c1";

export async function getConfig() {
  return { serverUrl: DEFAULT_SERVER_URL, apiKey: DEFAULT_API_KEY };
}

export async function saveConfig(_serverUrl: string, _apiKey: string) {
  // hardcoded for now
}

export async function isConfigured(): Promise<boolean> {
  return true;
}

async function apiFetch(path: string, options: RequestInit = {}) {
  const { serverUrl, apiKey } = await getConfig();
  if (!serverUrl || !apiKey) throw new Error("Not configured");

  const res = await fetch(`${serverUrl}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
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
  source_type: "article" | "tweet";
  is_read: number;
  is_archived: number;
  capture_method: string;
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

export async function addArticle(url: string) {
  return apiFetch("/api/add", {
    method: "POST",
    body: JSON.stringify({ url }),
  });
}

export async function getSuggestions(limit = 10) {
  return apiFetch(`/api/suggestions?limit=${limit}`);
}

export async function discoverFeeds() {
  return apiFetch("/api/discover", { method: "POST" });
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
