# Dashboard notes

The dashboard page is `../public/dashboard.html`. Its stylesheet and script are in `../public/assets/css/dashboard.css` and `../public/assets/js/dashboard.js`. Successful registration and verified login redirect here. The server requires a signed-in session for both the dashboard and documents page. The displayed student name loads from `/api/auth/me`.

Scholarship, application, and profile summary values remain demo content. The dashboard's remaining menu links are placeholders until their corresponding pages are implemented. The logout button targets `POST /api/auth/logout`.

Scholarship, profile, application, alert, privacy, and settings links remain placeholders until those pages are implemented.
