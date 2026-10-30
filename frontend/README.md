# ScholarSathi frontend and auth starter

This folder is a runnable starter containing the HTML/CSS/JavaScript pages and the Express backend that serves them. Start the server from this folder, not by opening an HTML file with `file://`.

## Pages

- `public/index.html` — student login form
- `public/register.html` — registration and scholarship-profile form
- `public/verify-email.html` — registration email OTP
- `public/set-password.html` — password setup and optional document upload
- `public/verify-login.html` — login email OTP
- `public/dashboard.html` — student dashboard
- `public/documents.html` — student document checklist

Shared auth styles are in `public/assets/css/auth.css`; dashboard and document assets are under `public/assets/`. Dashboard and document-page interactions remain demo features described in `docs/`.

## Registration profile fields

Registration collects date of birth, gender, social category, domicile, annual family income, highest qualification, optional qualification marks, current course level/name/year, optional institution and entrance rank, optional disability/orphan status, parent or guardian occupation, and whether the student receives another scholarship. The server validates the submitted values and stores them on the `students` row after registration OTP verification and password setup.

## Email verification

Registration sends an OTP before the account is created. Every login first checks the password, sends a separate sign-in OTP, and creates the authenticated session only after the code is verified. Codes expire after ten minutes; resending is subject to a cooldown.

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

At startup the backend creates the required tables and adds any new profile columns to an existing `students` table. You can also review or run `schema.sql` manually in Neon. Existing accounts are retained; their new profile fields remain blank until they are collected.

## Documents

Registration accepts optional PDF, JPG, and PNG documents up to 10 MB each. File contents are stored under `private_uploads/`, outside `public/` and excluded from Git. Neon stores the document owner and metadata. Local disk storage is for development; deployed applications need persistent private file storage and suitable backups.

See [dashboard notes](docs/dashboard.md) and [documents notes](docs/documents.md) for remaining demo behavior and backend hooks.
