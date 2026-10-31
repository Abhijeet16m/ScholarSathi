const list = document.getElementById("document-list");
const uploadDialog = document.getElementById("upload-dialog");
const viewDialog = document.getElementById("view-dialog");
const statusEl = document.getElementById("extension-status");
const typeSelect = document.getElementById("document-type");

function renderStudentName(value) {
  const fullName = String(value || "Student").trim() || "Student";
  document.getElementById("profile-name").textContent = fullName;
  document.getElementById("avatar-initials").textContent =
    fullName.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0].toUpperCase()).join("") || "ST";
}

function formatSize(bytes) {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function checkIcon() {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", "m5 12 4 4L19 6");
  svg.appendChild(path);
  return svg;
}

function updateCounts(ready, total) {
  document.getElementById("ready-count").textContent = String(ready);
  document.getElementById("total-count").textContent = String(total);
}

function makeAction(label, action, className) {
  const button = document.createElement("button");
  button.className = `row-action ${className || ""}`.trim();
  button.type = "button";
  button.dataset.action = action;
  button.textContent = label;
  return button;
}

function makeRow(option, saved) {
  const row = document.createElement("article");
  row.className = "document-row";
  row.dataset.document = option.textContent;
  row.dataset.type = option.value;
  row.dataset.ready = saved ? "true" : "false";

  const statusIcon = document.createElement("span");
  statusIcon.className = saved ? "status-check ready" : "status-check";
  statusIcon.setAttribute("aria-label", saved ? "Saved in Chrome" : "Not saved");
  if (saved) statusIcon.appendChild(checkIcon());

  const info = document.createElement("div");
  info.className = "document-info";
  const title = document.createElement("strong");
  title.textContent = option.textContent;
  const detail = document.createElement("small");
  detail.textContent = saved ? `Saved locally: ${saved.name} · ${formatSize(saved.size)}` : "Not saved in this Chrome profile";
  info.append(title, detail);

  const actions = document.createElement("div");
  actions.className = "row-actions";
  if (saved) {
    actions.append(makeAction("Open", "view", "view-action"), makeAction("Remove", "remove", "remove-action"));
  }
  row.append(statusIcon, info, actions);
  return row;
}

async function refreshDocuments() {
  try {
    if (!window.ScholarSathiExtension) throw new Error("Scholar Assist extension is not available on this page.");
    const response = await window.ScholarSathiExtension.request("LIST_DOCUMENTS");
    const savedDocs = new Map(response.documents.map(doc => [doc.type, doc]));
    const options = [...typeSelect.options].filter(option => option.value);
    list.replaceChildren(...options.map(option => makeRow(option, savedDocs.get(option.value))));
    updateCounts(savedDocs.size, options.length);
    statusEl.textContent = "Document files and this checklist stay in the Scholar Assist extension storage on this Chrome profile. The website server and Neon do not receive the files.";
    statusEl.classList.remove("extension-error");
  } catch (error) {
    list.replaceChildren();
    updateCounts(0, [...typeSelect.options].filter(option => option.value).length);
    statusEl.textContent = `${error.message} Install or enable the extension, then reload this page.`;
    statusEl.classList.add("extension-error");
  }
}

list.addEventListener("click", async event => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  const row = button.closest(".document-row");
  const type = row.dataset.type;
  const title = row.dataset.document;

  try {
    if (button.dataset.action === "remove") {
      if (!window.confirm(`Remove ${title} from this Chrome profile?`)) return;
      await window.ScholarSathiExtension.request("DELETE_DOCUMENT", { type });
      await refreshDocuments();
    } else if (button.dataset.action === "view") {
      const doc = await window.ScholarSathiExtension.request("GET_DOCUMENT", { type }, 60000);
      document.getElementById("view-title").textContent = title;
      document.getElementById("view-message").textContent = `${doc.name} is stored locally in Chrome. Use this link to open or download the saved copy.`;
      const link = document.getElementById("view-endpoint-link");
      link.href = doc.dataUrl;
      link.download = doc.name;
      viewDialog.showModal();
    }
  } catch (error) {
    statusEl.textContent = `Could not access Chrome storage: ${error.message}`;
    statusEl.classList.add("extension-error");
  }
});

document.getElementById("open-upload").addEventListener("click", () => uploadDialog.showModal());
document.getElementById("close-upload").addEventListener("click", () => uploadDialog.close());
document.getElementById("cancel-upload").addEventListener("click", () => uploadDialog.close());
document.getElementById("close-view").addEventListener("click", () => viewDialog.close());
document.getElementById("close-view-bottom").addEventListener("click", () => viewDialog.close());

document.getElementById("upload-form").addEventListener("submit", async event => {
  event.preventDefault();
  const type = typeSelect.value;
  const file = document.getElementById("document-file").files[0];
  if (!type || !file) return;
  if (file.size > 10 * 1024 * 1024) {
    statusEl.textContent = "Choose a file no larger than 10 MB.";
    statusEl.classList.add("extension-error");
    return;
  }
  try {
    statusEl.textContent = "Saving this file in Chrome extension storage…";
    const dataUrl = await window.ScholarSathiExtension.readFile(file);
    await window.ScholarSathiExtension.request("SAVE_DOCUMENT", { type, name: file.name, mime: file.type, dataUrl }, 60000);
    uploadDialog.close();
    event.target.reset();
    await refreshDocuments();
  } catch (error) {
    statusEl.textContent = `Could not save the document locally: ${error.message}`;
    statusEl.classList.add("extension-error");
  }
});

document.getElementById("logout-button").addEventListener("click", async () => {
  if (!window.confirm("Do you want to log out?")) return;
  try {
    const response = await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" });
    if (!response.ok) throw new Error("Logout request failed.");
    window.location.href = "/index.html";
  } catch (error) {
    window.alert(`Could not log out: ${error.message}`);
  }
});

fetch("/api/auth/me", { credentials: "same-origin" })
  .then(response => {
    if (!response.ok) throw new Error("Your sign-in session has expired.");
    return response.json();
  })
  .then(async student => {
    renderStudentName(student.name);
    // Keep the extension profile in sync from Documents as well as Dashboard.
    if (student.profile && window.ScholarSathiExtension) {
      try {
        await window.ScholarSathiExtension.request("SAVE_PROFILE", { profile: student.profile });
      } catch (error) {
        console.info("Scholar Assist profile sync is unavailable on this browser.", error.message);
      }
    }
  })
  .catch(() => { window.location.href = "/index.html"; });

refreshDocuments();
