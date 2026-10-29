# ScholarSathi — Privacy Center

Responsive HTML/CSS/JavaScript page inspired by the supplied screenshot.

## Files
- `index.html` — privacy cards, sidebar, profile/logout controls and confirmation modal
- `style.css` — layout, colors, responsive behavior and dialog styling
- `script.js` — confirmation and local storage clearing logic

## Clear profile behavior
Click **Clear profile**, then confirm in the dialog. The script removes these known keys from `localStorage` and `sessionStorage`:
- `scholarsathi_profile`
- `scholarSathiProfile`
- `studentProfile`
- `profile`
- `userProfile`
- `scholarsathi_user`
- `scholarsathi_documents`
- `scholarsathi_applications`

If your existing app uses different storage keys, add them to `STORAGE_KEYS` in `script.js`. The page intentionally does not clear all browser storage because that could remove unrelated data.

## Optional server endpoint
If the app stores profiles in a database too, implement:
- `DELETE /api/profile` — delete the currently authenticated student's profile data.

This endpoint is only a placeholder and is not called by default. Make sure the server authenticates the user and deletes only that user's data. Browser storage deletion alone cannot remove data already saved in a server database.

## Run
Open `index.html` with VS Code Live Server, or run `python -m http.server 5500` and visit `http://localhost:5500`.
