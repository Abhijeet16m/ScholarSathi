function renderStudentName(value) {
  const fullName = String(value || "Student").trim() || "Student";
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
}

renderStudentName("Student");
fetch("/api/auth/me", { credentials: "same-origin" })
  .then(response => {
    if (!response.ok) throw new Error("Student session is no longer active.");
    return response.json();
  })
  .then(student => renderStudentName(student.name))
  .catch(() => { window.location.href = "/index.html"; });

// Sends a POST request to the Express logout route.
document.getElementById("logout-button").addEventListener("click", async () => {
  if (!window.confirm("Do you want to log out?")) return;

  try {
    const response = await fetch("/api/auth/logout", {
      method: "POST",
      credentials: "include"
    });
    if (!response.ok) throw new Error("Logout request failed.");
    window.location.href = "/";
  } catch (error) {
    console.error(error);
    window.alert("Could not log out. Please try again.");
  }
});



