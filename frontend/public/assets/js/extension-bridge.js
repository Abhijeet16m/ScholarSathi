(() => {
  const PAGE_SOURCE = "scholarsathi-page";
  const EXT_SOURCE = "scholarsathi-extension";

  function request(action, payload = {}, timeoutMs = 10000) {
    return new Promise((resolve, reject) => {
      const requestId = crypto.randomUUID();
      const timeout = window.setTimeout(() => {
        window.removeEventListener("message", onMessage);
        reject(new Error("Scholar Assist extension is not responding. Check that it is installed and enabled for this localhost page."));
      }, timeoutMs);

      function onMessage(event) {
        if (event.source !== window || event.origin !== window.location.origin) return;
        const message = event.data;
        if (message?.source !== EXT_SOURCE || message.requestId !== requestId) return;
        window.clearTimeout(timeout);
        window.removeEventListener("message", onMessage);
        if (message.error || !message.result?.ok) reject(new Error(message.error || message.result?.error || "The extension request failed."));
        else resolve(message.result);
      }

      window.addEventListener("message", onMessage);
      window.postMessage({ source: PAGE_SOURCE, requestId, action, payload }, window.location.origin);
    });
  }

  function readFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error || new Error("Could not read the selected document."));
      reader.readAsDataURL(file);
    });
  }

  window.ScholarSathiExtension = { request, readFile };
})();
