// Password-only login: check the password against the stored scrypt hash
// and, if it matches, issue a short-lived signed session cookie. No
// WebAuthn/biometric step — this is a single-factor password gate for the
// admin hub (admin.html) and everything linked from it (finance, plans,
// investments).
import { verifyPassword, signPayload, serializeCookie, appendCookie } from '../_lib/security.js';

// Best-effort per-instance rate limit. Serverless instances are ephemeral and
// may be scaled across multiple machines, so this is defense-in-depth on top
// of the scrypt password hash, not a guaranteed lockout.
const attempts = new Map();
const WINDOW_MS = 60_000;
const MAX_ATTEMPTS = 8;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const passwordHash = process.env.ADMIN_PASSWORD_HASH;
  const sessionSecret = process.env.SESSION_SECRET;

  if (!passwordHash || !sessionSecret) {
    return res.status(500).json({ error: 'Server is missing required environment variables.' });
  }

  const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown';
  const now = Date.now();
  const rec = attempts.get(ip) || { count: 0, resetAt: now + WINDOW_MS };
  if (now > rec.resetAt) {
    rec.count = 0;
    rec.resetAt = now + WINDOW_MS;
  }
  if (rec.count >= MAX_ATTEMPTS) {
    return res.status(429).json({ error: 'Too many attempts. Try again in a minute.' });
  }

  const { password } = req.body || {};
  const ok = typeof password === 'string' && verifyPassword(password, passwordHash);
  if (!ok) rec.count += 1;
  attempts.set(ip, rec);

  if (!ok) {
    return res.status(401).json({ error: 'Incorrect password.' });
  }

  const sessionToken = signPayload({ sub: 'owner' }, sessionSecret, 30 * 60);
  appendCookie(res, serializeCookie('admin_session', sessionToken, { maxAge: 30 * 60 }));

  return res.status(200).json({ ok: true });
}
