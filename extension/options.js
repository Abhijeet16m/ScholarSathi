function formatSize(bytes) {
  return bytes > 1024 * 1024
    ? (bytes / 1024 / 1024).toFixed(1) + " MB"
    : Math.round(bytes / 1024) + " KB";
}

async function refresh(box) {
  const type = box.dataset.type;
  const status = box.querySelector(".status");
  const doc = await getDoc(type);
  status.innerHTML = "";
  if (doc) {
    status.className = "status saved";
    status.textContent = "Saved: " + doc.name + " (" + formatSize(doc.blob.size) + ")";
    const del = document.createElement("button");
    del.textContent = "Remove";
    del.onclick = async () => { await deleteDoc(type); refresh(box); };
    status.appendChild(del);
  } else {
    status.className = "status none";
    status.textContent = "Nothing saved yet";
  }
}

document.querySelectorAll(".doc").forEach((box) => {
  box.querySelector("input[type=file]").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    await saveDoc(box.dataset.type, file);
    e.target.value = "";   // clear the picker
    refresh(box);
  });
  refresh(box);
});
