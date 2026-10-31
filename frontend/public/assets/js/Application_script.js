const checklistPage = "documents.html";
document.getElementById("open-checklist").href = checklistPage;

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
