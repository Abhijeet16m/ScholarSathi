// ---------- Tabs ----------
function showTab(name) {
  document.getElementById("panelProfile").classList.toggle("active", name === "profile");
  document.getElementById("panelDocs").classList.toggle("active", name === "docs");
  document.getElementById("tabProfile").classList.toggle("active", name === "profile");
  document.getElementById("tabDocs").classList.toggle("active", name === "docs");
}
document.getElementById("tabProfile").onclick = () => showTab("profile");
document.getElementById("tabDocs").onclick = () => showTab("docs");

// ---------- Profile form (built from PROFILE_FIELDS in config.js) ----------
const formBox = document.getElementById("profileForm");

function buildProfileForm() {
  PROFILE_FIELDS.forEach((f) => {
    const label = document.createElement("label");
    label.textContent = f.label;
    label.htmlFor = "p_" + f.key;

    let input;
    if (f.type === "select") {
      input = document.createElement("select");
      const blank = document.createElement("option");
      blank.value = "";
      blank.textContent = "-- Select --";
      input.appendChild(blank);
      f.options.forEach(([value, text]) => {
        const o = document.createElement("option");
        o.value = value;
        o.textContent = text;
        input.appendChild(o);
      });
    } else {
      input = document.createElement("input");
      input.type = f.type;
      if (f.type === "number") input.step = "any";
    }
    input.id = "p_" + f.key;
    formBox.appendChild(label);
    formBox.appendChild(input);
  });
}

async function loadProfile() {
  const profile = await getProfile();
  PROFILE_FIELDS.forEach((f) => {
    document.getElementById("p_" + f.key).value = profile[f.key] || "";
  });
}

document.getElementById("saveProfile").onclick = async () => {
  const profile = {};
  PROFILE_FIELDS.forEach((f) => {
    const v = document.getElementById("p_" + f.key).value.trim();
    if (v) profile[f.key] = v;
  });
  await saveProfile(profile);
  const msg = document.getElementById("saveMsg");
  msg.textContent = "Saved";
  setTimeout(() => (msg.textContent = ""), 2000);
};

document.getElementById("clearProfile").onclick = async () => {
  await saveProfile({});
  loadProfile();
};

// ---------- Documents (built from DOC_TYPES in config.js) ----------
function formatSize(bytes) {
  return bytes > 1024 * 1024 ? (bytes / 1024 / 1024).toFixed(1) + " MB" : Math.round(bytes / 1024) + " KB";
}

async function refreshDoc(box) {
  const type = box.dataset.type;
  const status = box.querySelector(".status");
  const doc = await getDoc(type);
  status.textContent = "";
  if (doc) {
    status.className = "status saved";
    status.textContent = "Saved: " + doc.name + " (" + formatSize(doc.blob.size) + ")";
    const del = document.createElement("button");
    del.textContent = "Remove";
    del.onclick = async () => { await deleteDoc(type); refreshDoc(box); };
    status.appendChild(del);
  } else {
    status.className = "status none";
    status.textContent = "Nothing saved yet";
  }
}

function buildDocList() {
  const list = document.getElementById("docList");
  DOC_TYPES.forEach((d) => {
    const box = document.createElement("div");
    box.className = "doc";
    box.dataset.type = d.type;
    const h = document.createElement("h4");
    h.textContent = d.label;
    const input = document.createElement("input");
    input.type = "file";
    input.accept = d.accept;
    const status = document.createElement("div");
    status.className = "status";
    box.appendChild(h);
    box.appendChild(input);
    box.appendChild(status);
    list.appendChild(box);

    input.addEventListener("change", async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      await saveDoc(d.type, file);
      e.target.value = "";
      refreshDoc(box);
    });
    refreshDoc(box);
  });
}

buildProfileForm();
loadProfile();
buildDocList();
