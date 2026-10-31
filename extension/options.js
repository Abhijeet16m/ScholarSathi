const profileForm = document.getElementById("profile-form");
const profileFields = document.getElementById("profile-fields");
const profileStatus = document.getElementById("profile-status");
const documentsRoot = document.getElementById("documents");
const docStatus = document.getElementById("doc-status");
const MAX_BYTES = 10 * 1024 * 1024;

function makeProfileInput(field, value = "") {
  const label = document.createElement("label");
  label.textContent = field.label;
  const input = document.createElement("input");
  input.name = field.key;
  input.autocomplete = "off";
  input.value = value;
  if (field.key === "dob") input.type = "date";
  else if (["familyIncome", "percentage", "courseYear"].includes(field.key)) input.type = "number";
  else if (field.key === "email") input.type = "email";
  else if (field.key === "mobile") { input.type = "tel"; input.inputMode = "numeric"; input.maxLength = 10; }
  else input.type = "text";
  if (field.key === "percentage") { input.min = "0"; input.max = "100"; input.step = "0.01"; }
  if (field.key === "courseYear") { input.min = "1"; input.max = "20"; input.step = "1"; }
  label.appendChild(input);
  return label;
}

async function loadProfileForm() {
  const profile = await getProfile();
  profileFields.replaceChildren(...PROFILE_FIELDS.map(field => makeProfileInput(field, profile[field.key] || "")));
}

profileForm.addEventListener("submit", async event => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(profileForm).entries());
  await saveProfile(data);
  profileStatus.textContent = "Profile saved in this Chrome profile.";
});

function formatSize(bytes) {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

async function refreshDocumentCard(card) {
  const type = card.dataset.type;
  const status = card.querySelector(".status");
  const doc = await getDoc(type);
  status.replaceChildren();
  if (!doc) {
    status.textContent = "No document saved in this Chrome profile.";
    status.className = "status";
    return;
  }
  status.className = "status saved";
  status.append(document.createTextNode(`Saved: ${doc.name} (${formatSize(doc.blob.size)}) `));
  const remove = document.createElement("button");
  remove.type = "button";
  remove.textContent = "Remove";
  remove.addEventListener("click", async () => {
    await deleteDoc(type);
    await refreshDocumentCard(card);
  });
  status.appendChild(remove);
}

function makeDocumentCard(docType) {
  const card = document.createElement("section");
  card.className = "doc";
  card.dataset.type = docType.type;
  const heading = document.createElement("h3");
  heading.textContent = docType.label;
  const input = document.createElement("input");
  input.type = "file";
  input.accept = docType.accept;
  const status = document.createElement("p");
  status.className = "status";
  status.textContent = "Loading…";
  input.addEventListener("change", async () => {
    const file = input.files?.[0];
    if (!file) return;
    if (file.size > MAX_BYTES) {
      docStatus.textContent = `${file.name} is larger than 10 MB.`;
      docStatus.className = "status error";
      input.value = "";
      return;
    }
    if (!["application/pdf", "image/jpeg", "image/png"].includes(file.type) || !docType.accept.split(",").includes(file.type)) {
      docStatus.textContent = "Choose a PDF, JPG, or PNG allowed for this document type.";
      docStatus.className = "status error";
      input.value = "";
      return;
    }
    try {
      await saveDoc(docType.type, file);
      input.value = "";
      docStatus.textContent = "Saved locally in this Chrome profile.";
      docStatus.className = "status saved";
      await refreshDocumentCard(card);
    } catch (error) {
      docStatus.textContent = `Could not save document: ${error.message}`;
      docStatus.className = "status error";
    }
  });
  card.append(heading, input, status);
  refreshDocumentCard(card);
  return card;
}

documentsRoot.replaceChildren(...DOC_TYPES.map(makeDocumentCard));
loadProfileForm().catch(error => { profileStatus.textContent = `Could not load profile: ${error.message}`; });
