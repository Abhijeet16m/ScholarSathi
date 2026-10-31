const deadlineRows = [...document.querySelectorAll(".deadline-row")];
const filter = document.getElementById("deadline-filter");
const count = document.getElementById("deadline-count");
const empty = document.getElementById("empty-state");

function daysUntil(dateString) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(`${dateString}T00:00:00`);
  return Math.ceil((due.getTime() - today.getTime()) / 86400000);
}

function renderDeadlines() {
  const range = filter.value === "all" ? Infinity : Number(filter.value);
  let visible = 0;
  deadlineRows.forEach(row => {
    const days = daysUntil(row.dataset.deadline);
    const badge = row.querySelector(".days-badge");
    if (days < 0) {
      badge.textContent = "Passed";
      badge.className = "days-badge past";
    } else {
      badge.textContent = `${days} day${days === 1 ? "" : "s"}`;
      badge.className = `days-badge${days <= 7 ? " soon" : ""}`;
    }
    const shouldShow = days >= 0 && days <= range;
    row.hidden = !shouldShow;
    if (shouldShow) visible++;
  });
  count.textContent = String(visible);
  empty.hidden = visible !== 0;
}

filter.addEventListener("change", renderDeadlines);
renderDeadlines();

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
