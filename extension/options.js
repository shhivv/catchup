document.addEventListener("DOMContentLoaded", async () => {
  const serverUrlInput = document.getElementById("serverUrl");
  const apiKeyInput = document.getElementById("apiKey");
  const saveBtn = document.getElementById("saveBtn");
  const statusEl = document.getElementById("status");

  const { serverUrl, apiKey } = await chrome.storage.sync.get([
    "serverUrl",
    "apiKey",
  ]);
  if (serverUrl) serverUrlInput.value = serverUrl;
  if (apiKey) apiKeyInput.value = apiKey;

  saveBtn.addEventListener("click", async () => {
    const url = serverUrlInput.value.trim().replace(/\/$/, "");
    const key = apiKeyInput.value.trim();

    if (!url) {
      statusEl.textContent = "server url is required";
      statusEl.className = "status error";
      return;
    }

    await chrome.storage.sync.set({
      serverUrl: url,
      apiKey: key,
    });

    statusEl.textContent = "saved";
    statusEl.className = "status success";
    setTimeout(() => {
      statusEl.textContent = "";
    }, 2000);
  });
});
