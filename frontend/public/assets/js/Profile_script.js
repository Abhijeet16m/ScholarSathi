const form = document.getElementById("profile-form");
const statusMessage = document.getElementById("status-message");

const formFieldMap = {
  father_name: "fatherName",
  mother_name: "motherName",
  date_of_birth: "dob",
  gender: "gender",
  category: "category",
  domicile_state: "state",
  district: "district",
  mobile_number: "mobile",
  annual_family_income: "familyIncome",
  qualification_level: "qualificationLevel",
  qualification_marks: "percentage",
  course_level: "courseLevel",
  course_name: "course",
  course_year: "courseYear",
  entrance_exam_rank: "entranceRank",
  institution_name: "institution",
  parent_occupation: "parentOccupation",
  has_disability: "hasDisability",
  is_orphan: "isOrphan",
  receives_other_scholarship: "receivesOtherScholarship"
};

function updateStudentIdentity(student) {
  const fullName = String(student.name || "Student").trim() || "Student";
  const initials = fullName.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0].toUpperCase()).join("") || "ST";
  for (const [id, value] of [["profile-name", fullName], ["sidebar-name", fullName], ["avatar-initials", initials], ["sidebar-initials", initials]]) {
    const element = document.getElementById(id);
    if (element) element.textContent = value;
  }
  const nameField = form?.elements.namedItem("name");
  const emailField = form?.elements.namedItem("email");
  if (nameField) nameField.value = fullName;
  if (emailField) emailField.value = student.email || student.profile?.email || "";
}

function fillForm(profile) {
  for (const [fieldName, profileKey] of Object.entries(formFieldMap)) {
    const field = form.elements.namedItem(fieldName);
    if (!field) continue;
    // Current API responses use camelCase aliases. Keep database-style
    // snake_case as a fallback so an older deployed API response still fills
    // the form instead of silently leaving populated fields blank.
    const aliasedValue = profile[profileKey];
    const value = aliasedValue === undefined || aliasedValue === null || aliasedValue === ""
      ? profile[fieldName]
      : aliasedValue;
    if (fieldName === "domicile_state" && value) {
      const savedState = String(value);
      if (![...field.options].some(option => option.value === savedState)) {
        field.add(new Option(`${savedState} (saved value)`, savedState));
      }
      field.value = savedState;
      continue;
    }
    if (fieldName === "has_disability" || fieldName === "is_orphan" || fieldName === "receives_other_scholarship") {
      field.value = value === "Yes" ? "true" : value === "No" ? "false" : "";
    } else {
      field.value = value == null ? "" : fieldName === "date_of_birth" ? String(value).slice(0, 10) : String(value);
    }
  }
}

async function readJson(response) {
  try { return await response.json(); } catch { return {}; }
}

async function syncProfileToExtension(profile) {
  if (!window.ScholarSathiExtension) return "Profile loaded from your ScholarSathi account.";
  const result = await window.ScholarSathiExtension.request("SAVE_PROFILE", { profile });
  return "Profile loaded from your account and synced " + result.fields + " fields to Scholar Assist.";
}

async function loadProfile() {
  statusMessage.textContent = "Loading your saved profile…";
  const response = await fetch("/api/auth/me", {
    credentials: "same-origin",
    headers: { Accept: "application/json" }
  });
  if (response.status === 401) {
    window.location.replace("/");
    return;
  }
  const result = await readJson(response);
  if (!response.ok || !result.profile) {
    throw new Error(result.error || "Could not load your profile.");
  }
  updateStudentIdentity(result);
  fillForm(result.profile);
  try {
    statusMessage.textContent = await syncProfileToExtension(result.profile);
  } catch (error) {
    statusMessage.textContent = "Profile loaded from your account, but extension sync failed: " + error.message;
  }
}

form.addEventListener("submit", async event => {
  event.preventDefault();
  if (!form.reportValidity()) return;

  const saveButton = form.querySelector('button[type="submit"]');
  saveButton.disabled = true;
  statusMessage.textContent = "Saving your profile…";
  try {
    const body = new URLSearchParams(new FormData(form));
    const response = await fetch("/api/auth/profile", {
      method: "POST",
      credentials: "same-origin",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8"
      },
      body
    });
    if (response.status === 401) {
      window.location.replace("/");
      return;
    }
    const result = await readJson(response);
    if (!response.ok || !result.profile) throw new Error(result.error || "Could not save your profile.");
    updateStudentIdentity(result);
    fillForm(result.profile);
    try {
      statusMessage.textContent = await syncProfileToExtension(result.profile);
    } catch (error) {
      statusMessage.textContent = "Profile saved to your account, but extension sync failed: " + error.message;
    }
  } catch (error) {
    statusMessage.textContent = error.message;
  } finally {
    saveButton.disabled = false;
  }
});

document.getElementById("reload-profile").addEventListener("click", () => {
  loadProfile().catch(error => { statusMessage.textContent = error.message; });
});

document.getElementById("logout-button").addEventListener("click", async () => {
  if (!window.confirm("Do you want to log out?")) return;
  const logoutButton = document.getElementById("logout-button");
  logoutButton.disabled = true;
  try {
    const response = await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" });
    if (!response.ok) throw new Error("Logout request failed.");
    window.location.replace("/");
  } catch (error) {
    statusMessage.textContent = error.message;
    logoutButton.disabled = false;
  }
});

loadProfile().catch(error => {
  statusMessage.textContent = error.message;
});
