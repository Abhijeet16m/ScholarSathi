# ScholarSathi — My Applications

A responsive HTML/CSS/JavaScript implementation of the uploaded application tracker screenshot.

## Files
- `index.html` — sidebar, page header, application card, progress steps, Open checklist button
- `style.css` — screenshot-inspired colors, layout, card and mobile responsive rules
- `script.js` — checklist navigation and logout route placeholders

## Open checklist connection
By default, the button navigates to `documents.html`. If your Documents page has a different URL, edit:
```js
checklistPage: "documents.html"
```
in `script.js`.

Optional backend endpoint to load a specific application's checklist:
- `GET /api/applications/udaan/checklist`

This API is a placeholder and is not active. The current Open checklist button navigates to the Documents webpage; it does not fetch checklist data from a backend yet.

## Other route placeholders
- Dashboard: `dashboard.html`
- Discover scholarships: `discover-scholarships.html`
- Profile: `profile.html`
- Documents: `documents.html`
- Logout: `/logout` (replace with your authentication sign-out route)

## Run
Open `index.html` in VS Code using Live Server, or run:
`python -m http.server 5500`
Then visit `http://localhost:5500`.
