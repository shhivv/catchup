"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";

interface Article {
  id: number;
  url: string;
  title: string;
  excerpt: string;
  author: string;
  site_name: string;
  lead_image_url: string;
  word_count: number;
  source_type: "article" | "tweet";
  is_read: number;
  capture_method: string;
  created_at: string;
  text_content: string;
}

type Filter = "unread" | "read" | "all";

function timeAgo(dateStr: string): string {
  const date = new Date(dateStr + "Z");
  const now = new Date();
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 4) return `${weeks}w ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function readingTime(wordCount: number): string {
  const minutes = Math.max(1, Math.round(wordCount / 238));
  return `${minutes} min read`;
}

function CaptureTag({ method }: { method: string }) {
  const labels: Record<string, string> = {
    auto: "unfinished",
    manual: "saved",
    bookmark: "bookmarked",
  };
  return (
    <span className="text-[11px] font-mono tracking-wide uppercase text-text-tertiary">
      {labels[method] || method}
    </span>
  );
}

function ArticleCard({
  article,
  isHero,
  onClick,
  onArchive,
}: {
  article: Article;
  isHero?: boolean;
  onClick: () => void;
  onArchive: () => void;
}) {
  if (article.source_type === "tweet") {
    return <TweetCard article={article} onClick={onClick} onArchive={onArchive} />;
  }

  if (isHero && article.lead_image_url) {
    return (
      <div className="group relative rounded-xl overflow-hidden bg-bg-raised border border-border-subtle hover:border-border transition-all duration-300">
        <button onClick={onClick} className="w-full text-left">
          <div className="aspect-[2/1] sm:aspect-[2.5/1] overflow-hidden">
            <img
              src={article.lead_image_url}
              alt=""
              className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-500"
            />
          </div>
          <div className="p-5 sm:p-7">
            <div className="flex items-center gap-3 mb-3 flex-wrap">
              {article.site_name && (
                <span className="text-xs font-mono tracking-wide text-text-tertiary uppercase">
                  {article.site_name}
                </span>
              )}
              <span className="text-text-tertiary">·</span>
              <span className="text-xs font-mono text-text-tertiary">
                {timeAgo(article.created_at)}
              </span>
              <CaptureTag method={article.capture_method} />
            </div>
            <h2 className="font-serif text-2xl sm:text-3xl leading-tight mb-3 group-hover:text-accent transition-colors duration-200">
              {article.title}
            </h2>
            {article.excerpt && (
              <p className="text-text-secondary text-sm sm:text-base leading-relaxed line-clamp-2">
                {article.excerpt}
              </p>
            )}
            <div className="flex items-center gap-3 mt-4 text-xs text-text-tertiary font-mono">
              {article.author && <span>{article.author}</span>}
              {article.word_count > 0 && (
                <span>{readingTime(article.word_count)}</span>
              )}
            </div>
          </div>
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onArchive(); }}
          className="absolute top-3 right-3 p-2 rounded-lg bg-bg/60 backdrop-blur-sm
            text-text-tertiary hover:text-text opacity-0 group-hover:opacity-100 transition-all"
          title="Archive"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="m20.25 7.5-.625 10.632a2.25 2.25 0 0 1-2.247 2.118H6.622a2.25 2.25 0 0 1-2.247-2.118L3.75 7.5m8.25 3v6.75m0 0-3-3m3 3 3-3M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125Z" />
          </svg>
        </button>
      </div>
    );
  }

  return (
    <div className="group relative rounded-xl bg-bg-raised border border-border-subtle hover:border-border transition-all duration-300 overflow-hidden">
      <button onClick={onClick} className="w-full text-left flex">
        <div className="flex-1 p-4 sm:p-5">
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            {article.site_name && (
              <span className="text-[11px] font-mono tracking-wide text-text-tertiary uppercase">
                {article.site_name}
              </span>
            )}
            <span className="text-text-tertiary text-xs">·</span>
            <span className="text-[11px] font-mono text-text-tertiary">
              {timeAgo(article.created_at)}
            </span>
            <CaptureTag method={article.capture_method} />
          </div>
          <h3 className="font-serif text-lg sm:text-xl leading-snug mb-2 group-hover:text-accent transition-colors duration-200">
            {article.title}
          </h3>
          {article.excerpt && (
            <p className="text-text-secondary text-sm leading-relaxed line-clamp-2 hidden sm:block">
              {article.excerpt}
            </p>
          )}
          <div className="flex items-center gap-3 mt-3 text-[11px] text-text-tertiary font-mono">
            {article.author && <span>{article.author}</span>}
            {article.word_count > 0 && (
              <span>{readingTime(article.word_count)}</span>
            )}
          </div>
        </div>
        {article.lead_image_url && (
          <div className="w-28 sm:w-36 shrink-0">
            <img
              src={article.lead_image_url}
              alt=""
              className="w-full h-full object-cover"
            />
          </div>
        )}
      </button>
      <button
        onClick={(e) => { e.stopPropagation(); onArchive(); }}
        className="absolute top-3 right-3 p-2 rounded-lg bg-bg/60 backdrop-blur-sm
          text-text-tertiary hover:text-text opacity-0 group-hover:opacity-100 transition-all
          sm:right-[calc(9rem+12px)]"
        title="Archive"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="m20.25 7.5-.625 10.632a2.25 2.25 0 0 1-2.247 2.118H6.622a2.25 2.25 0 0 1-2.247-2.118L3.75 7.5m8.25 3v6.75m0 0-3-3m3 3 3-3M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125Z" />
        </svg>
      </button>
    </div>
  );
}

function TweetCard({
  article,
  onClick,
  onArchive,
}: {
  article: Article;
  onClick: () => void;
  onArchive: () => void;
}) {
  return (
    <div className="group relative rounded-xl bg-bg-raised border border-border-subtle hover:border-border transition-all duration-300 p-4 sm:p-5">
      <button onClick={onClick} className="w-full text-left">
        <div className="flex items-center gap-2 mb-3">
          <svg className="w-4 h-4 text-text-tertiary" viewBox="0 0 24 24" fill="currentColor">
            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
          </svg>
          <span className="text-[11px] font-mono tracking-wide text-text-tertiary uppercase">
            {article.author || article.site_name || "tweet"}
          </span>
          <span className="text-text-tertiary text-xs">·</span>
          <span className="text-[11px] font-mono text-text-tertiary">
            {timeAgo(article.created_at)}
          </span>
          <CaptureTag method={article.capture_method} />
        </div>
        <p className="font-serif text-base sm:text-lg leading-relaxed text-text">
          {article.text_content || article.excerpt || article.title}
        </p>
        {article.lead_image_url && (
          <div className="mt-3 rounded-lg overflow-hidden">
            <img
              src={article.lead_image_url}
              alt=""
              className="w-full h-auto max-h-64 object-cover"
            />
          </div>
        )}
      </button>
      <button
        onClick={(e) => { e.stopPropagation(); onArchive(); }}
        className="absolute top-3 right-3 p-2 rounded-lg bg-bg/60 backdrop-blur-sm
          text-text-tertiary hover:text-text opacity-0 group-hover:opacity-100 transition-all"
        title="Archive"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="m20.25 7.5-.625 10.632a2.25 2.25 0 0 1-2.247 2.118H6.622a2.25 2.25 0 0 1-2.247-2.118L3.75 7.5m8.25 3v6.75m0 0-3-3m3 3 3-3M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125Z" />
        </svg>
      </button>
    </div>
  );
}

export default function FeedPage() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("unread");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const router = useRouter();

  const fetchArticles = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/feed?filter=${filter}&page=${page}&limit=20`);
    if (res.status === 401) {
      router.push("/login");
      return;
    }
    const data = await res.json();
    setArticles(data.articles);
    setTotalPages(data.pages);
    setLoading(false);
  }, [filter, page, router]);

  useEffect(() => {
    fetchArticles();
  }, [fetchArticles]);

  async function archiveArticle(id: number) {
    await fetch(`/api/articles/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_archived: true }),
    });
    setArticles((prev) => prev.filter((a) => a.id !== id));
  }

  const filters: { key: Filter; label: string }[] = [
    { key: "unread", label: "unread" },
    { key: "read", label: "read" },
    { key: "all", label: "all" },
  ];

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-50 bg-bg/80 backdrop-blur-xl border-b border-border-subtle">
        <div className="max-w-2xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between h-14">
            <h1 className="font-serif text-xl tracking-tight">catchup</h1>
            <div className="flex items-center gap-1">
              {filters.map((f) => (
                <button
                  key={f.key}
                  onClick={() => { setFilter(f.key); setPage(1); }}
                  className={`px-3 py-1.5 text-xs font-mono rounded-md transition-colors ${
                    filter === f.key
                      ? "text-text bg-bg-active"
                      : "text-text-tertiary hover:text-text-secondary"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        {loading ? (
          <div className="flex justify-center py-20">
            <div className="w-5 h-5 border-2 border-border border-t-accent rounded-full animate-spin" />
          </div>
        ) : articles.length === 0 ? (
          <div className="text-center py-20">
            <p className="font-serif text-xl text-text-secondary mb-2">
              nothing here yet
            </p>
            <p className="text-sm text-text-tertiary">
              articles you don&apos;t finish reading will appear here
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {articles.map((article, i) => (
              <ArticleCard
                key={article.id}
                article={article}
                isHero={i === 0 && page === 1}
                onClick={() => router.push(`/read/${article.id}`)}
                onArchive={() => archiveArticle(article.id)}
              />
            ))}
          </div>
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-4 mt-8 mb-4">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="text-xs font-mono text-text-tertiary hover:text-text disabled:opacity-30 transition-colors"
            >
              prev
            </button>
            <span className="text-xs font-mono text-text-tertiary">
              {page} / {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="text-xs font-mono text-text-tertiary hover:text-text disabled:opacity-30 transition-colors"
            >
              next
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
