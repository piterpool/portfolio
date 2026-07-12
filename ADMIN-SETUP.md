# Admin page — setup

`admin.html` is the entry point: enter a password, land on a menu with three
sections — `finance.html`, `plans.html`, `investments.html`. All three read
from the same private Google Sheet (a different tab each), never from this
repo (this repo is public), and only after the session cookie set by
`admin.html` checks out.

Nothing here needs a database — every secret lives in a Vercel environment
variable, the same pattern `api/notion.js` already uses for `NOTION_TOKEN`.

## Files involved

- `admin.html` — password login + menu linking to the three sections
- `finance.html` / `plans.html` / `investments.html` — session-gated dashboards (charts + table via Chart.js), one per Google Sheet tab
- `api/auth/login.js` — checks the password, issues a session cookie
- `api/auth/session.js` — lets a page check "am I still logged in?" without fetching data
- `api/auth/logout.js` — clears the session cookie
- `api/finance-data.js` / `api/plans-data.js` / `api/investments-data.js` — thin wrappers around `api/_lib/sheet-data.js` that each read one sheet tab
- `api/_lib/sheet-data.js` — shared "check session, fetch sheet tab" logic
- `api/_lib/security.js` — signed-cookie helpers, scrypt password check
- `scripts/hash-password.js` / `scripts/generate-secret.js` — local-only helper scripts

## 1. Install dependencies

```
npm install
```

(Vercel also runs this automatically on deploy — this is just so the scripts
below can run locally.)

## 2. Generate a session secret (run locally, never commit output)

```
node scripts/generate-secret.js
```

Copy the printed line into Vercel → your project → **Settings → Environment
Variables**:

- `SESSION_SECRET` — signs the login session cookie. Rotating this instantly logs everyone out.

## 3. Set your admin password

```
node scripts/hash-password.js
```

Follow the prompts, then copy the printed `scrypt:...` value into the Vercel
env var `ADMIN_PASSWORD_HASH`. The plaintext password is never written
anywhere — only this hash.

## 4. Connect your Google Sheet

1. Create a private Google Sheet with three tabs: **Finance**, **Plans**,
   **Investments** (exact names, or set the range env vars below to match
   whatever you call them). Give each tab a header row, e.g. Finance:
   `Date | Category | Amount | NetWorth`.
2. In [Google Cloud Console](https://console.cloud.google.com/), create a project (or use an existing one), enable the **Google Sheets API**, then create a **Service Account** and download its JSON key.
3. Share the Google Sheet with the service account's email address (the `client_email` field in the JSON key) as **Viewer**.
4. Set these Vercel env vars from the JSON key:
   - `GOOGLE_SERVICE_ACCOUNT_EMAIL` = the `client_email` value
   - `GOOGLE_PRIVATE_KEY` = the `private_key` value, pasted exactly as-is (keep the `\n` sequences — Vercel's env var editor handles this fine as a single-line paste)
   - `GOOGLE_SHEET_ID` = the long ID in the sheet's URL, between `/d/` and `/edit`
5. Optionally override which tab each page reads (defaults shown):
   - `FINANCE_SHEET_RANGE` (default `Sheet1` — set to `Finance` if you renamed the tab)
   - `PLANS_SHEET_RANGE` (default `Plans`)
   - `INVESTMENTS_SHEET_RANGE` (default `Investments`)

Each dashboard auto-detects a date/month column for a trend line, and a
category + amount pair for a pie chart, then always shows the full table
below. Add/rename columns in the sheet and the page adapts automatically —
no redeploy needed for data changes.

## 5. Use it

Visit `/admin.html`, enter your password. You'll land on a menu — pick
Finance, Plans, or Investments. Session lasts 30 minutes, then you'll need
to unlock again from `/admin.html`.

## Environment variable checklist

| Variable | Purpose |
|---|---|
| `SESSION_SECRET` | Signs the session cookie |
| `ADMIN_PASSWORD_HASH` | The password check |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | Service account for reading the Sheet |
| `GOOGLE_PRIVATE_KEY` | Service account private key |
| `GOOGLE_SHEET_ID` | Which sheet to read |
| `FINANCE_SHEET_RANGE` | Optional, defaults to `Sheet1` |
| `PLANS_SHEET_RANGE` | Optional, defaults to `Plans` |
| `INVESTMENTS_SHEET_RANGE` | Optional, defaults to `Investments` |

## Security notes and limits (read before relying on this)

- The repo is public, so nothing sensitive is ever committed — all secrets and
  the data itself live outside GitHub, in Vercel env vars and your Google Sheet.
- This is single-factor (password only) — no biometric/WebAuthn step. That's
  a deliberate simplification; if you want a second factor back later, the
  same signed-cookie/session pattern here would support re-adding it.
- Sessions are short-lived (30 min) signed cookies, `HttpOnly` + `Secure` +
  `SameSite=Strict`, so they don't survive being copied out of the browser
  and aren't readable by page JavaScript.
- `robots.txt` and a `noindex` meta tag keep search engines from indexing
  the admin pages — this is tidiness, not security. The real protection is
  the server-side password check.
- Login attempts are rate-limited on a best-effort basis (8/minute per IP,
  per warm serverless instance). It's defense-in-depth on top of the scrypt
  password hash, not a hard guarantee.
