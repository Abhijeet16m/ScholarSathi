const modal = document.getElementById("confirm-modal");
const clearButton = document.getElementById("clear-profile");
const cancelButton = document.getElementById("cancel-clear");
const confirmButton = document.getElementById("confirm-clear");
const feedback = document.getElementById("feedback");

function closeConfirm() {
  modal.hidden = true;
  clearButton.focus();
}
clearButton.addEventListener("click", () => { modal.hidden = false; confirmButton.focus(); });
cancelButton.addEventListener("click", closeConfirm);
modal.addEventListener("click", event => { if (event.target === modal) closeConfirm(); });
document.addEventListener("keydown", event => { if (event.key === "Escape" && !modal.hidden) closeConfirm(); });
confirmButton.addEventListener("click", () => {
  feedback.textContent = "This page cannot delete your account or the documents saved in Scholar Assist. Those deletion controls are not implemented yet.";
  closeConfirm();
});

fetch("/api/auth/me", { credentials: "same-origin" })
  .then(response => {
    if (!response.ok) throw new Error("Your sign-in session has expired.");
    return response.json();
  })
  .then(student => {
    const name = String(student.name || "Student").trim() || "Student";
    document.getElementById("profile-name").textContent = name;
    document.getElementById("avatar-initials").textContent = name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0].toUpperCase()).join("") || "ST";
  })
  .catch(() => { window.location.href = "/index.html"; });

document.getElementById("logout-button").addEventListener("click", async () => {
  if (!window.confirm("Do you want to log out?")) return;
  const response = await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" });
  if (response.ok) window.location.href = "/index.html";
});
