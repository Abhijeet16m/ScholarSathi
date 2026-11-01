const list = document.getElementById("applications-list");
const feedback = document.getElementById("application-feedback");
const focusKey = new URLSearchParams(window.location.search).get("scholarship");

function setStudentName(name) {
  const fullName = String(name || "Student").trim() || "Student";
  const initials = fullName.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0].toUpperCase()).join("") || "ST";
  document.getElementById("profile-name").textContent = fullName;
  document.getElementById("sidebar-name").textContent = fullName;
  document.getElementById("avatar-initials").textContent = initials;
  document.getElementById("sidebar-initials").textContent = initials;
}

function setFeedback(message, isError = false) {
  feedback.textContent = message;
  feedback.classList.toggle("is-error", isError);
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    credentials: "same-origin",
    headers: { Accept: "application/json", ...(options.body ? { "Content-Type": "application/json" } : {}), ...options.headers },
    ...options,
  });
  const payload = await response.json().catch(() => ({}));
  if (response.status === 401) {
    window.location.replace("/");
    throw new Error("Your sign-in session has expired.");
  }
  if (!response.ok) throw new Error(payload.error || "The request could not be completed.");
  return payload;
}

function makeStage(label, { checked = false, checkbox = false, onChange } = {}) {
  const stage = checkbox ? document.createElement("label") : document.createElement("span");
  stage.className = `application-stage${checked ? " is-complete" : ""}${checkbox ? " is-checkable" : ""}`;
  if (checkbox) {
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = checked;
    input.setAttribute("aria-label", `Mark ${label.toLowerCase()} as checked`);
    input.addEventListener("change", onChange);
    stage.append(input);
  }
  const marker = document.createElement("span");
  marker.className = "application-stage-marker";
  marker.setAttribute("aria-hidden", "true");
  const text = document.createElement("span");
  text.textContent = label;
  stage.append(marker, text);
  return stage;
}

function renderApplication(application) {
  const card = document.createElement("article");
  card.className = "application-card";
  card.dataset.scholarship = application.scholarshipKey;

  const top = document.createElement("div");
  top.className = "application-top";
  const titleWrap = document.createElement("div");
  const title = document.createElement("h3");
  title.textContent = application.scholarshipName;
  const subtitle = document.createElement("p");
  subtitle.className = "subtitle";
  subtitle.textContent = application.submitted ? "Application submitted" : "Application in progress";
  titleWrap.append(title, subtitle);

  const status = document.createElement("span");
  status.className = `status${application.submitted ? " status-submitted" : ""}`;
  const statusDot = document.createElement("span");
  statusDot.className = "status-dot";
  status.append(statusDot, document.createTextNode(application.submitted ? "Submitted" : "In progress"));
  top.append(titleWrap, status);

  const stages = document.createElement("div");
  stages.className = "application-progress";
  stages.setAttribute("aria-label", "Application progress");
  stages.append(makeStage("Interested", { checked: true }));

  const documentsStage = makeStage("Documents", {
    checkbox: true,
    checked: application.documentsChecked,
    onChange: async event => {
      const input = event.currentTarget;
      input.disabled = true;
      try {
        const updated = await requestJson(`/api/applications/${encodeURIComponent(application.scholarshipKey)}/documents`, {
          method: "PATCH",
          body: JSON.stringify({ checked: input.checked }),
        });
        application.documentsChecked = updated.application.documentsChecked;
        documentsStage.classList.toggle("is-complete", application.documentsChecked);
        submitButton.disabled = !application.documentsChecked || application.submitted;
        setFeedback(application.documentsChecked ? "Documents marked as checked." : "Document check removed.");
      } catch (error) {
        input.checked = application.documentsChecked;
        setFeedback(error.message, true);
      } finally {
        input.disabled = false;
      }
    },
  });
  stages.append(documentsStage);
  stages.append(makeStage("Submitted", { checked: application.submitted }));

  const actions = document.createElement("div");
  actions.className = "application-actions";
  const checklistLink = document.createElement("a");
  checklistLink.className = "checklist-button";
  checklistLink.href = "/documents.html";
  checklistLink.textContent = "Open document checklist";

  const submitButton = document.createElement("button");
  submitButton.className = "primary-button mark-submitted-button";
  submitButton.type = "button";
  submitButton.disabled = !application.documentsChecked || application.submitted;
  submitButton.textContent = application.submitted ? "✓ Application submitted" : "Mark as submitted";
  submitButton.title = application.documentsChecked
    ? "Use this after submitting the scholarship application on the provider's portal."
    : "Check Documents first.";
  submitButton.addEventListener("click", async () => {
    submitButton.disabled = true;
    try {
      const updated = await requestJson(`/api/applications/${encodeURIComponent(application.scholarshipKey)}/submitted`, { method: "POST" });
      application.submitted = updated.application.submitted;
      setFeedback("Submission recorded. The Submitted stage is now complete.");
      renderApplications(await loadApplications());
    } catch (error) {
      setFeedback(error.message, true);
      submitButton.disabled = !application.documentsChecked || application.submitted;
    }
  });
  actions.append(checklistLink, submitButton);
  card.append(top, stages, actions);
  return card;
}

function renderApplications(applications) {
  document.getElementById("application-count").textContent = String(applications.length);
  if (!applications.length) {
    const empty = document.createElement("p");
    empty.className = "application-empty";
    empty.textContent = "No scholarships are being tracked yet. Open a scholarship from your dashboard to start an application.";
    list.replaceChildren(empty);
    return;
  }
  const cards = applications.map(renderApplication);
  list.replaceChildren(...cards);
  if (focusKey) {
    const focused = list.querySelector(`[data-scholarship="${CSS.escape(focusKey)}"]`);
    focused?.scrollIntoView({ behavior: "smooth", block: "center" });
    focused?.classList.add("application-card-focused");
  }
}

async function loadApplications() {
  const result = await requestJson("/api/applications");
  return result.applications;
}

document.getElementById("logout-button").addEventListener("click", async () => {
  if (!window.confirm("Do you want to log out?")) return;
  try {
    await requestJson("/api/auth/logout", { method: "POST" });
    window.location.replace("/");
  } catch (error) {
    setFeedback(error.message, true);
  }
});

async function initialize() {
  try {
    const student = await requestJson("/api/auth/me");
    setStudentName(student.name || student.profile?.fullName);
    renderApplications(await loadApplications());
  } catch (error) {
    if (error.message !== "Your sign-in session has expired.") setFeedback(error.message, true);
  }
}

initialize();
