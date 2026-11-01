# Dashboard notes

The active dashboard is `../private-pages/dashboard.html`; Express serves it only to a signed-in session. Its client logic is in `../public/assets/js/student-dashboard.js`, with responsive menu behavior in `../public/assets/js/workspace-menu.js`.

The dashboard loads the signed-in name from `GET /api/auth/me`, eligibility matches from `GET /api/scholarships/matches` (through Express to FastAPI), and application counts from `GET /api/applications`. Match cards use returned scheme details, eligibility statuses, and reasons. Document readiness is queried from the local Scholar Assist extension, not the backend.

Logout uses `POST /api/auth/logout`. Discover, Profile, Applications, Documents, Deadline Alerts, and Privacy Center are served from the protected workspace routes. Deadline Alerts uses real deadlines from the scholarship match response and shows an empty state when no upcoming dates are available; it does not synthesize alert records. The repository contains no definitions or application queries for `monitored_sources`, `monitoring_jobs`, or `scholarship_change_logs`, so those tables are not exposed as notifications.
