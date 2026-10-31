import { shrinkPdf } from "./pdfshrink.js";

// ---------------------------------------------------------------
// 1. TEST DATA (still hard-coded; a real profile comes later)
// ---------------------------------------------------------------
const profile = {
  fullName: "Rahul Sharma",
  dob: "2005-08-15",
  category: "OBC",
  state: "Madhya Pradesh"
};

// ---------------------------------------------------------------
// 2. THE "MAPPING": which field on the page gets what.
//    Real portals have rules like these. Later we load them from our server.
// ---------------------------------------------------------------
const mapping = {
  textFields: [
    { selector: "#fullName", value: profile.fullName },
    { selector: "#dob",      value: profile.dob },
    { selector: "#category", value: profile.category },
    { selector: "#state",    value: profile.state }
  ],
  fileFields: [
    // docType = which saved document to use; the rest are the portal's rules
    { selector: "#photo",     docType: "photo",      label: "Photo",
      rule: { format: "jpeg", maxKB: 50, width: 200, height: 230 } },
    { selector: "#signature", docType: "signature",  label: "Signature",
      rule: { format: "jpeg", maxKB: 30, width: 140, height: 60 } },
    { selector: "#incomeCert", docType: "incomeCert", label: "Income certificate",
      rule: { format: "pdf", maxKB: 200 } }
  ]
};

// ---------------------------------------------------------------
// 3. IMAGE RESIZER: makes a picture the right size and under the KB limit
// ---------------------------------------------------------------
function canvasToBlob(canvas, quality) {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
}

async function fitImage(blob, rule) {
  const bitmap = await createImageBitmap(blob);
  const w = rule.width || bitmap.width;
  const h = rule.height || bitmap.height;

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";            // white background (JPEG has no transparency)
  ctx.fillRect(0, 0, w, h);

  // "Cover" the box without stretching: scale up, then crop the extra edges
  const scale = Math.max(w / bitmap.width, h / bitmap.height);
  const drawW = bitmap.width * scale;
  const drawH = bitmap.height * scale;
  ctx.drawImage(bitmap, (w - drawW) / 2, (h - drawH) / 2, drawW, drawH);

  // Try different JPEG qualities until the file is small enough
  let low = 0.05, high = 0.95, best = null;
  for (let i = 0; i < 8; i++) {
    const q = (low + high) / 2;
    const out = await canvasToBlob(canvas, q);
    if (out.size / 1024 <= rule.maxKB) { best = out; low = q; }  // fits: try better quality
    else { high = q; }                                            // too big: lower quality
  }
  return best;   // null means it could not be made small enough
}

function blobToDataUrl(blob) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(blob);
  });
}

function kb(bytes) { return Math.round(bytes / 1024) + " KB"; }

// ---------------------------------------------------------------
// 4. PREPARE FILES: for each file field, get the saved doc and fit it
// ---------------------------------------------------------------
async function prepareFiles() {
  const ready = [];     // files to attach: { selector, name, dataUrl }
  const messages = [];  // what we tell the student

  for (const f of mapping.fileFields) {
    const doc = await getDoc(f.docType);
    if (!doc) {
      messages.push({ cls: "warn", text: f.label + ": not saved yet" });
      continue;
    }

    let finalBlob, finalName;

    if (f.rule.format === "jpeg") {
      finalBlob = await fitImage(doc.blob, f.rule);
      if (!finalBlob) {
        messages.push({ cls: "bad", text: f.label + ": could not shrink below " + f.rule.maxKB + " KB" });
        continue;
      }
      finalName = f.docType + ".jpg";
      messages.push({ cls: "ok", text: f.label + ": " + kb(doc.blob.size) + " \u2192 " + kb(finalBlob.size) });
    } else {
      // PDFs: if already small enough, use as is. Otherwise shrink it.
      if (doc.blob.size / 1024 <= f.rule.maxKB) {
        finalBlob = doc.blob;
        finalName = doc.name;
        messages.push({ cls: "ok", text: f.label + ": " + kb(finalBlob.size) + " (size OK)" });
      } else {
        document.getElementById("status").textContent = "Shrinking " + f.label + " (this can take a few seconds)...";
        const result = await shrinkPdf(doc.blob, f.rule.maxKB);
        if (result.error) {
          messages.push({ cls: "bad", text: f.label + ": " + result.error });
          continue;
        }
        finalBlob = result.blob;
        finalName = f.docType + ".pdf";
        messages.push({ cls: "ok", text: f.label + ": " + kb(doc.blob.size) + " \u2192 " + kb(finalBlob.size) + " (" + result.pages + " page(s))" });
      }
    }

    ready.push({ selector: f.selector, name: finalName, dataUrl: await blobToDataUrl(finalBlob) });
  }
  return { ready, messages };
}

// ---------------------------------------------------------------
// 5. THIS FUNCTION RUNS INSIDE THE WEB PAGE
//    It cannot see anything above, so everything it needs is passed in.
// ---------------------------------------------------------------
function fillPage(textFields, files) {
  function setValue(element, value) {
    const proto = Object.getPrototypeOf(element);
    const setter = Object.getOwnPropertyDescriptor(proto, "value").set;
    setter.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  }

  // Turn "data:image/jpeg;base64,AAAA..." back into a real File object
  function dataUrlToFile(dataUrl, name) {
    const [header, base64] = dataUrl.split(",");
    const mime = header.match(/:(.*?);/)[1];
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new File([bytes], name, { type: mime });
  }

  let textCount = 0, fileCount = 0;

  for (const f of textFields) {
    const el = document.querySelector(f.selector);
    if (el) { setValue(el, f.value); textCount++; }
  }

  for (const f of files) {
    const input = document.querySelector(f.selector);
    if (input) {
      // Browsers don't let scripts type a file path, but they DO allow
      // handing the input a File object through a DataTransfer.
      const transfer = new DataTransfer();
      transfer.items.add(dataUrlToFile(f.dataUrl, f.name));
      input.files = transfer.files;
      input.dispatchEvent(new Event("change", { bubbles: true }));
      fileCount++;
    }
  }
  return { textCount, fileCount };
}

// ---------------------------------------------------------------
// 6. BUTTONS
// ---------------------------------------------------------------
document.getElementById("docsBtn").addEventListener("click", () => chrome.runtime.openOptionsPage());

document.getElementById("fillBtn").addEventListener("click", async () => {
  const status = document.getElementById("status");
  status.innerHTML = "Working...";
  try {
    const { ready, messages } = await prepareFiles();
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: fillPage,
      args: [mapping.textFields, ready]
    });
    const r = results[0].result;
    status.innerHTML = "";
    const first = document.createElement("div");
    first.textContent = "Filled " + r.textCount + " field(s), attached " + r.fileCount + " file(s).";
    first.style.fontWeight = "bold";
    status.appendChild(first);
    messages.forEach((m) => {
      const line = document.createElement("div");
      line.className = m.cls;
      line.textContent = m.text;
      status.appendChild(line);
    });
  } catch (error) {
    status.innerHTML = "";
    const line = document.createElement("div");
    line.className = "bad";
    line.textContent = "Could not fill this page: " + error.message;
    status.appendChild(line);
  }
});
