(() => {
  const grid = document.getElementById("scholarship-grid");
  const count = document.getElementById("match-results-count");
  const feedback = document.getElementById("match-feedback");
  const search = document.getElementById("match-search");
  let matches = [];
  let trackedKeys = new Set();

  const setText = (id, value) => {
    const element = document.getElementById(id);
    if (element) element.textContent = value;
  };

  async function requestJson(url, options = {}) {
    const response = await fetch(url, {
      credentials: "same-origin",
      headers: { Accept: "application/json", ...(options.body ? { "Content-Type": "application/json" } : {}), ...options.headers },
      ...options,
    });
    const payload = await response.json().catch(() => ({}));
    if (response.status === 401) {
      window.location.replace("/index.html");
      throw new Error("Your sign-in session has expired.");
    }
    if (!response.ok) throw new Error(payload.error || `The server returned ${response.status}.`);
    return payload;
  }

  function showFeedback(message, isError = false) {
    if (!feedback) return;
    feedback.textContent = message;
    feedback.classList.toggle("is-error", isError);
  }

  function initials(name) {
    return String(name || "Student").trim().split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0].toUpperCase()).join("") || "ST";
  }

  function formatDate(value) {
    if (!value) return "No deadline listed";
    const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
    return Number.isNaN(date.getTime()) ? "Deadline to be confirmed" : `Deadline ${new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: "numeric" }).format(date)}`;
  }

  function statusClass(status) {
    if (status === "Eligible") return "match-status-eligible";
    if (status === "Not Eligible") return "match-status-ineligible";
    return "match-status-verify";
  }

  function createCard(match) {
    const card = document.createElement("article");
    card.className = "scholarship-card match-card";

    const top = document.createElement("div");
    top.className = "card-top";
    const status = document.createElement("span");
    status.className = `match-pill ${statusClass(match.eligibility_status)}`;
    status.textContent = match.eligibility_status || "Needs Verification";
    top.append(status);

    const title = document.createElement("h3");
    title.textContent = match.scholarship_name || "Scholarship";
    const provider = document.createElement("p");
    provider.className = "provider";
    provider.textContent = match.provider || "Provider not listed";

    const schemeMeta = document.createElement("p");
    schemeMeta.className = "match-scheme-meta";
    const amount = Number(match.scholarship_amount);
    const amountText = Number.isFinite(amount) && amount > 0
      ? new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(amount)
      : "Amount not listed";
    schemeMeta.textContent = `${amountText} · Scheme status: ${match.scholarship_status || "to be confirmed"}`;

    const summary = document.createElement("p");
    summary.className = "match-summary";
    const applicable = Number(match.applicable_conditions) || 0;
    const matched = Number(match.matched_conditions) || 0;
    summary.textContent = applicable ? `${matched} of ${applicable} eligibility checks matched` : "Eligibility criteria need review";

    const deadline = document.createElement("p");
    deadline.className = "deadline match-deadline";
    deadline.textContent = formatDate(match.deadline);

    const reasons = [
      ...(Array.isArray(match.failed_reasons) ? match.failed_reasons.map(reason => `Does not match: ${reason}`) : []),
      ...(Array.isArray(match.verification_reasons) ? match.verification_reasons.map(reason => `Needs confirmation: ${reason}`) : []),
    ];
    if (reasons.length) {
      const details = document.createElement("details");
      details.className = "match-reasons";
      const summaryText = document.createElement("summary");
      summaryText.textContent = "Why this result?";
      const list = document.createElement("ul");
      for (const reason of reasons) {
        const item = document.createElement("li");
        item.textContent = reason;
        list.append(item);
      }
      details.append(summaryText, list);
      card.append(top, title, provider, schemeMeta, summary, deadline, details);
    } else {
      card.append(top, title, provider, schemeMeta, summary, deadline);
      const note = document.createElement("p");
      note.className = "match-note";
      note.textContent = "No failed or unconfirmed checks were returned. Confirm scheme rules with the provider before applying.";
      card.append(note);
    }

    const actions = document.createElement("div");
    actions.className = "match-actions";
    const key = `scheme-${String(match.scholarship_id)}`;
    const track = document.createElement("button");
    track.type = "button";
    track.className = "primary-button view-btn";
    track.textContent = trackedKeys.has(key) ? "In my applications" : "Track scholarship";
    track.disabled = trackedKeys.has(key);
    track.addEventListener("click", async () => {
      track.disabled = true;
      try {
        await requestJson("/api/applications", {
          method: "POST",
          body: JSON.stringify({ scholarshipName: match.scholarship_name, scholarshipKey: key }),
        });
        trackedKeys.add(key);
        track.textContent = "In my applications";
        setText("application-progress-count", String(trackedKeys.size));
        const badge = document.getElementById("application-count");
        if (badge) badge.textContent = String(trackedKeys.size);
        showFeedback("Scholarship added to your application tracker.");
      } catch (error) {
        track.disabled = false;
        showFeedback(error.message, true);
      }
    });
    actions.append(track);

    if (match.application_url) {
      try {
        const url = new URL(match.application_url);
        if (url.protocol === "https:" || url.protocol === "http:") {
          const official = document.createElement("a");
          official.className = "official-link";
          official.href = url.href;
          official.target = "_blank";
          official.rel = "noopener noreferrer";
          official.textContent = "Official scheme page ↗";
          actions.append(official);
        }
      } catch { /* Invalid database URLs are not rendered as links. */ }
    }
    card.append(actions);
    return card;
  }

  function renderMatches() {
    if (!grid) return;
    const query = String(search?.value || "").trim().toLocaleLowerCase();
    const rows = matches.filter(match => `${match.scholarship_name || ""} ${match.provider || ""}`.toLocaleLowerCase().includes(query));
    if (count) count.textContent = `${rows.length} of ${matches.length} scholarships`;
    if (!rows.length) {
      const empty = document.createElement("p");
      empty.className = "panel match-empty";
      empty.textContent = matches.length ? "No scholarships match your search." : "No scholarship matches are available yet. Check that scheme data and your profile are present.";
      grid.replaceChildren(empty);
      return;
    }
    grid.replaceChildren(...rows.map(createCard));
  }

  async function loadLocalDocumentReadiness() {
    if (!window.ScholarSathiExtension) {
      setText("document-readiness-count", "—");
      return;
    }
    try {
      const result = await window.ScholarSathiExtension.request("LIST_DOCUMENTS");
      const total = Array.isArray(result.documents) ? result.documents.length : 0;
      setText("document-readiness-count", total ? `${total} saved` : "0 saved");
    } catch {
      setText("document-readiness-count", "Unavailable");
    }
  }

  async function initialize() {
    try {
      const student = await requestJson("/api/auth/me");
      const name = student.name || student.profile?.fullName || "Student";
      setText("greeting-name", name);
      setText("profile-name", name);
      setText("sidebar-name", name);
      setText("avatar-initials", initials(name));
      setText("sidebar-initials", initials(name));

      const [matchResult, applicationResult] = await Promise.all([
        requestJson("/api/scholarships/matches"),
        requestJson("/api/applications"),
      ]);
      matches = Array.isArray(matchResult.matches) ? matchResult.matches : [];
      trackedKeys = new Set((applicationResult.applications || []).map(application => application.scholarshipKey));
      const eligible = matches.filter(match => match.eligibility_status === "Eligible").length;
      setText("scholarship-match-count", String(eligible));
      setText("application-progress-count", String(trackedKeys.size));
      setText("application-count", String(trackedKeys.size));
      renderMatches();
      await loadLocalDocumentReadiness();
    } catch (error) {
      if (error.message !== "Your sign-in session has expired.") {
        if (grid) {
          const message = document.createElement("p");
          message.className = "panel match-empty is-error";
          message.textContent = error.message || "Could not load scholarship data.";
          grid.replaceChildren(message);
        }
        if (count) count.textContent = "Unable to load matches";
      }
    }
  }

  document.getElementById("match-search-form")?.addEventListener("submit", event => {
    event.preventDefault();
    renderMatches();
  });
  search?.addEventListener("input", renderMatches);
  document.getElementById("logout-button")?.addEventListener("click", async () => {
    try {
      await requestJson("/api/auth/logout", { method: "POST" });
      window.location.replace("/index.html");
    } catch (error) { showFeedback(error.message, true); }
  });
  void initialize();
})();
