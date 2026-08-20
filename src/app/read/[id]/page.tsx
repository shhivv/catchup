"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter, useParams } from "next/navigation";

interface Article {
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
  created_at: string;
}

interface FeedItem {
  id: number;
  title: string;
  site_name: string;
  source_type: string;
}

function readingTime(wordCount: number): string {
  const minutes = Math.max(1, Math.round(wordCount / 238));
  return `${minutes} min`;
}

function formatDate(dateStr: string): string {
  if (!dateStr) return "";
  try {
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return "";
  }
}

export default function ReaderPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [article, setArticle] = useState<Article | null>(null);
  const [loading, setLoading] = useState(true);
  const [feedIds, setFeedIds] = useState<FeedItem[]>([]);
  const [readProgress, setReadProgress] = useState(0);
  const contentRef = useRef<HTMLDivElement>(null);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const [articleRes, feedRes] = await Promise.all([
        fetch(`/api/articles/${id}`),
        fetch("/api/feed?filter=unread&limit=100"),
      ]);

      if (articleRes.status === 401) {
        router.push("/login");
        return;
      }

      if (articleRes.ok) {
        const data = await articleRes.json();
        setArticle(data);

        if (!data.is_read) {
          fetch(`/api/articles/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ is_read: true }),
          });
        }
      }

      if (feedRes.ok) {
        const feedData = await feedRes.json();
        setFeedIds(feedData.articles.map((a: Article) => ({
          id: a.id,
          title: a.title,
          site_name: a.site_name,
          source_type: a.source_type,
        })));
      }

      setLoading(false);
    }
    load();
  }, [id, router]);

  const currentIndex = feedIds.findIndex((item) => item.id === parseInt(id));
  const prevArticle = currentIndex > 0 ? feedIds[currentIndex - 1] : null;
  const nextArticle = currentIndex < feedIds.length - 1 ? feedIds[currentIndex + 1] : null;

  const navigateToArticle = useCallback(
    (targetId: number) => {
      router.push(`/read/${targetId}`);
    },
    [router]
  );

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "ArrowLeft" && prevArticle) {
        navigateToArticle(prevArticle.id);
      } else if (e.key === "ArrowRight" && nextArticle) {
        navigateToArticle(nextArticle.id);
      } else if (e.key === "Escape") {
        router.push("/");
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [prevArticle, nextArticle, navigateToArticle, router]);

  useEffect(() => {
    function handleScroll() {
      if (!contentRef.current) return;
      const { scrollTop, scrollHeight, clientHeight } = document.documentElement;
      const progress = Math.min(1, scrollTop / (scrollHeight - clientHeight));
      setReadProgress(progress);
    }
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  function handleTouchStart(e: React.TouchEvent) {
    touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  }

  function handleTouchEnd(e: React.TouchEvent) {
    if (!touchStartRef.current) return;
    const dx = e.changedTouches[0].clientX - touchStartRef.current.x;
    const dy = e.changedTouches[0].clientY - touchStartRef.current.y;
    touchStartRef.current = null;

    if (Math.abs(dx) > 80 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      if (dx > 0 && prevArticle) {
        navigateToArticle(prevArticle.id);
      } else if (dx < 0 && nextArticle) {
        navigateToArticle(nextArticle.id);
      }
    }
  }

  if (loading) {
    return (
      <div className="min-h-dvh flex items-center justify-center">
        <div className="w-5 h-5 border-2 border-border border-t-accent rounded-full animate-spin" />
      </div>
    );
  }

  if (!article) {
    return (
      <div className="min-h-dvh flex items-center justify-center">
        <p className="text-text-secondary font-serif text-lg">article not found</p>
      </div>
    );
  }

  const isTweet = article.source_type === "tweet";

  return (
    <div
      className="min-h-dvh"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Reading progress bar */}
      <div className="fixed top-0 left-0 right-0 z-50 h-[2px] bg-border-subtle">
        <div
          className="h-full bg-accent transition-[width] duration-150"
          style={{ width: `${readProgress * 100}%` }}
        />
      </div>

      {/* Top bar */}
      <header className="sticky top-0 z-40 bg-bg/80 backdrop-blur-xl">
        <div className="max-w-2xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between h-12">
            <button
              onClick={() => router.push("/")}
              className="flex items-center gap-2 text-text-tertiary hover:text-text transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
              </svg>
              <span className="text-xs font-mono">feed</span>
            </button>

            <div className="flex items-center gap-1">
              {prevArticle && (
                <button
                  onClick={() => navigateToArticle(prevArticle.id)}
                  className="p-2 text-text-tertiary hover:text-text transition-colors"
                  title={prevArticle.title}
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
                  </svg>
                </button>
              )}
              {feedIds.length > 0 && (
                <span className="text-[10px] font-mono text-text-tertiary px-1">
                  {currentIndex + 1}/{feedIds.length}
                </span>
              )}
              {nextArticle && (
                <button
                  onClick={() => navigateToArticle(nextArticle.id)}
                  className="p-2 text-text-tertiary hover:text-text transition-colors"
                  title={nextArticle.title}
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
                  </svg>
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      <article className="max-w-2xl mx-auto px-4 sm:px-6 pt-8 pb-20" ref={contentRef}>
        {/* Article header */}
        <header className="mb-8 sm:mb-12">
          <div className="flex items-center gap-3 mb-4 flex-wrap">
            {article.site_name && (
              <span className="text-xs font-mono tracking-wide text-accent uppercase">
                {article.site_name}
              </span>
            )}
            {article.published_date && (
              <>
                <span className="text-text-tertiary">·</span>
                <span className="text-xs font-mono text-text-tertiary">
                  {formatDate(article.published_date)}
                </span>
              </>
            )}
          </div>

          <h1 className="font-serif text-3xl sm:text-4xl lg:text-[2.75rem] leading-[1.15] tracking-tight mb-4">
            {article.title}
          </h1>

          {article.excerpt && !isTweet && (
            <p className="font-serif text-lg sm:text-xl text-text-secondary leading-relaxed mb-6">
              {article.excerpt}
            </p>
          )}

          <div className="flex items-center gap-4 text-xs font-mono text-text-tertiary">
            {article.author && <span>{article.author}</span>}
            {article.word_count > 0 && <span>{readingTime(article.word_count)}</span>}
          </div>
        </header>

        {/* Lead image */}
        {article.lead_image_url && !isTweet && (
          <div className="mb-10 -mx-4 sm:mx-0 sm:rounded-xl overflow-hidden">
            <img
              src={article.lead_image_url}
              alt=""
              className="w-full h-auto"
            />
          </div>
        )}

        {/* Tweet display */}
        {isTweet ? (
          <div className="border border-border rounded-xl p-6 sm:p-8">
            <div className="flex items-center gap-3 mb-4">
              <svg className="w-5 h-5 text-text-tertiary" viewBox="0 0 24 24" fill="currentColor">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
              </svg>
              <span className="font-mono text-sm text-text-secondary">
                {article.author || "tweet"}
              </span>
            </div>
            <div className="font-serif text-xl sm:text-2xl leading-relaxed">
              {article.text_content || article.content}
            </div>
            {article.lead_image_url && (
              <div className="mt-6 rounded-lg overflow-hidden">
                <img src={article.lead_image_url} alt="" className="w-full h-auto" />
              </div>
            )}
          </div>
        ) : (
          /* Article content */
          <div
            className="article-content"
            dangerouslySetInnerHTML={{ __html: article.content }}
          />
        )}

        {/* Next article teaser */}
        {nextArticle && (
          <div className="mt-16 pt-8 border-t border-border-subtle">
            <span className="text-[11px] font-mono text-text-tertiary uppercase tracking-wider">
              up next
            </span>
            <button
              onClick={() => navigateToArticle(nextArticle.id)}
              className="block w-full text-left mt-3 group"
            >
              <h3 className="font-serif text-xl sm:text-2xl group-hover:text-accent transition-colors">
                {nextArticle.title}
              </h3>
              {nextArticle.site_name && (
                <span className="text-xs font-mono text-text-tertiary mt-2 block">
                  {nextArticle.site_name}
                </span>
              )}
            </button>
          </div>
        )}
      </article>
    </div>
  );
}
