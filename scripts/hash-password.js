#!/usr/bin/env node
// Run locally in your own terminal: node scripts/hash-password.js
// Prompts for your admin-page password, hashes it with scrypt, and prints
// a value to paste into the Vercel env var ADMIN_PASSWORD_HASH.
// The plaintext password is never written to disk, logged, or committed —
// it only ever exists in this process's memory. Input is echoed as you type
// (this is a plain terminal prompt, not masked), so run it somewhere private.

import crypto from 'crypto';
import readline from 'readline';

function ask(rl, question) {
  return new Promise((resolve) => rl.question(question, resolve));
}

async function main() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  const pw1 = await ask(rl, 'Enter new admin-page password: ');
  const pw2 = await ask(rl, 'Confirm password: ');
  rl.close();

  if (!pw1 || pw1.length < 8) {
    console.error('\nPassword must be at least 8 characters.');
    process.exit(1);
  }
  if (pw1 !== pw2) {
    console.error('\nPasswords did not match.');
    process.exit(1);
  }

  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(pw1, salt, 64);
  const stored = `scrypt:${salt.toString('hex')}:${hash.toString('hex')}`;

  console.log('\nSet this as the Vercel environment variable ADMIN_PASSWORD_HASH:\n');
  console.log(stored);
  console.log('\n(Vercel dashboard -> your project -> Settings -> Environment Variables)');
}

main();
