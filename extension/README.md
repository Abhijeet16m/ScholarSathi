# ScholarSathi Student Assistant

This is a Manifest V3 Chrome extension prototype. It stores a student's profile in `chrome.storage.local` and document files in the extension's IndexedDB for this Chrome profile. Website registration and the Documents page pass files to the extension; the extension does not send them to Neon or another server. The popup recognizes common scholarship form labels, prepares supported saved documents, and fills matching fields. It never presses Submit.

## Test it locally

1. Start the ScholarSathi Express website at `http://localhost:3000` in Chrome.
2. Open `chrome://extensions`.
3. Turn on **Developer mode**.
4. Click **Load unpacked** and select this `extension` folder.
5. Reload the extension after changes. Reload the website tab too.
6. Sign in to ScholarSathi in this same Chrome profile; the dashboard syncs the student profile to the extension.
7. Upload sample files during registration or on the Documents page. Open the extension's **Manage my documents** page to inspect/remove them.
8. On a practice scholarship form, click the extension icon and choose **Fill form and attach files**. Review all fields/files and submit manually.

The bridge currently permits only `http://localhost:3000` and `http://127.0.0.1:3000`. Once the Vercel deployment has a final hostname, add that exact HTTPS host to `manifest.json`'s `content_scripts.matches`, and update the hostname/port checks in `bridge.js` and `background.js`. Reload the unpacked extension and grant the site access when Chrome asks. Avoid broad wildcard site access.

## Chrome Web Store release status

This folder is **not ready for Chrome Web Store submission yet**. It is ready for local unpacked testing. Before store submission:

- Add the exact production host permission, then test the website-to-extension bridge on the deployed HTTPS site.
- Implement encryption for saved student documents and a safe key/recovery design. Current IndexedDB files are plaintext within the Chrome profile; do not use real identity or financial documents.
- Publish a public privacy policy, add a clear disclosure and affirmative consent before handling profile/documents, and complete the Web Store data-use declarations.
- Add store assets such as the required extension icon and screenshots; prepare a clear single-purpose listing.
- Recheck all form matching, PDF compression quality/size rules, and supported portal behavior against real test forms.

The PDF shrinking routine rebuilds pages as images, so compressed PDFs may no longer have selectable/searchable text. Students must check the result and submit forms themselves.
