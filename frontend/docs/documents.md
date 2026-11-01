# Documents page notes

The active signed-in page is `../private-pages/documents.html`. Its interactions are in `../public/assets/js/documents.js` and `../public/assets/js/extension-bridge.js`; shared styles are in `../public/assets/css/styles.css`.

The Documents page and registration finish step use the Scholar Assist extension bridge to save files and checklist metadata in extension IndexedDB. Neither files nor document metadata are sent to Express or Neon. The page can list, open/download, replace, and remove locally saved document types. The extension must be installed and enabled on the site. Logout uses `POST /api/auth/logout`.

The current application code does not create, read, or write `student_documents`. The repository has no table definition for it, only a legacy cleanup script. If this table remains in a database, it is not the active source for the extension checklist. `remove-legacy-document-metadata.sql` drops it permanently; inspect and back up the deployed table contents before considering that manual cleanup. The frontend does not automatically run the SQL or migrate document data.
