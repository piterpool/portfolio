// Shared handler factory for the admin data pages (finance, plans,
// investments). Each page reads a different tab out of the same private
// Google Sheet, gated behind the same admin_session cookie. The data itself
// never lives in this repo — it's fetched server-side with a service
// account, the same way api/notion.js fetches from a private Notion database.
import { JWT } from 'google-auth-library';
import { verifyPayload, parseCookies } from './security.js';

let cachedClient = null;
function getSheetsClient() {
  if (cachedClient) return cachedClient;
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const key = (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n');
  if (!email || !key) return null;
  cachedClient = new JWT({
    email,
    key,
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });
  return cachedClient;
}

function rowsToObjects(values) {
  if (!Array.isArray(values) || values.length < 2) return [];
  const headers = values[0].map((h) => String(h || '').trim());
  return values.slice(1)
    .filter((row) => row.some((cell) => cell !== '' && cell != null))
    .map((row) => {
      const obj = {};
      headers.forEach((h, i) => { obj[h || `col${i}`] = row[i] ?? ''; });
      return obj;
    });
}

/**
 * Build a Vercel serverless handler that serves one tab of the shared
 * Google Sheet, only to requests carrying a valid admin_session cookie.
 *
 * @param {string} rangeEnvVar - env var name that overrides the tab/range,
 *   e.g. "PLANS_SHEET_RANGE" (falls back to GOOGLE_SHEET_RANGE, then defaultRange).
 * @param {string} defaultRange - tab name to use if no env var is set, e.g. "Plans".
 */
export function createSheetDataHandler(rangeEnvVar, defaultRange) {
  return async function handler(req, res) {
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      return res.status(405).json({ error: 'Method not allowed' });
    }

    const sessionSecret = process.env.SESSION_SECRET;
    if (!sessionSecret) {
      return res.status(500).json({ error: 'Server is missing SESSION_SECRET.' });
    }

    const cookies = parseCookies(req);
    const session = verifyPayload(cookies.admin_session, sessionSecret);
    if (!session) {
      return res.status(401).json({ error: 'Not authenticated.' });
    }

    const sheetId = process.env.GOOGLE_SHEET_ID;
    const range = process.env[rangeEnvVar] || process.env.GOOGLE_SHEET_RANGE || defaultRange;
    const client = getSheetsClient();
    if (!sheetId || !client) {
      return res.status(500).json({ error: 'Server is missing Google Sheets environment variables.' });
    }

    try {
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(sheetId)}/values/${encodeURIComponent(range)}`;
      const response = await client.request({ url });
      const values = response.data && response.data.values ? response.data.values : [];
      const rows = rowsToObjects(values);

      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).json({ rows });
    } catch (err) {
      const message = err?.response?.data?.error?.message || err.message || 'Failed to fetch sheet data.';
      return res.status(502).json({ error: message });
    }
  };
}
