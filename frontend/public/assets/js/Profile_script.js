/*
  Database API placeholders — change these to match your backend:
  GET    /api/profile       Load the logged-in student's saved profile
  PUT    /api/profile       Create/update profile fields in the database
  DELETE /api/profile       Clear profile (optional)
  POST   /logout            Sign out (change to your auth provider's route)
*/
const API_ENDPOINTS = {
  profile: "/api/profile",
  logout: "/logout"
};

const form = document.getElementById("profile-form");
const statusMessage = document.getElementById("status-message");
const name = "Mira Rao"; // Replace with authenticated user's name.
document.getElementById("profile-name").textContent = name;
document.getElementById("avatar-initials").textContent =
  name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0].toUpperCase()).join("") || "ST";

// Optional: load profile from your backend when the page opens.
async function loadProfile() {
  // Uncomment when your GET /api/profile endpoint is available.
  // try {
  //   const response = await fetch(API_ENDPOINTS.profile, { credentials: "include" });
  //   if (!response.ok) throw new Error("Could not load profile");
  //   const data = await response.json();
  //   Object.entries(data).forEach(([key, value]) => {
  //     const field = form.elements.namedItem(key);
  //     if (field && value != null) field.value = value;
  //   });
  // } catch (error) {
  //   statusMessage.textContent = "Could not load saved profile. You can still edit the form.";
  // }
}
loadProfile();

form.addEventListener("submit", async event => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(form).entries());
  const marks = data.marks === "" ? null : Number(data.marks);
  if (marks !== null && (marks < 0 || marks > 100)) {
    statusMessage.textContent = "Marks or percentage must be between 0 and 100.";
    return;
  }
  data.marks = marks;

  // Demo fallback: show feedback but do not pretend data was saved to a database.
  // Enable the fetch block once your backend endpoint is implemented:
  /*
  try {
    const response = await fetch(API_ENDPOINTS.profile, {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    });
    if (!response.ok) throw new Error("Save failed");
    statusMessage.textContent = "Profile saved successfully.";
  } catch (error) {
    statusMessage.textContent = "Unable to save profile. Please try again.";
  }
  */
  statusMessage.textContent = "Form validated. Connect PUT /api/profile to save these details to your database.";
});

form.addEventListener("reset", () => {
  statusMessage.textContent = "Changes cleared from the form.";
});

document.getElementById("logout-button").addEventListener("click", () => {
  if (confirm("Do you want to log out?")) {
    // Replace this navigation with your real authentication sign-out flow.
    window.location.href = API_ENDPOINTS.logout;
  }
});
