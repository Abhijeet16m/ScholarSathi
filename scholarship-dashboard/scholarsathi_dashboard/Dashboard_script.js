/*
  Update these page paths to match your app's routes.
  The dashboard uses ordinary links so it can connect to separate HTML pages or be
  adapted to a router such as React Router / Next.js.
*/
const profile = {
  fullName: "Mira Rao"
};

const fullName = profile.fullName.trim();
const firstName = fullName.split(/\s+/)[0] || "Student";
const initials = fullName
  .split(/\s+/)
  .filter(Boolean)
  .slice(0, 2)
  .map(part => part[0].toUpperCase())
  .join("");

document.getElementById("greeting-name").textContent = firstName;
document.getElementById("profile-name").textContent = fullName;
document.getElementById("avatar-initials").textContent = initials || "ST";

// Replace this with your real logout endpoint or authentication-provider sign-out.
// Example: window.location.href = "/api/auth/logout";
document.getElementById("logout-button").addEventListener("click", () => {
  const confirmed = window.confirm("Do you want to log out?");
  if (!confirmed) return;

  // Placeholder endpoint: change this to your actual logout route.
  window.location.href = "/logout";
});
