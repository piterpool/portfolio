#!/usr/bin/env node
// Run locally: node scripts/generate-secret.js
// Prints a random secret to paste into the Vercel env var:
//   SESSION_SECRET - signs the admin login session cookie
// Run again any time you want to rotate it (this instantly logs everyone out).

import crypto from 'crypto';

console.log('SESSION_SECRET=' + crypto.randomBytes(32).toString('hex'));
console.log('\nCopy this into Vercel -> your project -> Settings -> Environment Variables.');
