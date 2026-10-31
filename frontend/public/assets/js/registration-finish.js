const finishForm = document.getElementById("finish-registration-form");
const storageStatus = document.getElementById("document-storage-status");

finishForm.addEventListener("submit", async event => {
  if (finishForm.dataset.readyToSubmit === "true") return;
  event.preventDefault();

  const selected = [...finishForm.querySelectorAll("input[data-extension-doc]")]
    .filter(input => input.files && input.files[0]);
  const submitButton = finishForm.querySelector('button[type="submit"]');

  if (selected.length && !window.ScholarSathiExtension) {
    storageStatus.textContent = "Install and enable the ScholarSathi Chrome extension to save selected documents. Clear the selected files to create your account without uploading documents.";
    return;
  }

  submitButton.disabled = true;
  try {
    if (selected.length) await window.ScholarSathiExtension.request("PING", {}, 3000);
    for (const [index, input] of selected.entries()) {
      const file = input.files[0];
      if (file.size > 10 * 1024 * 1024) throw new Error(`${file.name} is larger than 10 MB.`);
      storageStatus.textContent = `Saving document ${index + 1} of ${selected.length} in Chrome storage…`;
      const dataUrl = await window.ScholarSathiExtension.readFile(file);
      await window.ScholarSathiExtension.request("SAVE_DOCUMENT", {
        type: input.dataset.extensionDoc,
        name: file.name,
        mime: file.type,
        dataUrl
      }, 60000);
    }
    if (selected.length) storageStatus.textContent = "Documents saved in this Chrome profile. Creating your account…";
    finishForm.dataset.readyToSubmit = "true";
    HTMLFormElement.prototype.submit.call(finishForm);
  } catch (error) {
    storageStatus.textContent = `Could not save the selected documents in Chrome storage: ${error.message} You can clear the file selections and submit without documents.`;
    submitButton.disabled = false;
  }
});
