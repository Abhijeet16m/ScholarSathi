(() => {
  const sidebar = document.querySelector(".app-shell > .sidebar, body > .sidebar");
  const topbar = document.querySelector(".topbar");
  if (!sidebar || !topbar || !topbar.firstElementChild) return;

  const title = topbar.firstElementChild;
  const titleGroup = document.createElement("div");
  titleGroup.className = "topbar-title-group";
  topbar.insertBefore(titleGroup, title);
  const toggle = document.createElement("button");
  toggle.className = "workspace-menu-toggle";
  toggle.type = "button";
  toggle.setAttribute("aria-label", "Open navigation menu");
  toggle.setAttribute("aria-controls", "student-navigation");
  toggle.setAttribute("aria-expanded", "false");
  toggle.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/></svg>';
  titleGroup.append(toggle, title);
  sidebar.id = "student-navigation";

  const scrim = document.createElement("button");
  scrim.className = "workspace-menu-scrim";
  scrim.type = "button";
  scrim.setAttribute("aria-label", "Close navigation menu");
  document.body.append(scrim);

  const mobile = window.matchMedia("(max-width: 760px)");
  const close = () => {
    document.body.classList.remove("workspace-menu-open", "workspace-sidebar-collapsed");
    toggle.setAttribute("aria-expanded", "false");
    toggle.setAttribute("aria-label", "Open navigation menu");
  };
  toggle.addEventListener("click", () => {
    const isOpen = document.body.classList.contains("workspace-menu-open");
    if (isOpen || document.body.classList.contains("workspace-sidebar-collapsed")) {
      close();
      return;
    }
    if (mobile.matches) document.body.classList.add("workspace-menu-open");
    else document.body.classList.add("workspace-sidebar-collapsed");
    toggle.setAttribute("aria-expanded", "true");
    toggle.setAttribute("aria-label", "Close navigation menu");
  });
  scrim.addEventListener("click", close);
  sidebar.addEventListener("click", event => {
    if (mobile.matches && event.target.closest("a")) close();
  });
  document.addEventListener("keydown", event => {
    if (event.key === "Escape") close();
  });
  mobile.addEventListener("change", close);

  const badge = document.querySelector("#application-count, [data-application-count]");
  if (badge) {
    fetch("/api/applications", { credentials: "same-origin", headers: { Accept: "application/json" } })
      .then(response => response.ok ? response.json() : null)
      .then(data => {
        if (Array.isArray(data?.applications)) badge.textContent = String(data.applications.length);
      })
      .catch(() => {});
  }
})();
