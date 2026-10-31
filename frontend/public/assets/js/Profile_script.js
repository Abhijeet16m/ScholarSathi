const form = document.getElementById("profile-form");
const statusMessage = document.getElementById("status-message");
const nameEl = document.getElementById("profile-name");
const avatarEl = document.getElementById("avatar-initials");

function updateStudentName(name) {
  const fullName = String(name || "Student").trim() || "Student";
  nameEl.textContent = fullName;
  avatarEl.textContent = fullName.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0].toUpperCase()).join("") || "ST";
}

fetch("/api/auth/me", { credentials: "same-origin" })
  .then(response => {
    if (!response.ok) throw new Error("Your sign-in session has expired.");
    return response.json();
  })
  .then(student => updateStudentName(student.name))
  .catch(() => { window.location.href = "/index.html"; });

form.addEventListener("submit", event => {
  event.preventDefault();
  const marks = Number(form.elements.namedItem("marks").value);
  if (!Number.isNaN(marks) && (marks < 0 || marks > 100)) {
    statusMessage.textContent = "Marks or percentage must be between 0 and 100.";
    return;
  }
  statusMessage.textContent = "This profile editor is a demo and does not save changes yet. Your registered profile remains unchanged.";
});

form.addEventListener("reset", () => {
  statusMessage.textContent = "Unsaved form edits were cleared.";
});

document.getElementById("logout-button").addEventListener("click", async () => {
  if (!window.confirm("Do you want to log out?")) return;
  const response = await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" });
  if (response.ok) window.location.href = "/index.html";
});
