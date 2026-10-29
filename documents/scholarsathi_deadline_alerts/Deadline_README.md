# ScholarSathi — Deadline Alerts

Responsive HTML/CSS/JavaScript page styled to match the supplied screenshot.

## Files
- `index.html` — sidebar, top bar, upcoming deadline list and filter
- `style.css` — screenshot-inspired colors/layout and responsive styling
- `script.js` — live countdown calculation, time-range filtering, and endpoint placeholders

## Included upcoming deadlines (sample/demo content)
- Udaan Undergraduate Access Award — 18 Nov 2026
- Karnataka STEM Continuation Grant — 2 Dec 2026
- Open Horizons Excellence Award — 17 Dec 2026

Countdown days are calculated automatically using the current browser date. The dropdown can show all upcoming deadlines, the next 30 days, or the next 60 days.

## Backend endpoint placeholder
- `GET /api/deadlines` — retrieve all upcoming deadlines for the current student.
- Scholarship details links are placeholders under `/api/scholarships/...`.
- `/logout` — replace with your authentication sign-out route.

The included scholarship entries are illustrative sample data, not verified live offers. The page does not yet fetch real deadlines from a backend. Implement `GET /api/deadlines` and the `loadLiveDeadlines()` function in `script.js` to use your database.

## Run
Open `index.html` in VS Code with Live Server, or run `python -m http.server 5500`, then visit `http://localhost:5500`.
