import { prepareFile, kb } from "./prepare.js";

const statusEl = document.getElementById("status");
const whoEl = document.getElementById("who");

function line(cls, text) {
  const d = document.createElement("div");
  d.className = cls;
  d.textContent = text;
  statusEl.appendChild(d);
}
const nameOf = (key) => (PROFILE_FIELDS.find((f) => f.key === key) || {}).label || key;
const docLabel = (type) => (DOC_TYPES.find((d) => d.type === type) || {}).label || type;

document.getElementById("manageBtn").onclick = () => chrome.runtime.openOptionsPage();

// Show whose profile is loaded
(async () => {
  const p = await getProfile();
  whoEl.textContent = p.fullName ? "Profile: " + p.fullName : "No profile yet. Click \"Edit my profile\" first.";
})();

document.getElementById("fillBtn").onclick = async () => {
  statusEl.textContent = "";
  try {
    const profile = await getProfile();
    if (!Object.keys(profile).length) {
      line("bad", "Your profile is empty. Click \"Edit my profile and documents\" and save your details first.");
      return;
    }
    const overwrite = document.getElementById("overwrite").checked;
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const allFrames = { tabId: tab.id, allFrames: true };

    // 1. put the engine into the page (and any frames inside it)
    await chrome.scripting.executeScript({ target: allFrames, files: ["autofill-engine.js"] });

    // 2. ask each frame which upload boxes it has and what rules they show
    const scans = await chrome.scripting.executeScript({ target: allFrames, func: () => window.__scholarAssist.scan() });

    // 3. prepare the documents each upload box needs
    const fileLines = [];
    const perFrame = {};
    const unknown = [];
    for (const s of scans) {
      if (!s.result) continue;
      perFrame[s.frameId] = {};
      unknown.push(...s.result.unknownFiles);
      for (const f of s.result.fileFields) {
        statusEl.textContent = "Preparing " + docLabel(f.docType) + "...";
        const doc = await getDoc(f.docType);
        if (!doc) { fileLines.push(["warn", docLabel(f.docType) + ": not saved yet (add it under My Documents)"]); continue; }
        const out = await prepareFile(doc, f.rule, f.accept, f.docType);
        if (out.error) { fileLines.push(["bad", docLabel(f.docType) + ": " + out.error]); continue; }
        const dataUrl = await new Promise((resolve) => {
          const r = new FileReader();
          r.onload = () => resolve(r.result);
          r.readAsDataURL(out.blob);
        });
        perFrame[s.frameId][f.idx] = { name: out.name, dataUrl };
        fileLines.push(["ok", docLabel(f.docType) + ": " + kb(doc.blob.size) + " \u2192 " + kb(out.blob.size)]);
      }
    }

    // 4. fill the fields and attach files, frame by frame
    const filled = [], hadValue = [], missing = [], problems = [];
    let attached = 0;
    for (const s of scans) {
      const res = await chrome.scripting.executeScript({
        target: { tabId: tab.id, frameIds: [s.frameId] },
        func: (p, f, o) => window.__scholarAssist.fill(p, f, o),
        args: [profile, perFrame[s.frameId] || {}, { overwrite }]
      });
      const r = res[0] && res[0].result;
      if (!r) continue;
      filled.push(...r.filled);
      hadValue.push(...r.hadValue);
      missing.push(...r.missing);
      problems.push(...r.problems);
      attached += r.files.filter((x) => x.ok).length;
    }

    // 5. tell the student what happened
    statusEl.textContent = "";
    line("head", "Filled " + filled.length + " field(s), attached " + attached + " file(s).");
    filled.forEach((x) => line("ok", "\u2713 " + nameOf(x.key) + "  (" + x.label + ")"));
    fileLines.forEach(([cls, text]) => line(cls, text));
    problems.forEach((x) => line("bad", nameOf(x.key) + ": " + x.msg));
    if (hadValue.length) line("info", "Left as typed: " + [...new Set(hadValue.map((x) => nameOf(x.key)))].join(", "));
    if (missing.length) line("warn", "Add to your profile: " + [...new Set(missing.map((x) => nameOf(x.key)))].join(", "));
    if (unknown.length) line("warn", "Upload box not recognised: " + [...new Set(unknown)].join(", "));

    const handled = new Set([...filled, ...hadValue, ...missing, ...problems].map((x) => x.key));
    const notFound = Object.keys(profile).filter((k) => !handled.has(k)).map(nameOf);
    if (notFound.length) line("warn", "Not found on this page: " + notFound.join(", "));
    line("info", "Please check every field, then press Submit yourself.");
  } catch (error) {
    statusEl.textContent = "";
    line("bad", "Could not fill this page: " + error.message);
  }
};
