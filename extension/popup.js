import { shrinkPdf } from "./pdfshrink.js";

const status = document.getElementById("status");
const profileName = document.getElementById("profile-name");

function showLine(kind, message) {
  const line = document.createElement("div");
  line.className = kind;
  line.textContent = message;
  status.appendChild(line);
}

const profileLabels = {
  fullName: /student name|applicant name|full name|name of student|name of applicant|candidate name|\bname\b/i,
  fatherName: /father|guardian/i,
  motherName: /mother/i,
  dob: /date of birth|birth date|dob/i,
  gender: /gender|sex/i,
  category: /category|caste|community/i,
  state: /domicile state|state of domicile|permanent state|residential state|\bstate\b/i,
  district: /district/i,
  mobile: /mobile|phone|contact number/i,
  email: /email/i,
  familyIncome: /annual family income|family income|parental income|household income/i,
  percentage: /percentage|percent|marks obtained|aggregate marks|last exam marks/i,
  courseYear: /current year|year of study|study year|course year/i,
  course: /course|stream|class name|degree/i,
  institution: /institution|school name|college name|university name/i,
  parentOccupation: /parent occupation|guardian occupation|father occupation|mother occupation/i
};

const documentLabels = [
  ["aadhaarCard", /aadhaar|aadhar|uidai/i],
  ["apaarId", /apaar|abc id|academic bank of credits/i],
  ["marksheet12", /12th|class\s*xii|hsc|higher secondary|intermediate.*marksheet/i],
  ["marksheet10", /10th|class\s*x(?!i)|ssc|secondary.*marksheet|matriculation/i],
  ["incomeCert", /income certificate|income proof|family income proof/i],
  ["domicileCert", /domicile|residence certificate/i],
  ["institutionCert", /bonafide|bona fide|institution certificate|study certificate/i],
  ["casteCert", /caste|category certificate|community certificate/i],
  ["bankPassbook", /bank passbook|bank account proof|cancelled cheque/i],
  ["signature", /signature/i],
  ["photo", /passport photo|photograph|student photo|applicant photo/i],
  ["marksheet", /marksheet|mark sheet|transcript/i]
];

function scanPage() {
  const controls = [...document.querySelectorAll("input, select, textarea")];
  const fields = [];
  const files = [];
  let index = 0;
  for (const element of controls) {
    if (element.disabled || element.type === "hidden" || ["submit", "button", "reset", "password", "checkbox", "radio"].includes(element.type)) continue;
    if (element.getClientRects().length === 0) continue;
    const id = `ssa-${Date.now()}-${index++}`;
    element.setAttribute("data-scholar-assist-id", id);
    const associated = element.id ? document.querySelector(`label[for="${CSS.escape(element.id)}"]`)?.innerText : "";
    const label = [associated, element.closest("label")?.innerText, element.getAttribute("aria-label"), element.placeholder, element.name, element.id]
      .filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
    if (element.type === "file") {
      files.push({ id, label, accept: element.accept || "", hint: element.parentElement?.innerText || "" });
    } else if (label) {
      fields.push({ id, label, kind: element.tagName.toLowerCase(), type: element.type || "text" });
    }
  }
  return { fields, files };
}

function fitImage(blob, rule) {
  return new Promise(async resolve => {
    try {
      const bitmap = await createImageBitmap(blob);
      const scale = Math.min(1, (rule.width || bitmap.width) / bitmap.width, (rule.height || bitmap.height) / bitmap.height);
      const width = Math.max(1, Math.round(bitmap.width * scale));
      const height = Math.max(1, Math.round(bitmap.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      context.fillStyle = "#fff";
      context.fillRect(0, 0, width, height);
      context.drawImage(bitmap, 0, 0, width, height);
      let low = 0.08, high = 0.92, best = null;
      for (let i = 0; i < 9; i++) {
        const quality = (low + high) / 2;
        const output = await new Promise(done => canvas.toBlob(done, "image/jpeg", quality));
        if (output && output.size / 1024 <= rule.maxKB) { best = output; low = quality; }
        else high = quality;
      }
      resolve(best);
    } catch { resolve(null); }
  });
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error("Could not read prepared file."));
    reader.readAsDataURL(blob);
  });
}

function matchProfileKey(label) {
  // More specific patterns go first so "district state" doesn't match state.
  if (profileLabels.district.test(label)) return "district";
  if (profileLabels.parentOccupation.test(label)) return "parentOccupation";
  return Object.entries(profileLabels).find(([key, pattern]) => key !== "district" && pattern.test(label))?.[0] || null;
}

function matchDocumentType(label) {
  return documentLabels.find(([, pattern]) => pattern.test(label))?.[0] || null;
}

function maxSizeKb(field) {
  const hint = `${field.hint} ${field.label}`;
  const match = hint.match(/(?:max(?:imum)?\s*)?(\d+(?:\.\d+)?)\s*(kb|mb)\b/i);
  if (match) return Number(match[1]) * (match[2].toLowerCase() === "mb" ? 1024 : 1);
  if (field.type === "photo") return 50;
  if (field.type === "signature") return 30;
  return null;
}

async function prepareForField(type, field) {
  const doc = await getDoc(type);
  if (!doc) return { warning: `${DOC_TYPES.find(item => item.type === type)?.label || type}: not saved yet.` };
  const limit = maxSizeKb({ ...field, type });
  let blob = doc.blob;
  let name = doc.name;

  if (limit && blob.size / 1024 > limit && doc.mime.startsWith("image/")) {
    const dimensions = type === "photo" ? { width: 200, height: 230, maxKB: limit } :
      type === "signature" ? { width: 300, height: 120, maxKB: limit } :
      { width: 1200, height: 1600, maxKB: limit };
    const compressed = await fitImage(blob, dimensions);
    if (!compressed) return { error: `${DOC_TYPES.find(item => item.type === type)?.label || type}: could not compress under ${limit} KB.` };
    blob = compressed;
    name = `${type}.jpg`;
  } else if (limit && blob.size / 1024 > limit && doc.mime === "application/pdf") {
    const result = await shrinkPdf(blob, limit);
    if (result.error) return { error: `${DOC_TYPES.find(item => item.type === type)?.label || type}: ${result.error}` };
    blob = result.blob;
    name = `${type}.pdf`;
  }

  return { file: { id: field.id, name, dataUrl: await blobToDataUrl(blob) }, note: `${name}: ${Math.round(doc.blob.size / 1024)} KB → ${Math.round(blob.size / 1024)} KB.` };
}

function applyValues(profile, files, overwrite) {
  const patterns = {
    fullName: /student name|applicant name|full name|name of student|name of applicant|candidate name|\bname\b/i,
    fatherName: /father|guardian/i, motherName: /mother/i,
    dob: /date of birth|birth date|dob/i, gender: /gender|sex/i,
    category: /category|caste|community/i,
    state: /domicile state|state of domicile|permanent state|residential state|\bstate\b/i,
    district: /district/i, mobile: /mobile|phone|contact number/i, email: /email/i,
    familyIncome: /annual family income|family income|parental income|household income/i,
    percentage: /percentage|percent|marks obtained|aggregate marks|last exam marks/i,
    courseYear: /current year|year of study|study year|course year/i,
    course: /course|stream|class name|degree/i,
    institution: /institution|school name|college name|university name/i,
    parentOccupation: /parent occupation|guardian occupation|father occupation|mother occupation/i
  };
  function keyForLabel(label) {
    if (/district/i.test(label)) return "district";
    if (patterns.parentOccupation.test(label)) return "parentOccupation";
    if (patterns.courseYear.test(label)) return "courseYear";
    if (/father|guardian/i.test(label)) return "fatherName";
    if (/mother/i.test(label)) return "motherName";
    for (const key of ["fullName", "dob", "gender", "category", "state", "mobile", "email", "familyIncome", "percentage", "institution", "course"]) {
      if (patterns[key].test(label)) return key;
    }
    return null;
  }
  function setValue(element, value) {
    const descriptor = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), "value");
    if (descriptor?.set) descriptor.set.call(element, value);
    else element.value = value;
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  }
  function comparable(value) { return String(value || "").toLowerCase().replace(/[^a-z0-9]/g, ""); }
  function optionAliases(value) {
    const raw = String(value || "");
    const alias = { GEN: ["general"], OBC: ["obc", "obcncl", "sebc"],
      SC: ["sc", "scheduledcaste"], ST: ["st", "scheduledtribe"], EWS: ["ews"],
      female: ["f", "woman"], male: ["m", "man"] }[raw] || [];
    return new Set([comparable(raw), ...alias.map(comparable)]);
  }
  function toFile(dataUrl, name) {
    const [header, content] = dataUrl.split(",");
    const mime = header.match(/:(.*?);/)[1];
    const binary = atob(content);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new File([bytes], name, { type: mime });
  }

  let filled = 0, skipped = 0, attached = 0;
  for (const [key, value] of Object.entries(profile)) {
    if (!value) continue;
    const pattern = patterns[key];
    if (!pattern) continue;
    const target = [...document.querySelectorAll("[data-scholar-assist-id]")]
      .find(element => {
        if (element.type === "file") return false;
        const label = [element.labels?.[0]?.innerText, element.getAttribute("aria-label"), element.placeholder, element.name, element.id]
          .filter(Boolean).join(" ");
        return keyForLabel(label) === key;
      });
    if (!target) continue;
    if (!overwrite && String(target.value || "").trim()) { skipped++; continue; }
    if (target.tagName === "SELECT") {
      const desired = optionAliases(value);
      const option = [...target.options].find(item => desired.has(comparable(item.value)) || desired.has(comparable(item.textContent)));
      if (!option) continue;
      setValue(target, option.value);
    } else setValue(target, value);
    filled++;
  }

  for (const prepared of files) {
    const input = document.querySelector(`[data-scholar-assist-id="${prepared.id}"]`);
    if (!input || (input.files?.length && !overwrite)) { if (input) skipped++; continue; }
    const transfer = new DataTransfer();
    transfer.items.add(toFile(prepared.dataUrl, prepared.name));
    input.files = transfer.files;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    attached++;
  }
  return { filled, skipped, attached };
}

async function showProfileName() {
  const profile = await getProfile();
  profileName.textContent = profile.fullName ? `Profile: ${profile.fullName}` : "No profile synced yet";
}

document.getElementById("docsBtn").addEventListener("click", () => chrome.runtime.openOptionsPage());
document.getElementById("fillBtn").addEventListener("click", async () => {
  status.replaceChildren();
  showLine("", "Looking for matching fields and saved documents…");
  try {
    const profile = await getProfile();
    if (!Object.keys(profile).length) throw new Error("No profile saved yet. Sign in to ScholarSathi in this Chrome profile or enter a profile in the extension settings.");
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !/^https?:/.test(tab.url || "")) throw new Error("Open a normal website tab first.");
    const scans = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: scanPage });
    const scan = scans[0]?.result || { fields: [], files: [] };
    const knownFields = scan.fields.filter(field => matchProfileKey(field.label));
    const prepared = [];
    for (const field of scan.files) {
      const type = matchDocumentType(`${field.label} ${field.hint}`);
      if (!type) continue;
      const result = await prepareForField(type, field);
      if (result.file) prepared.push(result.file);
      if (result.warning) showLine("warn", result.warning);
      if (result.error) showLine("bad", result.error);
      if (result.note) showLine("ok", result.note);
    }
    const outcome = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: applyValues,
      args: [profile, prepared, document.getElementById("overwrite").checked]
    });
    const result = outcome[0]?.result || { filled: 0, skipped: 0, attached: 0 };
    showLine("ok", `Filled ${result.filled} field(s), attached ${result.attached} file(s).`);
    if (result.skipped) showLine("warn", `Left ${result.skipped} field(s) or file(s) unchanged.`);
    if (!knownFields.length && !scan.files.length) showLine("warn", "No recognizable student fields were found on this page.");
    showLine("", "Review every value and attachment, then submit the scholarship form yourself.");
  } catch (error) {
    status.replaceChildren();
    showLine("bad", `Could not fill this page: ${error.message}`);
  }
});

showProfileName().catch(error => { profileName.textContent = `Profile unavailable: ${error.message}`; });
