(function () {
  if (window.__catchupContentLoaded) return;
  window.__catchupContentLoaded = true;

  const MIN_WORD_COUNT = 200;
  const MIN_PARAGRAPH_COUNT = 3;

  function isArticlePage() {
    const path = window.location.pathname;
    if (path === "/" || path === "" || path === "/index.html") return false;

    if (/^\/(search|login|signup|register|cart|checkout|account|settings|auth|oauth)/i.test(path)) return false;

    const articleEl = document.querySelector("article");
    const contentEl =
      document.querySelector(".post-content, .article-content, .entry-content, .post-body") ||
      document.querySelector('[itemprop="articleBody"]');

    const target = contentEl || articleEl;
    if (!target) {
      const paragraphs = document.querySelectorAll("p");
      if (paragraphs.length < MIN_PARAGRAPH_COUNT) return false;
      let wordCount = 0;
      for (const p of paragraphs) {
        wordCount += (p.textContent || "").split(/\s+/).filter(Boolean).length;
        if (wordCount >= MIN_WORD_COUNT) return true;
      }
      return false;
    }

    const text = target.textContent || "";
    const words = text.split(/\s+/).filter(Boolean).length;
    if (words < MIN_WORD_COUNT) return false;

    const paragraphs = target.querySelectorAll("p");
    if (paragraphs.length < MIN_PARAGRAPH_COUNT) return false;

    return true;
  }

  function extractArticle() {
    try {
      const clone = document.cloneNode(true);
      const reader = new Readability(clone);
      const parsed = reader.parse();

      if (!parsed) return null;

      const meta = extractMeta();
      return {
        url: window.location.href,
        title: parsed.title || document.title,
        content: parsed.content || "",
        textContent: parsed.textContent || "",
        excerpt: parsed.excerpt || meta.description || "",
        author: parsed.byline || meta.author || "",
        siteName: parsed.siteName || meta.siteName || "",
        publishedDate: meta.publishedDate || "",
        leadImageUrl: meta.image || "",
        wordCount: (parsed.textContent || "").split(/\s+/).filter(Boolean).length,
        sourceType: "article",
      };
    } catch (err) {
      console.error("[Catchup] Extract failed:", err);
      return null;
    }
  }

  function extractMeta() {
    function getMeta(selectors) {
      for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (el) {
          const content = el.getAttribute("content") || el.getAttribute("value");
          if (content) return content;
        }
      }
      return "";
    }

    return {
      description: getMeta([
        'meta[property="og:description"]',
        'meta[name="description"]',
        'meta[name="twitter:description"]',
      ]),
      author: getMeta([
        'meta[name="author"]',
        'meta[property="article:author"]',
        'meta[name="twitter:creator"]',
      ]),
      siteName: getMeta([
        'meta[property="og:site_name"]',
        'meta[name="application-name"]',
      ]),
      image: getMeta([
        'meta[property="og:image"]',
        'meta[name="twitter:image"]',
        'meta[name="twitter:image:src"]',
      ]),
      publishedDate: getMeta([
        'meta[property="article:published_time"]',
        'meta[name="date"]',
        'meta[name="publish-date"]',
        'time[datetime]',
      ]),
    };
  }

  let scrollReportTimer = null;
  function reportScrollDepth() {
    const scrollTop = window.scrollY;
    const docHeight = document.documentElement.scrollHeight - window.innerHeight;
    if (docHeight <= 0) return;
    const depth = Math.min(1, scrollTop / docHeight);
    chrome.runtime.sendMessage({ type: "SCROLL_UPDATE", depth });
  }

  window.addEventListener(
    "scroll",
    () => {
      if (scrollReportTimer) clearTimeout(scrollReportTimer);
      scrollReportTimer = setTimeout(reportScrollDepth, 500);
    },
    { passive: true }
  );

  setTimeout(() => {
    if (!isArticlePage()) return;

    const data = extractArticle();
    if (data) {
      chrome.runtime.sendMessage({ type: "ARTICLE_DATA", data });
    }
  }, 2000);

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === "EXTRACT_ARTICLE") {
      const data = extractArticle();
      sendResponse({ data });
    }
  });
})();
