/*
  Local data clear:
  - Removes known ScholarSathi profile keys from localStorage.
  - Clears sessionStorage too because prototype profile/session data may be kept there.
  - Optional backend endpoint: DELETE /api/profile (not called by default).
  Adjust STORAGE_KEYS to match the exact keys used by your existing app.
*/
const STORAGE_KEYS = [
  "scholarsathi_profile",
  "scholarSathiProfile",
  "studentProfile",
  "profile",
  "userProfile",
  "scholarsathi_user",
  "scholarsathi_documents",
  "scholarsathi_applications"
];

const API_ENDPOINTS = {
  clearProfile: "/api/profile",
  logout: "/logout"
};

const modal = document.getElementById("confirm-modal");
const clearButton = document.getElementById("clear-profile");
const cancelButton = document.getElementById("cancel-clear");
const confirmButton = document.getElementById("confirm-clear");
const feedback = document.getElementById("feedback");

function openConfirm() {
  modal.hidden = false;
  confirmButton.focus();
}
function closeConfirm() {
  modal.hidden = true;
  clearButton.focus();
}

clearButton.addEventListener("click", openConfirm);
cancelButton.addEventListener("click", closeConfirm);
modal.addEventListener("click", event => {
  if (event.target === modal) closeConfirm();
});
document.addEventListener("keydown", event => {
  if (event.key === "Escape" && !modal.hidden) closeConfirm();
});

confirmButton.addEventListener("click", () => {
  try {
    // Remove known profile/app data keys from local browser storage.
    STORAGE_KEYS.forEach(key => {
      localStorage.removeItem(key);
      sessionStorage.removeItem(key);
    });

    // If your app stores all prototype state in a dedicated storage namespace,
    // add its keys to STORAGE_KEYS. We deliberately do not clear unrelated
    // websites' browser data or every localStorage key.
    feedback.textContent = "Saved local profile data was cleared from this browser.";
    closeConfirm();
  } catch (error) {
    feedback.textContent = "The browser could not clear local data. Check browser storage permissions.";
    closeConfirm();
  }
});

// Optional backend integration: if you also store profile data on the server,
// call DELETE /api/profile here after confirmation. Implement authentication,
// authorization and CSRF protection server-side before enabling it.

document.getElementById("logout-button").addEventListener("click", () => {
  if (window.confirm("Do you want to log out?")) {
    window.location.href = API_ENDPOINTS.logout;
  }
});
