(function () {
  if (window.__catchupTwitterLoaded) return;
  window.__catchupTwitterLoaded = true;

  function findTweetFromBookmarkButton(button) {
    let el = button;
    while (el && el !== document.body) {
      if (el.getAttribute("data-testid") === "tweet") return el;
      if (el.tagName === "ARTICLE") return el;
      el = el.parentElement;
    }
    return null;
  }

  function extractTweetData(tweetEl) {
    const textEl = tweetEl.querySelector('[data-testid="tweetText"]');
    const text = textEl ? textEl.innerText : "";

    const nameEl = tweetEl.querySelector(
      '[data-testid="User-Name"] a[role="link"]'
    );
    let author = "";
    let handle = "";
    if (nameEl) {
      const spans = nameEl.querySelectorAll("span");
      if (spans.length > 0) author = spans[0].textContent || "";
      const href = nameEl.getAttribute("href");
      if (href) handle = href.replace("/", "@");
    }

    const handleEl = tweetEl.querySelector(
      '[data-testid="User-Name"] a[tabindex="-1"]'
    );
    if (handleEl && !handle) {
      handle = handleEl.textContent || "";
    }

    const images = [];
    const imgEls = tweetEl.querySelectorAll(
      '[data-testid="tweetPhoto"] img'
    );
    for (const img of imgEls) {
      if (img.src && !img.src.includes("emoji")) {
        images.push(img.src);
      }
    }

    const timeEl = tweetEl.querySelector("time");
    const publishedDate = timeEl ? timeEl.getAttribute("datetime") : "";

    const linkEls = tweetEl.querySelectorAll("a[href*='/status/']");
    let tweetUrl = window.location.href;
    for (const link of linkEls) {
      const href = link.getAttribute("href");
      if (href && href.match(/\/status\/\d+$/)) {
        tweetUrl = "https://x.com" + href;
        break;
      }
    }

    return {
      url: tweetUrl,
      title: text.slice(0, 100) + (text.length > 100 ? "..." : ""),
      content: text,
      textContent: text,
      excerpt: text.slice(0, 280),
      author: author || handle,
      siteName: "X",
      publishedDate,
      leadImageUrl: images[0] || "",
      wordCount: text.split(/\s+/).filter(Boolean).length,
      sourceType: "tweet",
    };
  }

  document.addEventListener(
    "click",
    (e) => {
      const bookmarkButton = e.target.closest(
        '[data-testid="bookmark"], [data-testid="removeBookmark"]'
      );
      if (!bookmarkButton) return;

      const isBookmarking =
        bookmarkButton.getAttribute("data-testid") === "bookmark";
      if (!isBookmarking) return;

      const tweetEl = findTweetFromBookmarkButton(bookmarkButton);
      if (!tweetEl) return;

      const tweetData = extractTweetData(tweetEl);
      if (tweetData.textContent) {
        chrome.runtime.sendMessage({
          type: "SAVE_TWEET",
          data: tweetData,
        });
        console.log("[Catchup] Bookmarked tweet captured:", tweetData.title);
      }
    },
    true
  );
})();
