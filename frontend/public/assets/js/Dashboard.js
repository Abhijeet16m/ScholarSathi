const scholarships = [
    { id: "udaan", name: "Udaan Undergraduate Access Award", provider: "ScholarSathi Demo Fund", amount: "₹40,000 / year", deadline: "18 Nov 2026", note: "Undergraduate students, income below ₹5 lakh, 75%+ marks. Complete your profile to calculate a final result.", reasons: ["Undergraduate education level is required.", "Income and academic marks need confirmation."] },
    { id: "karnataka", name: "Karnataka STEM Continuation Grant", provider: "Illustrative State Program", amount: "Up to ₹60,000", deadline: "2 Dec 2026", note: "Karnataka domicile and Engineering or STEM course. Complete your profile to calculate a final result.", reasons: ["Karnataka domicile must be confirmed.", "Engineering or STEM course must be confirmed."] },
    { id: "merit", name: "National Merit Support Scholarship", provider: "Illustrative Education Trust", amount: "₹25,000 / year", deadline: "15 Dec 2026", note: "Academic performance and current enrollment are considered. Verify your details to see a result.", reasons: ["Academic marks and current enrollment need verification."] }
];
let currentStudentName = "Student";
const titles = { workspace: () => `Good morning, ${currentStudentName}`, profile: "My Profile", applications: "My Applications", documents: "Documents", alerts: "Deadline Alerts", privacy: "Privacy Center", settings: "Settings" };
async function loadSignedInStudent() {
    try {
        const response = await fetch("/api/auth/me", { credentials: "same-origin", headers: { Accept: "application/json" } });
        // Use the site's root login route so deployments can serve their
        // configured index page without relying on a file-specific URL.
        if (response.status === 401) { window.location.replace("/"); return; }
        if (!response.ok) throw new Error("Could not load the signed-in account.");
        const student = await response.json();
        currentStudentName = (student.name || student.profile?.fullName || "Student").trim() || "Student";
        document.getElementById("student-name").textContent = currentStudentName;
        const initials = currentStudentName.split(/\s+/).slice(0, 2).map(part => part[0]).join("").toUpperCase();
        document.getElementById("student-avatar").textContent = initials;
    } catch (error) {
        console.error("Unable to load the signed-in user's name:", error);
    }
}
function go(view) { document.querySelectorAll(".page-view").forEach(el => el.classList.toggle("active", el.id === `view-${view}`)); document.querySelectorAll(".nav-item").forEach(el => el.classList.toggle("active", el.dataset.view === view)); const pageTitle = document.getElementById("page-title"); if (pageTitle) pageTitle.textContent = typeof titles[view] === "function" ? titles[view]() : (titles[view] || "ScholarSathi"); window.scrollTo({ top: 0, behavior: "smooth" }); }
document.querySelectorAll("[data-view]").forEach(b => b.addEventListener("click", () => go(b.dataset.view)));
document.querySelectorAll("[data-go]").forEach(b => b.addEventListener("click", () => go(b.dataset.go)));
function renderScholarships(query = "") { const grid = document.getElementById("scholarship-grid"), saved = JSON.parse(localStorage.getItem("ss_saved") || "[]"), rows = scholarships.filter(s => (s.name + " " + s.provider).toLowerCase().includes(query.toLowerCase())); document.getElementById("results-count").textContent = `${rows.length} scholarships`; grid.innerHTML = rows.map(s => { let yes = saved.includes(s.id); return `<article class="scholarship-card ${yes ? "saved" : ""}"><div class="card-top"><span class="match-pill">Explainable match</span><button class="save-btn ${yes ? "saved" : ""}" data-save="${s.id}">${yes ? "Saved" : "Save"}</button></div><h3>${s.name}</h3><div class="provider">${s.provider} · ${s.amount}</div><div class="deadline">Deadline ${s.deadline}</div><div class="eligibility-note"><span class="check">✓</span><div><strong>Needs verification:</strong> ${s.note}</div></div><button class="primary view-btn" data-eligibility="${s.id}">View eligibility <span>›</span></button></article>` }).join("") || '<div class="panel">No scholarships match your search. Try another keyword.</div>'; grid.querySelectorAll("[data-save]").forEach(b => b.addEventListener("click", () => { let a = JSON.parse(localStorage.getItem("ss_saved") || "[]"); a = a.includes(b.dataset.save) ? a.filter(x => x !== b.dataset.save) : [...a, b.dataset.save]; localStorage.setItem("ss_saved", JSON.stringify(a)); renderScholarships(document.getElementById("search-input").value) })); grid.querySelectorAll("[data-eligibility]").forEach(b => b.addEventListener("click", () => showEligibility(b.dataset.eligibility))); }
function showEligibility(id) { const s = scholarships.find(x => x.id === id); document.getElementById("dialog-title").textContent = s.name; document.getElementById("dialog-body").innerHTML = `<p><strong>Status: Needs Verification</strong></p><p>${s.note}</p><ul>${s.reasons.map(r => `<li>${r}</li>`).join("")}</ul><p>Next step: complete My Profile. Illustrative demo data only; this is not an official eligibility decision.</p>`; document.getElementById("eligibility-dialog").showModal(); }
document.getElementById("dialog-close").addEventListener("click", () => document.getElementById("eligibility-dialog").close());
document.getElementById("search-form").addEventListener("submit", e => { e.preventDefault(); renderScholarships(document.getElementById("search-input").value) }); document.getElementById("search-input").addEventListener("input", e => renderScholarships(e.target.value));
document.getElementById("profile-form").addEventListener("submit", e => { e.preventDefault(); localStorage.setItem("ss_profile", JSON.stringify(Object.fromEntries(new FormData(e.target)))); document.getElementById("profile-status").textContent = "Profile saved in this browser demo."; });
document.getElementById("clear-data").addEventListener("click", () => { if (confirm("Clear saved ScholarSathi demo profile and saved scholarships?")) { localStorage.removeItem("ss_profile"); localStorage.removeItem("ss_saved"); alert("Local demo data cleared."); renderScholarships(); } });
document.getElementById("logout")?.addEventListener("click", async event => {
    const button = event.currentTarget;
    button.disabled = true;
    try {
        const response = await fetch("/api/auth/logout", {
            method: "POST",
            credentials: "same-origin",
            headers: { Accept: "text/html" }
        });
        if (!response.ok) throw new Error("Logout request failed.");
        window.location.replace("/");
    } catch (error) {
        console.error("Unable to log out:", error);
        alert("Could not log out. Please try again.");
        button.disabled = false;
    }
});
renderScholarships();
loadSignedInStudent();
