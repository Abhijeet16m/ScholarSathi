# Archived duplicate pages

These copies were moved out of `public/` because their filenames collided with
the authenticated pages in `../../private-pages/`. The active workspace pages
are served by the Express session gate from `frontend/private-pages/`.

Do not move these files back into `frontend/public/`: Vercel serves that folder
as public CDN content, which can bypass the Express session check for the same
URL. Shared CSS and JavaScript remain in `frontend/public/assets/`.
