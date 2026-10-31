// SMART FILL ENGINE
// This file is injected INTO the web page (and its frames) by the popup.
// It finds form fields, works out what each one is asking for by reading
// its label / placeholder / name, and fills it from the saved profile.
// It never clicks Submit, never touches password fields, and never
// handles captchas or OTPs.

(function () {
  if (window.__scholarAssist) return;       // already injected in this frame

  const state = { fileInputs: [] };         // remembers upload boxes between "scan" and "fill"
  const THRESHOLD = 13;                     // minimum match score to accept a guess

  // ------------------------------------------------------------------
  // 1. KEYWORDS: how each profile field / document is usually worded.
  //    "neg" = words that mean "this is NOT that field".
  //    Add new wordings here when you meet a portal that uses them.
  // ------------------------------------------------------------------
  const PARENT_NEG = ["occupation", "income", "mobile", "phone", "email", "aadhaar", "profession", "qualification", "contact"];

  const FIELD_DEFS = {
    fullName: {
      kw: ["full name", "student name", "candidate name", "applicant name", "name of student", "name of the student",
           "name of candidate", "name of the candidate", "name of applicant", "name of the applicant", "your name",
           "name as per", "छात्र का नाम", "नाम", "name"],
      neg: ["father", "mother", "guardian", "parent", "spouse", "school", "college", "institute", "institution",
            "university", "bank", "account", "holder", "branch", "user", "username", "course", "board", "nominee",
            "reference", "पिता", "माता"]
    },
    fatherName: {
      kw: ["father s name", "father name", "name of father", "name of the father", "fathers name", "father guardian name",
           "guardian name", "पिता का नाम", "पिता", "father"],
      neg: PARENT_NEG
    },
    motherName: {
      kw: ["mother s name", "mother name", "name of mother", "name of the mother", "mothers name", "माता का नाम", "माता", "mother"],
      neg: PARENT_NEG
    },
    dob: {
      kw: ["date of birth", "dob", "d o b", "birth date", "जन्म तिथि", "जन्मतिथि", "birth"],
      neg: ["place", "certificate", "state", "district", "city"]
    },
    gender: { kw: ["gender", "sex", "लिंग"], neg: [] },
    category: {
      kw: ["social category", "caste category", "reservation category", "category", "caste", "वर्ग", "श्रेणी"],
      neg: ["certificate", "number", "sub category", "subcategory", "disability", "pwd", "minority", "religion"]
    },
    state: {
      kw: ["state of domicile", "domicile state", "state", "राज्य"],
      neg: ["certificate", "board", "district", "city", "pin", "pincode", "statement", "school", "college"]
    },
    district: { kw: ["district", "dist", "जिला", "जिले"], neg: ["certificate", "board", "school", "college"] },
    mobile: {
      kw: ["mobile number", "mobile no", "mobile", "phone number", "phone", "contact number", "contact no", "whatsapp",
           "cell", "मोबाइल", "फोन"],
      neg: ["father", "mother", "parent", "guardian", "alternate", "alt", "otp", "emergency", "landline"]
    },
    email: {
      kw: ["email id", "email", "e mail", "mail id", "ईमेल"],
      neg: ["father", "mother", "parent", "guardian", "otp"]
    },
    familyIncome: {
      kw: ["annual family income", "family income", "annual income", "parental income", "parents income",
           "household income", "yearly income", "income", "वार्षिक आय", "आय"],
      neg: ["certificate", "number", "cert", "proof", "source", "tax", "itr", "father", "mother"]
    },
    percentage: {
      kw: ["percentage", "percent", "aggregate", "प्रतिशत"],
      neg: ["cgpa", "grade", "attendance"]
    }
  };

  const RADIO_KEYS = ["gender", "category"];   // fields that are often radio buttons

  const DOC_DEFS = {
    photo: {
      kw: ["passport size photograph", "passport size photo", "passport photo", "photograph", "photo", "passport size",
           "profile picture", "recent photo", "फोटो", "फोटोग्राफ"],
      neg: []
    },
    signature: { kw: ["signature", "sign", "हस्ताक्षर"], neg: [] },
    incomeCert: {
      kw: ["income certificate", "income proof", "income", "आय प्रमाण पत्र", "आय प्रमाण"],
      neg: []
    },
    casteCert: {
      kw: ["caste certificate", "category certificate", "community certificate", "caste", "जाति प्रमाण पत्र", "जाति प्रमाण"],
      neg: []
    },
    marksheet: {
      kw: ["marksheet", "mark sheet", "marks card", "previous marksheet", "result", "transcript", "grade card", "अंकसूची", "अंक पत्र"],
      neg: []
    }
  };

  // Different ways a dropdown / radio might word the same answer
  const SYNONYMS = {
    gender: {
      male: ["male", "m", "boy", "पुरुष"],
      female: ["female", "f", "girl", "महिला"],
      other: ["other", "transgender", "third gender"]
    },
    category: {
      GEN: ["general", "gen", "unreserved", "ur"],
      OBC: ["obc", "other backward class", "other backward classes", "other backward", "backward class"],
      SC: ["sc", "scheduled caste"],
      ST: ["st", "scheduled tribe"],
      EWS: ["ews", "economically weaker"]
    }
  };

  // ------------------------------------------------------------------
  // 2. TEXT HELPERS
  // ------------------------------------------------------------------
  // lower-case, punctuation -> spaces, padded so we only match WHOLE words
  const norm = (s) =>
    " " + String(s || "").toLowerCase().replace(/[^a-z0-9\u0900-\u097f]+/g, " ").trim() + " ";

  const splitCamel = (s) => String(s || "").replace(/([a-z])([A-Z])/g, "$1 $2");

  function scoreText(text, def, compact) {
    const t = norm(text);
    const tc = t.replace(/ /g, "");
    for (const n of def.neg || []) {
      if (t.includes(norm(n))) return 0;
      if (compact && n.length >= 4 && /^[a-z]+$/.test(n) && tc.includes(n)) return 0;
    }
    let best = 0;
    for (const kw of def.kw) {
      let hit = t.includes(norm(kw));
      if (!hit && compact && kw.includes(" ")) {
        const kc = kw.replace(/[^a-z0-9]/g, "");
        hit = kc.length >= 6 && tc.includes(kc);     // e.g. "fathername", "dateofbirth"
      }
      if (hit) best = Math.max(best, kw.split(" ").length * 10 + kw.length);  // longer phrase = better match
    }
    return best;
  }

  function fieldScore(label, idName, def) {
    let s = scoreText(label, def, false);
    if (s) s += 5;                                  // a visible label is more trustworthy than an id
    return Math.max(s, scoreText(idName, def, true));
  }

  function nearbyText(el) {
    const prev = el.previousElementSibling;
    if (prev && prev.textContent.trim() && prev.textContent.trim().length < 80) return prev.textContent;
    const td = el.closest("td");
    if (td && td.previousElementSibling) return td.previousElementSibling.textContent;
    // plain text just before the field (stops at a line break or another field)
    let txt = "";
    let n = el.previousSibling;
    while (n) {
      if (n.nodeType === 3) txt = n.textContent + txt;
      else if (n.nodeType === 1 && /^(BR|INPUT|SELECT|TEXTAREA|BUTTON)$/.test(n.tagName)) break;
      else if (n.nodeType === 1) txt = n.textContent + txt;
      n = n.previousSibling;
    }
    if (txt.trim()) return txt;
    return "";
  }

  // The words a human would read next to this field
  function labelOf(el) {
    const parts = [];
    if (el.labels) for (const l of el.labels) parts.push(l.textContent);
    const aria = el.getAttribute("aria-label");
    if (aria) parts.push(aria);
    const by = el.getAttribute("aria-labelledby");
    if (by) by.split(/\s+/).forEach((id) => { const n = document.getElementById(id); if (n) parts.push(n.textContent); });
    if (el.placeholder) parts.push(el.placeholder);
    if (el.title) parts.push(el.title);
    if (!parts.length || !parts.join("").trim()) parts.push(nearbyText(el));
    return parts.join(" ").replace(/\s+/g, " ").trim();
  }

  const shortLabel = (s) => String(s || "").replace(/\(.*?\)/g, "").replace(/\s+/g, " ").trim().slice(0, 40);

  function usable(el) {
    if (el.disabled || el.readOnly === true) return false;
    const type = (el.type || "").toLowerCase();
    if (type === "radio" || type === "file") return true;     // often visually hidden but still valid
    const style = getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden") return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }

  // ------------------------------------------------------------------
  // 3. FIND THE FIELDS ON THE PAGE
  // ------------------------------------------------------------------
  const TEXT_TYPES = ["text", "tel", "email", "number", "date", "search"];

  function collectFields() {
    const fields = [];

    document.querySelectorAll("input, textarea, select").forEach((el) => {
      const type = (el.type || "").toLowerCase();
      if (el.tagName === "INPUT" && !TEXT_TYPES.includes(type)) return;   // skips password, hidden, buttons, radio, file...
      if (!usable(el)) return;
      fields.push({
        el,
        kind: el.tagName === "SELECT" ? "select" : "text",
        label: labelOf(el),
        idName: splitCamel(el.name) + " " + splitCamel(el.id)
      });
    });

    // radio buttons come in groups sharing a name
    const groups = {};
    document.querySelectorAll("input[type=radio]").forEach((r) => {
      if (r.disabled) return;
      const key = (r.form ? "f" : "") + (r.name || "unnamed" + Object.keys(groups).length);
      (groups[key] = groups[key] || []).push(r);
    });
    Object.keys(groups).forEach((k) => {
      const radios = groups[k];
      const first = radios[0];
      const fieldset = first.closest("fieldset");
      const legend = fieldset && fieldset.querySelector("legend");
      const container = first.closest("fieldset, tr, p, div") || first.parentElement;
      let before = "";
      if (container) {
        for (const n of container.childNodes) {
          if (n === first || (n.contains && n.contains(first))) break;
          before += n.textContent + " ";
        }
      }
      const question = (legend ? legend.textContent : before) + " " + (container ? nearbyText(container) : "");
      fields.push({ el: first, radios, kind: "radio", label: question.replace(/\s+/g, " ").trim(), idName: splitCamel(first.name) });
    });

    return fields;
  }

  // ------------------------------------------------------------------
  // 4. DECIDE WHICH PROFILE FIELD GOES WHERE
  // ------------------------------------------------------------------
  function typeBonus(f, key) {
    const type = f.el.type;
    if (type === "email" && key === "email") return 50;
    if (type === "tel" && key === "mobile") return 30;
    if (type === "date" && key === "dob") return 40;
    return 0;
  }

  function assignFields(fields) {
    const candidates = [];
    fields.forEach((f, fi) => {
      Object.keys(FIELD_DEFS).forEach((key) => {
        if (f.kind === "radio" && !RADIO_KEYS.includes(key)) return;
        const s = fieldScore(f.label, f.idName, FIELD_DEFS[key]) + (fieldScore(f.label, f.idName, FIELD_DEFS[key]) ? typeBonus(f, key) : 0);
        if (s >= THRESHOLD) candidates.push({ fi, key, s });
      });
    });
    candidates.sort((a, b) => b.s - a.s);

    const usedFields = new Set();
    const usedKeys = new Set();
    const assignments = [];
    for (const c of candidates) {
      if (usedFields.has(c.fi) || usedKeys.has(c.key)) continue;   // one field <-> one profile value
      usedFields.add(c.fi);
      usedKeys.add(c.key);
      assignments.push({ f: fields[c.fi], key: c.key });
    }
    return assignments;
  }

  // ------------------------------------------------------------------
  // 5. PUT VALUES INTO FIELDS
  // ------------------------------------------------------------------
  function setNative(el, value) {
    const proto = el.tagName === "SELECT" ? HTMLSelectElement.prototype
                : el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype
                : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value").set.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    el.dispatchEvent(new Event("blur", { bubbles: true }));
  }

  function mark(el) {
    el.style.outline = "2px solid #2e7d32";      // green outline so the student can review
    el.style.outlineOffset = "1px";
  }

  function formatDate(iso, el) {
    const [y, m, d] = String(iso).split("-");
    if (!y || !m || !d) return iso;
    if (el.type === "date") return iso;
    const hint = (labelOf(el) + " " + (el.placeholder || "")).toLowerCase();
    let m1 = hint.match(/yyyy([\/\-.])mm[\/\-.]dd/);
    if (m1) return y + m1[1] + m + m1[1] + d;
    m1 = hint.match(/mm([\/\-.])dd[\/\-.]yyyy/);
    if (m1) return m + m1[1] + d + m1[1] + y;
    m1 = hint.match(/dd([\/\-.])mm/);
    const sep = m1 ? m1[1] : "/";
    return d + sep + m + sep + y;               // default: DD/MM/YYYY (most Indian portals)
  }

  function formatValue(key, value, f) {
    if (key === "dob") return formatDate(value, f.el);
    if (key === "mobile") return String(value).replace(/\D/g, "").slice(-10);
    return String(value);
  }

  function candidatesFor(key, value) {
    const syn = SYNONYMS[key] && SYNONYMS[key][value];
    return (syn || [value]).map((x) => norm(x));
  }

  function optionMatches(text, cands) {
    const t = norm(text);
    return cands.some((c) => t === c || t.includes(c));
  }

  function hasValue(f) {
    if (f.kind === "radio") return f.radios.some((r) => r.checked);
    if (f.kind === "select") return f.el.selectedIndex > 0 && f.el.value !== "";
    return f.el.value.trim() !== "";
  }

  function fillOne(f, key, rawValue, overwrite) {
    if (!overwrite && hasValue(f)) return "had_value";
    const cands = candidatesFor(key, rawValue);

    if (f.kind === "select") {
      const opts = [...f.el.options];
      let opt = opts.find((o) => cands.includes(norm(o.textContent)) || cands.includes(norm(o.value)));
      if (!opt) opt = opts.find((o) => o.value !== "" && optionMatches(o.textContent, cands));
      if (!opt) return "no_option";
      setNative(f.el, opt.value);
      mark(f.el);
      return "filled";
    }

    if (f.kind === "radio") {
      const radio = f.radios.find((r) => {
        const text = labelOf(r) || r.value;
        return optionMatches(text, cands) || optionMatches(r.value, cands);
      });
      if (!radio) return "no_option";
      radio.click();
      mark(radio.parentElement || radio);
      return "filled";
    }

    setNative(f.el, formatValue(key, rawValue, f));
    mark(f.el);
    return "filled";
  }

  // ------------------------------------------------------------------
  // 6. UPLOAD BOXES: find them, read their rules, attach files
  // ------------------------------------------------------------------
  function siblingHint(el) {
    let txt = "";
    [el.nextElementSibling, el.previousElementSibling].forEach((n) => {
      if (n && n.textContent && n.textContent.trim().length < 150) txt += " " + n.textContent;
    });
    return txt;
  }

  // Reads things like "JPG only, max 50 KB, 200 x 230 pixels" from the page
  function parseRule(accept, text) {
    const rule = { maxKB: null, width: null, height: null, format: "any", png: false };

    const sizes = [];
    const re = /(\d+(?:\.\d+)?)\s*(kb|mb)\b/gi;
    let m;
    while ((m = re.exec(text))) {
      const before = text.slice(Math.max(0, m.index - 10), m.index).toLowerCase();
      if (/min/.test(before)) continue;                      // ignore "min 20 KB"
      sizes.push(parseFloat(m[1]) * (m[2].toLowerCase() === "mb" ? 1024 : 1));
    }
    if (sizes.length) rule.maxKB = Math.max.apply(null, sizes);

    const d = text.match(/(\d{2,4})\s*(?:x|\u00d7|\*|by)\s*(\d{2,4})/i);
    if (d) { rule.width = parseInt(d[1], 10); rule.height = parseInt(d[2], 10); }

    const acc = String(accept || "").toLowerCase();
    const accPdf = /pdf/.test(acc);
    const accImg = /image|jpe?g|png/.test(acc);
    if (accPdf && !accImg) rule.format = "pdf";
    else if (accImg && !accPdf) rule.format = "image";
    else {
      const t = text.toLowerCase();
      const tPdf = /\bpdf\b/.test(t);
      const tImg = /\bjpe?g\b|\bpng\b/.test(t);
      if (tPdf && !tImg) rule.format = "pdf";
      else if (tImg && !tPdf) rule.format = "image";
    }
    if (/png/.test(acc) && !/jpe?g|image\/\*/.test(acc)) rule.png = true;
    return rule;
  }

  function scan() {
    state.fileInputs = [];
    const fileFields = [];
    const unknownFiles = [];

    document.querySelectorAll("input[type=file]").forEach((el) => {
      if (el.disabled) return;
      const label = labelOf(el);
      const idName = splitCamel(el.name) + " " + splitCamel(el.id);
      let best = null, bestScore = 0;
      Object.keys(DOC_DEFS).forEach((type) => {
        const s = fieldScore(label, idName, DOC_DEFS[type]);
        if (s > bestScore) { bestScore = s; best = type; }
      });
      if (!best || bestScore < 10) {
        unknownFiles.push(shortLabel(label) || el.name || el.id || "(unnamed upload box)");
        return;
      }
      const idx = state.fileInputs.push(el) - 1;
      fileFields.push({
        idx,
        docType: best,
        label: shortLabel(label),
        accept: el.accept || "",
        rule: parseRule(el.accept, label + " " + siblingHint(el))
      });
    });
    return { fileFields, unknownFiles };
  }

  function dataUrlToFile(dataUrl, name) {
    const parts = dataUrl.split(",");
    const mime = parts[0].match(/:(.*?);/)[1];
    const binary = atob(parts[1]);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new File([bytes], name, { type: mime });
  }

  // ------------------------------------------------------------------
  // 7. MAIN ENTRY: fill the page
  // ------------------------------------------------------------------
  function fill(profile, files, opts) {
    const overwrite = !!(opts && opts.overwrite);
    const report = { filled: [], hadValue: [], missing: [], problems: [], files: [] };

    const assignments = assignFields(collectFields());
    for (const a of assignments) {
      const value = profile[a.key];
      const label = shortLabel(a.f.label) || a.f.el.name || a.f.el.id || a.key;
      if (!value) { report.missing.push({ key: a.key, label }); continue; }
      const result = fillOne(a.f, a.key, value, overwrite);
      if (result === "filled") report.filled.push({ key: a.key, label });
      else if (result === "had_value") report.hadValue.push({ key: a.key, label });
      else report.problems.push({ key: a.key, label, msg: "no matching option for \"" + value + "\"" });
    }

    Object.keys(files || {}).forEach((idx) => {
      const input = state.fileInputs[idx];
      const info = files[idx];
      if (!input) return;
      try {
        // Scripts can't type a file path, but they CAN hand the box a File object.
        const transfer = new DataTransfer();
        transfer.items.add(dataUrlToFile(info.dataUrl, info.name));
        input.files = transfer.files;
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
        report.files.push({ idx: Number(idx), ok: true });
      } catch (e) {
        report.files.push({ idx: Number(idx), ok: false, msg: String(e) });
      }
    });
    return report;
  }

  window.__scholarAssist = { scan, fill };
})();
