// Lightweight session check used by admin.html and every page linked from
// it (finance/plans/investments) to decide whether to show the login form
// or the page's content, without needing to fetch real data just to find out.
import { verifyPayload, parseCookies } from '../_lib/security.js';

export default async function handler(req, res) {
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

  res.setHeader('Cache-Control', 'no-store');
  if (!session) {
    return res.status(401).json({ ok: false });
  }
  return res.status(200).json({ ok: true });
}
