// Replace these placeholders with your real backend routes.
const API_ENDPOINTS = {
  search: "/api/scholarships",
  eligibility: "/api/scholarships/:id/eligibility",
  save: "/api/scholarships/:id/save",
  profile: "profile.html",
  logout: "/api/auth/logout"
};
fetch("/api/auth/me", { credentials: "same-origin" })
  .then(response => {
    if (!response.ok) throw new Error("Your sign-in session has expired.");
    return response.json();
  })
  .then(student => {
    const fullName = String(student.name || "Student").trim() || "Student";
    document.getElementById("profile-name").textContent = fullName;
    document.getElementById("initials").textContent = fullName.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0].toUpperCase()).join("") || "ST";
  })
  .catch(() => { window.location.href = "/index.html"; });

const searchInput = document.getElementById("search");
const cards = [...document.querySelectorAll(".scholarship")];
function filterCards(query) {
  const q = query.trim().toLowerCase();
  let shown = 0;
  cards.forEach(card => {
    const haystack = `${card.dataset.title} ${card.dataset.provider} ${card.dataset.search}`.toLowerCase();
    card.hidden = !!q && !haystack.includes(q);
    if (!card.hidden) shown++;
  });
  document.getElementById("results-count").textContent = `${shown} scholarship${shown === 1 ? "" : "s"}`;
  document.getElementById("empty").hidden = shown !== 0;
}
searchInput.addEventListener("input", () => filterCards(searchInput.value));
document.getElementById("search-form").addEventListener("submit", async e => {
  e.preventDefault();
  filterCards(searchInput.value);
  // Backend integration example:
  // const res = await fetch(`${API_ENDPOINTS.search}?search=${encodeURIComponent(searchInput.value)}`, {credentials:"include"});
  // const results = await res.json(); renderScholarships(results);
});
document.getElementById("cards").addEventListener("click", async e => {
  const button = e.target.closest(".save");
  if (!button) return;
  const saved = button.getAttribute("aria-pressed") === "true";
  button.setAttribute("aria-pressed", String(!saved));
  button.classList.toggle("saved", !saved);
  button.textContent = saved ? "Save" : "Saved";
  // Connect POST/DELETE to API_ENDPOINTS.save using the real scholarship ID.
});
document.getElementById("logout").addEventListener("click", async () => {
  if (!confirm("Do you want to log out?")) return;
  const response = await fetch(API_ENDPOINTS.logout, { method: "POST", credentials: "same-origin" });
  if (response.ok) location.href = "/index.html";
});
filterCards("");
