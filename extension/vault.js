// Documents are stored in this Chrome profile's extension IndexedDB.
// This prototype does not encrypt files at rest; do not store real documents yet.

const DB_NAME = "scholarsathi";
const STORE = "docs";

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "type" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function saveDoc(type, file) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put({ type, name: file.name, mime: file.type, blob: file });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function getDoc(type) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE).objectStore(STORE).get(type);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

async function deleteDoc(type) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(type);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function getProfile() {
  const result = await chrome.storage.local.get("profile");
  return result.profile || {};
}

async function saveProfile(profile) {
  const allowed = new Set(PROFILE_FIELDS.map(field => field.key));
  const clean = {};
  for (const [key, value] of Object.entries(profile || {})) {
    if (allowed.has(key) && typeof value === "string") clean[key] = value.trim().slice(0, 240);
  }
  await chrome.storage.local.set({ profile: clean });
  return clean;
}
