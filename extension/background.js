const TAB_TRACKING = {};

const MIN_TIME_THRESHOLD = 30;
const MIN_SCROLL_THRESHOLD = 0.2;
const EXCLUDED_DOMAINS = [
  "google.com",
  "youtube.com",
  "github.com",
  "localhost",
  "chrome-extension",
  "chrome:",
  "about:",
  "mail.google.com",
  "calendar.google.com",
  "docs.google.com",
  "drive.google.com",
  "slack.com",
  "discord.com",
  "figma.com",
  "notion.so",
  "linear.app",
];

function isTrackablePage(url) {
  if (!url || !url.startsWith("http")) return false;
  try {
    const hostname = new URL(url).hostname;
    return !EXCLUDED_DOMAINS.some(
      (d) => hostname === d || hostname.endsWith("." + d)
    );
  } catch {
    return false;
  }
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete" && tab.url && isTrackablePage(tab.url)) {
    TAB_TRACKING[tabId] = {
      url: tab.url,
      title: tab.title || "",
      openedAt: Date.now(),
      scrollDepth: 0,
      isArticle: false,
      articleData: null,
    };
  }
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  const tracked = TAB_TRACKING[tabId];
  if (!tracked) return;
  delete TAB_TRACKING[tabId];

  if (!tracked.isArticle || !tracked.articleData) return;

  const timeSpent = (Date.now() - tracked.openedAt) / 1000;
  const didNotFinish =
    timeSpent < MIN_TIME_THRESHOLD || tracked.scrollDepth < MIN_SCROLL_THRESHOLD;

  if (!didNotFinish) return;

  await saveArticle({
    ...tracked.articleData,
    scrollDepth: tracked.scrollDepth,
    timeSpent: Math.round(timeSpent),
    captureMethod: "auto",
  });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "ARTICLE_DATA" && sender.tab?.id) {
    const tabId = sender.tab.id;
    if (TAB_TRACKING[tabId]) {
      TAB_TRACKING[tabId].isArticle = true;
      TAB_TRACKING[tabId].articleData = message.data;
    }
    sendResponse({ ok: true });
  }

  if (message.type === "SCROLL_UPDATE" && sender.tab?.id) {
    const tabId = sender.tab.id;
    if (TAB_TRACKING[tabId]) {
      TAB_TRACKING[tabId].scrollDepth = Math.max(
        TAB_TRACKING[tabId].scrollDepth,
        message.depth
      );
    }
    sendResponse({ ok: true });
  }

  if (message.type === "SAVE_ARTICLE") {
    saveArticle(message.data).then((result) => sendResponse(result));
    return true;
  }

  if (message.type === "SAVE_TWEET") {
    saveArticle({ ...message.data, sourceType: "tweet", captureMethod: "bookmark" }).then(
      (result) => sendResponse(result)
    );
    return true;
  }

  if (message.type === "MANUAL_SAVE") {
    if (sender.tab?.id) {
      chrome.tabs.sendMessage(sender.tab.id, { type: "EXTRACT_ARTICLE" }, async (response) => {
        if (response?.data) {
          const result = await saveArticle({
            ...response.data,
            captureMethod: "manual",
          });
          sendResponse(result);
        } else {
          sendResponse({ ok: false, error: "Could not extract article" });
        }
      });
    }
    return true;
  }
});

async function saveArticle(data) {
  try {
    const { serverUrl, apiKey } = await chrome.storage.sync.get([
      "serverUrl",
      "apiKey",
    ]);

    if (!serverUrl || !apiKey) {
      console.log("[Catchup] Not configured — open extension options");
      return { ok: false, error: "Not configured" };
    }

    const response = await fetch(`${serverUrl}/api/save`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
      },
      body: JSON.stringify(data),
    });

    const result = await response.json();
    if (result.ok) {
      console.log("[Catchup] Saved:", data.title);
    }
    return result;
  } catch (err) {
    console.error("[Catchup] Save failed:", err);
    return { ok: false, error: err.message };
  }
}
