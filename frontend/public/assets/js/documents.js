/*
  Replace these placeholders with your actual backend routes.
  upload: POST /api/documents (multipart/form-data)
  list: GET /api/documents
  view: GET /api/documents/:id
  remove: DELETE /api/documents/:id
  updateStatus: PATCH /api/documents/:id/status
  logout: your app's sign-out endpoint
*/
const API_ENDPOINTS = {
  upload: "/api/documents",
  list: "/api/documents",
  view: "/api/documents/:id",
  remove: "/api/documents/:id",
  updateStatus: "/api/documents/:id/status",
  logout: "/api/auth/logout"
};

function renderStudentName(value) {
  const fullName = String(value || "Student").trim() || "Student";
  document.getElementById("profile-name").textContent = fullName;
  document.getElementById("avatar-initials").textContent =
    fullName.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0].toUpperCase()).join("") || "ST";
}

renderStudentName("Student");
fetch("/api/auth/me", { credentials: "same-origin" })
  .then(response => {
    if (!response.ok) throw new Error("Student session is no longer active.");
    return response.json();
  })
  .then(student => renderStudentName(student.name))
  .catch(() => { window.location.href = "/index.html"; });

const list = document.getElementById("document-list");
const uploadDialog = document.getElementById("upload-dialog");
const viewDialog = document.getElementById("view-dialog");

function updateCounts() {
  const rows = [...list.querySelectorAll(".document-row")];
  document.getElementById("ready-count").textContent = rows.filter(row => row.dataset.ready === "true").length;
  document.getElementById("total-count").textContent = rows.length;
}

function checkIcon() {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", "m5 12 4 4L19 6");
  svg.appendChild(path);
  return svg;
}

list.addEventListener("click", async event => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  const row = button.closest(".document-row");
  const name = button.dataset.name;
  const id = row.dataset.id || "DOCUMENT_ID";

  if (button.dataset.action === "view") {
    document.getElementById("view-title").textContent = name;
    document.getElementById("view-message").textContent =
      `Connect your secure document API to view this file: ${API_ENDPOINTS.view.replace(":id", encodeURIComponent(id))}`;
    document.getElementById("view-endpoint-link").href =
      API_ENDPOINTS.view.replace(":id", encodeURIComponent(id));
    viewDialog.showModal();
    return;
  }

  if (button.dataset.action === "remove") {
    if (!window.confirm(`Remove "${name}" from your document list?`)) return;

    // Demo mode removes the row from this page. Connect the DELETE request below
    // to remove the stored document from your server as well.
    row.remove();
    updateCounts();

    // Production example:
    // const response = await fetch(API_ENDPOINTS.remove.replace(":id", encodeURIComponent(id)), {
    //   method: "DELETE", credentials: "include"
    // });
    // if (!response.ok) { alert("Could not remove document."); return; }
    return;
  }

  if (button.dataset.action === "mark") {
    row.dataset.ready = "true";
    const status = row.querySelector(".status-check");
    status.classList.add("ready");
    status.replaceChildren(checkIcon());
    status.setAttribute("aria-label", "Ready");
    row.querySelector(".document-info small").textContent = "Marked available";
    button.textContent = "Ready";
    button.disabled = true;
    updateCounts();

    // Production example:
    // await fetch(API_ENDPOINTS.updateStatus.replace(":id", encodeURIComponent(id)), {
    //   method: "PATCH", credentials: "include",
    //   headers: {"Content-Type": "application/json"},
    //   body: JSON.stringify({ready: true})
    // });
  }
});

document.getElementById("open-upload").addEventListener("click", () => uploadDialog.showModal());
document.getElementById("close-upload").addEventListener("click", () => uploadDialog.close());
document.getElementById("cancel-upload").addEventListener("click", () => uploadDialog.close());
document.getElementById("close-view").addEventListener("click", () => viewDialog.close());
document.getElementById("close-view-bottom").addEventListener("click", () => viewDialog.close());

document.getElementById("upload-form").addEventListener("submit", async event => {
  event.preventDefault();
  const title = document.getElementById("document-title").value.trim();
  const file = document.getElementById("document-file").files[0];
  if (!title || !file) return;

  // Demo mode: adds a checklist row only; it does not send file bytes to a server.
  const row = document.createElement("article");
  row.className = "document-row";
  row.dataset.document = title;
  row.dataset.ready = "true";
  row.dataset.id = "";
  const status = document.createElement("span");
  status.className = "status-check ready";
  status.setAttribute("aria-label", "Ready");
  status.appendChild(checkIcon());
  const info = document.createElement("div");
  info.className = "document-info";
  const strong = document.createElement("strong");
  strong.textContent = title;
  const small = document.createElement("small");
  small.textContent = `Selected: ${file.name} (demo only — not uploaded)`;
  info.append(strong, small);

  const actions = document.createElement("div");
  actions.className = "row-actions";
  const view = document.createElement("button");
  view.className = "row-action view-action";
  view.type = "button";
  view.dataset.action = "view";
  view.dataset.name = title;
  view.textContent = "View";
  const remove = document.createElement("button");
  remove.className = "row-action remove-action";
  remove.type = "button";
  remove.dataset.action = "remove";
  remove.dataset.name = title;
  remove.textContent = "Remove";
  actions.append(view, remove);
  row.append(status, info, actions);
  list.appendChild(row);
  updateCounts();
  uploadDialog.close();
  event.target.reset();

  // Production upload example:
  // const data = new FormData();
  // data.append("title", title);
  // data.append("file", file);
  // const response = await fetch(API_ENDPOINTS.upload, {
  //   method: "POST", body: data, credentials: "include"
  // });
  // if (!response.ok) alert("Upload failed.");
});

document.getElementById("logout-button").addEventListener("click", async () => {
  if (!window.confirm("Do you want to log out?")) return;

  try {
    const response = await fetch(API_ENDPOINTS.logout, {
      method: "POST",
      credentials: "include"
    });
    if (!response.ok) throw new Error("Logout request failed.");
    window.location.href = "/";
  } catch (error) {
    console.error(error);
    window.alert("Could not log out. Please try again.");
  }
});

updateCounts();



