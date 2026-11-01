(() => {
  const account = document.getElementById("privacy-account");
  const feedback = document.getElementById("privacy-feedback");

  function displayStudent(student) {
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
    account.textContent = student.email
      ? `Signed in as ${name} (${student.email}).`
      : `Signed in as ${name}.`;
  }

  async function loadAccount() {
    try {
      const response = await fetch("/api/auth/me", {
        credentials: "same-origin",
        headers: { Accept: "application/json" },
      });
      const result = await response.json().catch(() => ({}));
      if (response.status === 401) {
        window.location.replace("/index.html");
        return;
      }
      if (!response.ok || result.authenticated !== true) {
        throw new Error(result.error || "Could not load your account details.");
      }
      displayStudent(result);
    } catch (error) {
      account.textContent = "Your account details are temporarily unavailable.";
      feedback.textContent = error.message || "Could not load your account details.";
      feedback.classList.add("is-error");
    }
  }

  document.getElementById("logout-button")?.addEventListener("click", async () => {
    const button = document.getElementById("logout-button");
    button.disabled = true;
    try {
      const response = await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "same-origin",
      });
      if (!response.ok) throw new Error("Logout request failed.");
      window.location.replace("/index.html");
    } catch (error) {
      feedback.textContent = error.message || "Could not log out.";
      feedback.classList.add("is-error");
      button.disabled = false;
    }
  });

  void loadAccount();
})();
