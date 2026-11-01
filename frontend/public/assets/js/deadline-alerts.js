(() => {
  const list = document.getElementById("deadline-list");
  const count = document.getElementById("deadline-count");
  const filter = document.getElementById("deadline-filter");
  const feedback = document.getElementById("deadline-feedback");
  let deadlines = [];

  function setStudentName(student) {
    const name = String(student.name || student.profile?.fullName || "Student").trim() || "Student";
    const initials = name.split(/\s+/).filter(Boolean).slice(0, 2)
      .map(part => part[0].toUpperCase()).join("") || "ST";
    for (const [id, value] of [
      ["profile-name", name], ["sidebar-name", name],
      ["avatar-initials", initials], ["sidebar-initials", initials],
    ]) {
      const element = document.getElementById(id);
      if (element) element.textContent = value;
    }
  }

  function parseDate(value) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}/.test(value)) return null;
    const date = new Date(`${value.slice(0, 10)}T00:00:00Z`);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function daysUntil(date) {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    return Math.ceil((date.getTime() - today.getTime()) / 86400000);
  }

  function statusClass(status) {
    if (status === "Eligible") return "match-status-eligible";
    if (status === "Not Eligible") return "match-status-ineligible";
    return "match-status-verify";
  }

  function makeCard(match) {
    const dueDate = parseDate(match.deadline);
    const remainingDays = daysUntil(dueDate);
    const card = document.createElement("article");
    card.className = "scholarship-card match-card";

    const status = document.createElement("span");
    status.className = `match-pill ${statusClass(match.eligibility_status)}`;
    status.textContent = match.eligibility_status || "Needs Verification";
    const title = document.createElement("h3");
    title.textContent = match.scholarship_name || "Scholarship";
    const provider = document.createElement("p");
    provider.className = "provider";
    provider.textContent = match.provider || "Provider not listed";
    const deadline = document.createElement("p");
    deadline.className = "deadline match-deadline";
    const formatted = new Intl.DateTimeFormat(undefined, {
      day: "numeric", month: "short", year: "numeric", timeZone: "UTC",
    }).format(dueDate);
    deadline.textContent = `Deadline ${formatted} · ${remainingDays} day${remainingDays === 1 ? "" : "s"} left`;
    card.append(status, title, provider, deadline);

    if (match.application_url) {
      try {
        const url = new URL(match.application_url);
        if (url.protocol === "https:" || url.protocol === "http:") {
          const link = document.createElement("a");
          link.className = "official-link";
          link.href = url.href;
          link.target = "_blank";
          link.rel = "noopener noreferrer";
          link.textContent = "Official scheme page ↗";
          card.append(link);
        }
      } catch { /* Invalid database URLs are not rendered as links. */ }
    }
    return card;
  }

  function render() {
    const limit = filter.value === "all" ? Infinity : Number(filter.value);
    const rows = deadlines.filter(item => item.days <= limit);
    count.textContent = `${rows.length} upcoming deadline${rows.length === 1 ? "" : "s"}`;
    if (!rows.length) {
      const empty = document.createElement("p");
      empty.className = "panel match-empty";
      empty.textContent = deadlines.length
        ? "No upcoming deadlines fall within this period."
        : "No upcoming scholarship deadlines are available right now.";
      list.replaceChildren(empty);
      return;
    }
    list.replaceChildren(...rows.map(item => makeCard(item.match)));
  }

  async function requestJson(url) {
    const response = await fetch(url, {
      credentials: "same-origin",
      headers: { Accept: "application/json" },
    });
    const payload = await response.json().catch(() => ({}));
    if (response.status === 401) {
      window.location.replace("/index.html");
      throw new Error("Your sign-in session has expired.");
    }
    if (!response.ok) throw new Error(payload.error || `The server returned ${response.status}.`);
    return payload;
  }

  async function initialize() {
    try {
      const [student, result] = await Promise.all([
        requestJson("/api/auth/me"),
        requestJson("/api/scholarships/matches"),
      ]);
      setStudentName(student);
      if (!Array.isArray(result.matches)
          || !result.matches.every(match => match && typeof match === "object")) {
        throw new Error("The scholarship service returned an invalid response.");
      }
      deadlines = result.matches
        .map(match => ({ match, date: parseDate(match.deadline) }))
        .filter(item => item.date)
        .map(item => ({ ...item, days: daysUntil(item.date) }))
        .filter(item => item.days >= 0)
        .sort((left, right) => left.date - right.date);
      render();
    } catch (error) {
      if (error.message === "Your sign-in session has expired.") return;
      count.textContent = "Unable to load deadlines";
      const message = document.createElement("p");
      message.className = "panel match-empty is-error";
      message.textContent = error.message || "Could not load scholarship deadlines.";
      list.replaceChildren(message);
      feedback.textContent = "Check your connection and try again.";
      feedback.classList.add("is-error");
    }
  }

  filter.addEventListener("change", render);
  document.getElementById("logout-button")?.addEventListener("click", async () => {
    try {
      const response = await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" });
      if (!response.ok) throw new Error("Logout request failed.");
      window.location.replace("/index.html");
    } catch (error) {
      feedback.textContent = error.message || "Could not log out.";
      feedback.classList.add("is-error");
    }
  });
  void initialize();
})();
