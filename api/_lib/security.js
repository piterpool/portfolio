// Shared security helpers for the admin auth flow.
// Everything here is stateless — no database. The login session is carried
// in a signed, httpOnly cookie so the serverless functions never need to
// remember anything between requests.

import crypto from 'crypto';

const b64url = {
  encode: (buf) => Buffer.from(buf).toString('base64url'),
  decode: (str) => Buffer.from(str, 'base64url'),
};

/**
 * Sign a JSON-serializable payload into a compact, tamper-proof token:
 *   base64url(json).base64url(hmac)
 * The payload carries its own expiry ("exp", epoch seconds) so verify()
 * can reject stale tokens without any server-side storage.
 */
export function signPayload(payload, secret, ttlSeconds) {
  if (!secret) throw new Error('Missing signing secret');
  const body = { ...payload, exp: Math.floor(Date.now() / 1000) + ttlSeconds };
  const json = b64url.encode(JSON.stringify(body));
  const mac = crypto.createHmac('sha256', secret).update(json).digest();
  return `${json}.${b64url.encode(mac)}`;
}

/** Verify a token created by signPayload(). Returns the payload or null. */
export function verifyPayload(token, secret) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null;
  const [json, mac] = token.split('.');
  if (!json || !mac) return null;

  const expectedMac = crypto.createHmac('sha256', secret).update(json).digest();
  const givenMac = b64url.decode(mac);
  if (expectedMac.length !== givenMac.length || !crypto.timingSafeEqual(expectedMac, givenMac)) {
    return null;
  }

  let payload;
  try {
    payload = JSON.parse(b64url.decode(json).toString('utf8'));
  } catch {
    return null;
  }

  if (typeof payload.exp !== 'number' || Math.floor(Date.now() / 1000) > payload.exp) {
    return null; // expired
  }
  return payload;
}

/** Constant-time string compare (for anything that isn't a scrypt hash check). */
export function safeEqual(a, b) {
  const aBuf = Buffer.from(String(a));
  const bBuf = Buffer.from(String(b));
  if (aBuf.length !== bBuf.length) {
    // Still run a comparison of equal length to avoid leaking length via timing.
    crypto.timingSafeEqual(aBuf, aBuf);
    return false;
  }
  return crypto.timingSafeEqual(aBuf, bBuf);
}

/**
 * Verify a password against a hash produced by scripts/hash-password.js,
 * format: "scrypt:<saltHex>:<hashHex>".
 */
export function verifyPassword(password, storedHash) {
  if (!storedHash || typeof storedHash !== 'string') return false;
  const parts = storedHash.split(':');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const [, saltHex, hashHex] = parts;
  const salt = Buffer.from(saltHex, 'hex');
  const expected = Buffer.from(hashHex, 'hex');
  const derived = crypto.scryptSync(String(password), salt, expected.length);
  if (derived.length !== expected.length) return false;
  return crypto.timingSafeEqual(derived, expected);
}

/** Parse the Cookie header into a plain object. */
export function parseCookies(req) {
  const header = req.headers.cookie;
  const out = {};
  if (!header) return out;
  for (const pair of header.split(';')) {
    const idx = pair.indexOf('=');
    if (idx === -1) continue;
    const key = pair.slice(0, idx).trim();
    const val = pair.slice(idx + 1).trim();
    if (key) out[key] = decodeURIComponent(val);
  }
  return out;
}

/** Build a Set-Cookie header value. */
export function serializeCookie(name, value, { maxAge, path = '/', clear = false } = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  parts.push(`Path=${path}`);
  parts.push('HttpOnly');
  parts.push('Secure');
  parts.push('SameSite=Strict');
  if (clear) {
    parts.push('Max-Age=0');
  } else if (typeof maxAge === 'number') {
    parts.push(`Max-Age=${maxAge}`);
  }
  return parts.join('; ');
}

/** Append a Set-Cookie header without clobbering any already set. */
export function appendCookie(res, cookieStr) {
  const existing = res.getHeader('Set-Cookie');
  if (!existing) {
    res.setHeader('Set-Cookie', cookieStr);
  } else if (Array.isArray(existing)) {
    res.setHeader('Set-Cookie', [...existing, cookieStr]);
  } else {
    res.setHeader('Set-Cookie', [existing, cookieStr]);
  }
}
