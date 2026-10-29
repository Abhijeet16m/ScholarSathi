/*
  API placeholders:
  GET /api/deadlines — return all upcoming deadlines for the signed-in student.
  GET /api/scholarships/:id — scholarship details page/data.
  POST /logout — replace with your authentication provider's sign-out route.
  The current cards are sample data; countdowns are calculated from today's date.
*/
const API_ENDPOINTS = {
  deadlines: "/api/deadlines",
  logout: "/logout"
};

const fullName = "Mira Rao"; // Replace with the authenticated user's profile name.
document.getElementById("profile-name").textContent = fullName;
document.getElementById("avatar-initials").textContent =
  fullName.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0].toUpperCase()).join("") || "ST";

const deadlineRows = [...document.querySelectorAll(".deadline-row")];
const filter = document.getElementById("deadline-filter");
const count = document.getElementById("deadline-count");
const empty = document.getElementById("empty-state");

function daysUntil(dateString) {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const due = new Date(`${dateString}T00:00:00`);
  return Math.ceil((due.getTime() - now.getTime()) / 86400000);
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

// To load live data, implement GET /api/deadlines and replace the sample rows.
// Expected response example:
// [{ "id":"udaan", "title":"Udaan Undergraduate Access Award", "deadline":"2026-11-18",
//    "detailsUrl":"/scholarships/udaan" }]
async function loadLiveDeadlines() {
  // const response = await fetch(API_ENDPOINTS.deadlines, { credentials: "include" });
  // if (!response.ok) throw new Error("Could not load deadlines");
  // const deadlines = await response.json();
  // TODO: render returned records into #deadline-list.
}

document.getElementById("logout-button").addEventListener("click", () => {
  if (window.confirm("Do you want to log out?")) {
    window.location.href = API_ENDPOINTS.logout;
  }
});
