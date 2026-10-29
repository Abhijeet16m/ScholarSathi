/*
  Route placeholders:
  Open checklist -> documents.html (frontend page)
  Optional API to retrieve application data: GET /api/applications
  Optional API to open a specific application's checklist: GET /api/applications/:id/checklist
  Logout: /logout (replace with your authentication provider's sign-out route)
*/
const ENDPOINTS = {
  checklistPage: "documents.html",
  checklistApi: "/api/applications/udaan/checklist",
  logout: "/logout"
};

document.getElementById("logout-button").addEventListener("click", () => {
  if (window.confirm("Do you want to log out?")) {
    window.location.href = ENDPOINTS.logout;
  }
});

// Open checklist connects directly to the Documents webpage.
// Change ENDPOINTS.checklistPage to your real documents route if it differs.
document.getElementById("open-checklist").href = ENDPOINTS.checklistPage;

// If your documents page needs the selected application, you can instead use:
// document.getElementById("open-checklist").href = `${ENDPOINTS.checklistPage}?application=udaan`;
// The API placeholder is available for fetching checklist data from your backend.
