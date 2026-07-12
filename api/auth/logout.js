import { serializeCookie, appendCookie } from '../_lib/security.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  appendCookie(res, serializeCookie('admin_session', '', { clear: true }));
  return res.status(200).json({ ok: true });
}
