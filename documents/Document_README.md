# ScholarSathi Documents page — with Remove Document

## Files
- `index.html`: dashboard-style document checklist, top-right profile/logout, add/view/remove controls
- `style.css`: styling matching the provided screenshot, including mobile layout
- `script.js`: demo interactions and backend endpoint placeholders

## API endpoints to connect
Edit `API_ENDPOINTS` at the top of `script.js`:
- `POST /api/documents` — upload file as multipart/form-data
- `GET /api/documents` — load the user's saved document list
- `GET /api/documents/:id` — securely view/download a document
- `DELETE /api/documents/:id` — remove a document
- `PATCH /api/documents/:id/status` — update readiness
- `/logout` — replace with your real authentication sign-out endpoint

These are placeholders, not live APIs. Add/remove/status actions currently update the browser UI only. The selected file is not sent to a server until the upload API example is connected. Ensure the backend checks user authorization before allowing document reads or deletion.

## Connect to your other pages
Replace placeholder navigation paths in `index.html`:
`dashboard.html`, `discover-scholarships.html`, `profile.html`, `applications.html`,
`deadline-alerts.html`, `privacy-center.html`, `settings.html`.

## Run locally
Open `index.html` with VS Code Live Server, or run:
`python -m http.server 5500`
Visit `http://localhost:5500`.
