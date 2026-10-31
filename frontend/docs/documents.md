# Documents page notes

The document checklist is `../public/documents.html`, with styles in `../public/assets/css/documents.css` and interactions in `../public/assets/js/documents.js`.

The Documents page and registration finish step use the Scholar Assist extension bridge to save files in extension IndexedDB. The file bytes and document metadata stay in the current Chrome profile; they are not sent to the backend or Neon. The page can list, open/download, replace, and remove locally saved document types. The extension must be installed and enabled on the local ScholarSathi site. The logout button targets `POST /api/auth/logout`.
