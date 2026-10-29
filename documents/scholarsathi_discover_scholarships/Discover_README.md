# ScholarSathi — Discover Scholarships

## Files
- `index.html`: sidebar, search, explainable match cards, profile/logout.
- `style.css`: responsive layout styled after the supplied screenshot.
- `script.js`: local sample search, save toggles and API placeholders.

## Endpoints to connect
- `GET /api/scholarships?search=<query>` — search scholarships.
- `GET /api/scholarships/:id/eligibility` — show eligibility details.
- `POST /api/scholarships/:id/save` — save scholarship.
- `DELETE /api/scholarships/:id/save` — unsave scholarship.
- `profile.html` — profile page link.
- `/logout` — replace with your actual authentication sign-out route.

The displayed scholarship listings and explainability messages are sample demo content, not verified live offers. Search currently filters these sample cards locally. Connect the endpoints and render real database results for production. Replace sidebar destinations with your real page routes.

## Run locally
Open `index.html` using VS Code Live Server, or run `python -m http.server 5500` and visit `http://localhost:5500`.
