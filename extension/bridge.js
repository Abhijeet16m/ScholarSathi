(() => {
  // Permit the local development server and the production Vercel site.
  const isLocal = window.location.protocol === "http:" &&
    ["localhost", "127.0.0.1"].includes(window.location.hostname) &&
    window.location.port === "3000";
  const isProduction = window.location.protocol === "https:" &&
    window.location.hostname === "scholar-sathi-seven.vercel.app";
  if (!isLocal && !isProduction) return;

  const PAGE_SOURCE = "scholarsathi-page";
  const EXT_SOURCE = "scholarsathi-extension";

  window.addEventListener("message", event => {
    if (event.source !== window || event.origin !== window.location.origin) return;
    const message = event.data;
    if (!message || message.source !== PAGE_SOURCE || typeof message.requestId !== "string") return;

    chrome.runtime.sendMessage({
      source: PAGE_SOURCE,
      action: message.action,
      payload: message.payload || {}
    }).then(
      result => window.postMessage({ source: EXT_SOURCE, requestId: message.requestId, result }, window.location.origin),
      error => window.postMessage({ source: EXT_SOURCE, requestId: message.requestId, error: error.message }, window.location.origin)
    );
  });
})();
