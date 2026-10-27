# ScholarSathi Dashboard (HTML + CSS)

A responsive dashboard based on the supplied reference screenshot.

## Files
- `index.html` — dashboard layout and navigation links
- `style.css` — colors, spacing, cards, sidebar and responsive layout
- `script.js` — profile greeting/initials and logout placeholder

## Connect your pages
Replace the sample `href` values in `index.html` with your actual routes:
- `dashboard.html`
- `discover-scholarships.html` (Explore matches / View matches)
- `profile.html` (profile name and avatar at top-right)
- `applications.html` (Track applications)
- `documents.html` (Complete checklist)
- `settings.html`, `deadline-alerts.html`, `privacy-center.html`

The links currently point to placeholder page names so you can connect them to separate HTML pages or your frontend router.

## Logout
In `script.js`, the logout click currently redirects to `/logout` after confirmation.
Change this to your actual logout endpoint/auth provider. For a backend API, you might call
`fetch('/api/v1/auth/logout', { method: 'POST', credentials: 'include' })` and then redirect
to your login page after the server confirms the session is ended.

## Profile data
The demo profile name is `Mira Rao` in `script.js`. Replace it with the signed-in user's name,
or populate it from your backend/session. Do not use a hard-coded name in production.

## Run
Open `index.html` in a browser. For a local development server, use VS Code Live Server or:
`python -m http.server 5500`
Then visit `http://localhost:5500`.
