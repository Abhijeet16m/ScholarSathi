# ScholarSathi frontend and auth starter

This folder is a runnable starter containing the HTML/CSS/JavaScript pages and the Express backend that serves them. Start the server from this folder, not by opening an HTML file with `file://`.

## Pages

- `public/index.html` — student login form
- `public/register.html` — registration and scholarship-profile form
- `public/verify-email.html` — registration email OTP
- `public/set-password.html` — password setup and optional document upload
- `public/verify-login.html` — login email OTP
- `public/forgot-password.html` — request a password reset code
- `public/verify-reset-email.html` — verify the password reset email code
- `public/reset-password.html` — choose and confirm a replacement password
- `private-pages/dashboard.html` — session-protected student dashboard
- `private-pages/documents.html` — session-protected student document checklist
- The other signed-in demo pages are in `private-pages/` too.

Shared auth styles are in `public/assets/css/auth.css`; dashboard and document assets are under `public/assets/`.

## Registration profile fields

Registration collects date of birth, gender, social category, domicile, annual family income, highest qualification, optional qualification marks, current course level/name/year, optional institution and entrance rank, optional disability/orphan status, parent or guardian occupation, and whether the student receives another scholarship. The server validates the submitted values and stores them on the `students` row after registration OTP verification and password setup.

## Email verification

Registration sends an OTP before the account is created. Every login first checks the password, sends a separate sign-in OTP, and creates the authenticated session only after the code is verified. Codes expire after ten minutes; resending is subject to a cooldown.

After registration or login verification succeeds, the server opens `dashboard.html`. All workspace pages are served through a signed-in-session check. On the dashboard, the signed-in student profile is sent to the installed extension so its smart-fill profile matches the website account. Scholarship discovery, profile editing, application tracking, deadlines, and privacy controls still contain demo behavior and do not have complete backend APIs.

Forgot password is also connected end to end: request a reset code, verify it, and set a new password. The server updates the scrypt password hash; it never stores or displays the original password. The reset request uses a generic response so the page does not reveal whether an email has an account.

## Setup on Windows

1. Install Node.js 20 or newer.
2. Open PowerShell in this folder and run:

   ```powershell
   npm install
   ```

3. Copy `.env.example` to `.env` and add your Neon pooled `DATABASE_URL`, two different random values for `SESSION_SECRET` and `OTP_SECRET`, and your SMTP/Gmail test account details. Do not commit `.env`.
4. Start the server:

   ```powershell
   npm run dev
   ```

5. Visit `http://localhost:3000`.

At startup the backend creates the `students` table and adds any new profile columns to an existing table. You can also review or run `schema.sql` manually in Neon. Existing accounts are retained; new profile fields are blank until they are collected.

## Deploying the website to Vercel

Use the directory containing this `server.js`, `package.json`, `vercel.json`, and `public/` as the Vercel project Root Directory. If you copy these files into the Git repository root, leave Root Directory as `.`; if they remain nested under `outputs/frontend`, select that folder. Vercel detects the Express app, and `vercel.json` includes the protected HTML pages in the server function. Run `schema.sql` once against the production Neon database before deploying. In Vercel Project Settings, add `DATABASE_URL`, `SESSION_SECRET`, `OTP_SECRET`, `SMTP_USER`, and `SMTP_APP_PASSWORD`; `SMTP_HOST`, `SMTP_PORT`, and `SMTP_FROM` are optional overrides. Use strong, different secrets and keep them out of Git. A new deployment is required after changing environment variables.

The production site needs the extension bridge updated to the exact Vercel origin before document uploads or profile sync can work there. The current extension source folder is not included in this frontend directory. Vercel static files in `public/` are public; authenticated workspace HTML is kept outside `public/` and sent by the Express session gate.

## Documents

Registration and the Documents page send selected files directly to the Scholar Assist extension. The extension stores them in IndexedDB in the student's Chrome profile; the website backend and Neon receive neither the file bytes nor document metadata. Files are capped at 10 MB each and accepted as PDF, JPG, or PNG. The current local storage is not encrypted, so use a personal device and sample documents during testing. If the earlier backend version created `student_documents`, review and run `remove-legacy-document-metadata.sql` once in Neon to remove its old metadata table; this does not affect student accounts.

See [dashboard notes](docs/dashboard.md) and [documents notes](docs/documents.md) for the remaining demo behavior and backend hooks.
