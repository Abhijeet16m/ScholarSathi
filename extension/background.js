importScripts("config.js");

const DB_NAME = "scholarsathi";
const STORE_NAME = "docs";
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const validDocumentTypes = new Set(DOC_TYPES.map(item => item.type));
const validProfileFields = new Set(PROFILE_FIELDS.map(item => item.key));

function openDocumentDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME, { keyPath: "type" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function saveLocalDocument({ type, name, mime, dataUrl }) {
  if (!validDocumentTypes.has(type)) throw new Error("Unknown document category.");
  const match = typeof dataUrl === "string"
    ? /^data:(application\/pdf|image\/jpeg|image\/png);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl)
    : null;
  if (!match || match[1] !== mime) throw new Error("Choose a PDF, JPG, or PNG document.");
  const binary = atob(match[2]);
  if (!binary.length || binary.length > MAX_FILE_BYTES) throw new Error("Each document must be between 1 byte and 10 MB.");

  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const blob = new Blob([bytes], { type: mime });
  const safeName = String(name || type).replace(/[\\/]/g, "_").slice(0, 255);
  const db = await openDocumentDb();
  try {
    await new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readwrite");
      transaction.objectStore(STORE_NAME).put({ type, name: safeName, mime, blob, savedAt: Date.now() });
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error || new Error("Storage transaction aborted."));
    });
  } finally { db.close(); }
  return { type, name: safeName, mime, size: blob.size };
}

async function listLocalDocuments() {
  const db = await openDocumentDb();
  let records;
  try {
    records = await new Promise((resolve, reject) => {
      const request = db.transaction(STORE_NAME).objectStore(STORE_NAME).getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  } finally { db.close(); }
  return records.map(doc => ({ type: doc.type, name: doc.name, mime: doc.mime, size: doc.blob?.size || 0, savedAt: doc.savedAt || null }));
}

async function removeLocalDocument(type) {
  if (!validDocumentTypes.has(type)) throw new Error("Unknown document category.");
  const db = await openDocumentDb();
  try {
    await new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readwrite");
      transaction.objectStore(STORE_NAME).delete(type);
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
    });
  } finally { db.close(); }
  return { removed: true };
}

async function readLocalDocument(type) {
  if (!validDocumentTypes.has(type)) throw new Error("Unknown document category.");
  const db = await openDocumentDb();
  let doc;
  try {
    doc = await new Promise((resolve, reject) => {
      const request = db.transaction(STORE_NAME).objectStore(STORE_NAME).get(type);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  } finally { db.close(); }
  if (!doc) throw new Error("This document is not saved in Chrome storage.");
  const bytes = new Uint8Array(await doc.blob.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return { type: doc.type, name: doc.name, mime: doc.mime, dataUrl: `data:${doc.mime};base64,${btoa(binary)}` };
}

async function saveLocalProfile(profile) {
  if (!profile || typeof profile !== "object" || Array.isArray(profile)) throw new Error("Invalid profile data.");
  const safeProfile = {};
  for (const [key, value] of Object.entries(profile)) {
    if (!validProfileFields.has(key) || typeof value !== "string") continue;
    safeProfile[key] = value.trim().slice(0, 240);
  }
  await chrome.storage.local.set({ profile: safeProfile });
  return { saved: true, fields: Object.keys(safeProfile).length };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.source !== "scholarsathi-page") return false;
  let origin;
  try { origin = new URL(sender.url); } catch { origin = null; }
  const allowedLocalOrigin = origin && origin.protocol === "http:" &&
    ["localhost", "127.0.0.1"].includes(origin.hostname) && origin.port === "3000";
  const allowedProductionOrigin = origin && origin.protocol === "https:" &&
    origin.hostname === "scholar-sathi-seven.vercel.app" && !origin.port;
  if (!allowedLocalOrigin && !allowedProductionOrigin) {
    sendResponse({ ok: false, error: "This website origin is not enabled for ScholarSathi extension access." });
    return false;
  }

  const payload = message.payload || {};
  const task = (async () => {
    switch (message.action) {
      case "PING": return { ready: true };
      case "SAVE_PROFILE": return saveLocalProfile(payload.profile);
      case "SAVE_DOCUMENT": return saveLocalDocument(payload);
      case "LIST_DOCUMENTS": return { documents: await listLocalDocuments() };
      case "DELETE_DOCUMENT": return removeLocalDocument(payload.type);
      case "GET_DOCUMENT": return readLocalDocument(payload.type);
      default: throw new Error("Unsupported ScholarSathi extension request.");
    }
  })();
  task.then(result => sendResponse({ ok: true, ...result }), error => sendResponse({ ok: false, error: error.message }));
  return true;
});
