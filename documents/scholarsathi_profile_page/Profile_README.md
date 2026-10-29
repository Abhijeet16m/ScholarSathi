# ScholarSathi — My Profile page

A responsive HTML/CSS/JavaScript profile form matching the supplied screenshot.

## Files
- `index.html` — sidebar, top-right profile/logout, education and eligibility form
- `style.css` — screenshot-inspired layout, form controls and responsive styling
- `script.js` — form validation and database endpoint placeholders

## Database endpoints to connect
- `GET /api/profile` — load current user's saved profile
- `PUT /api/profile` — save/create/update the profile in the database
- `DELETE /api/profile` — optional profile-clear endpoint
- `/logout` — replace with your actual authentication logout route

These are placeholder endpoints, not live database connections. The current form validates fields and shows a message explaining that the backend must be connected; it does not claim to persist data until the fetch integration is enabled.

Example `PUT /api/profile` JSON body:
```json
{
  "educationLevel": "Undergraduate",
  "course": "Engineering",
  "studyYear": "2nd year",
  "institution": "Example Institute",
  "institutionState": "Karnataka",
  "marks": 85,
  "incomeRange": "Below ₹5 lakh",
  "domicileState": "Karnataka",
  "category": "General",
  "nationality": "Indian citizen"
}
```
Use authentication and validate all submitted fields on the server. Avoid collecting Aadhaar, bank details or exact address in this eligibility profile.

## Run locally
Open `index.html` in VS Code with Live Server, or run:
`python -m http.server 5500`
Then open `http://localhost:5500`.
