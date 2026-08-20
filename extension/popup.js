document.addEventListener("DOMContentLoaded", async () => {
  const saveBtn = document.getElementById("saveBtn");
  const statusEl = document.getElementById("status");
  const dotEl = document.getElementById("connectionDot");
  const optionsLink = document.getElementById("optionsLink");

  const { serverUrl, apiKey } = await chrome.storage.sync.get([
    "serverUrl",
    "apiKey",
  ]);

  if (serverUrl && apiKey) {
    dotEl.classList.add("connected");
  }

  optionsLink.addEventListener("click", (e) => {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
  });

  saveBtn.addEventListener("click", async () => {
    if (!serverUrl || !apiKey) {
      showStatus("configure server in settings first", "error");
      return;
    }

    saveBtn.classList.add("saving");
    saveBtn.textContent = "saving...";

    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });

    if (!tab?.id) {
      showStatus("no active tab", "error");
      saveBtn.classList.remove("saving");
      saveBtn.textContent = "Save this article";
      return;
    }

    chrome.tabs.sendMessage(
      tab.id,
      { type: "EXTRACT_ARTICLE" },
      async (response) => {
        if (chrome.runtime.lastError || !response?.data) {
          showStatus("couldn't extract article from this page", "error");
          saveBtn.classList.remove("saving");
          saveBtn.textContent = "Save this article";
          return;
        }

        chrome.runtime.sendMessage(
          {
            type: "SAVE_ARTICLE",
            data: { ...response.data, captureMethod: "manual" },
          },
          (result) => {
            saveBtn.classList.remove("saving");
            if (result?.ok) {
              if (result.existing) {
                showStatus("already saved", "info");
              } else {
                showStatus("saved", "success");
              }
              saveBtn.textContent = "Saved";
            } else {
              showStatus(result?.error || "save failed", "error");
              saveBtn.textContent = "Save this article";
            }
          }
        );
      }
    );
  });

  function showStatus(text, type) {
    statusEl.textContent = text;
    statusEl.className = `status ${type}`;
    statusEl.style.display = "block";
    setTimeout(() => {
      statusEl.style.display = "none";
    }, 3000);
  }
});
