import { randomBytes } from "node:crypto";

// Crockford-style alphabet: no I, L, O, U, 0, 1 → fewer transcription errors.
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTVWXYZ";

function checkChar(body: string): string {
  let sum = 0;
  for (let i = 0; i < body.length; i++) sum += (ALPHABET.indexOf(body[i]) + 1) * (i + 1);
  return ALPHABET[sum % ALPHABET.length];
}

/** DHIA-2026-XXXXXXXX-C — 8 random chars + 1 check char (typo detection). */
export function generateCertificateNumber(date = new Date()): string {
  const bytes = randomBytes(8);
  let body = "";
  for (let i = 0; i < 8; i++) body += ALPHABET[bytes[i] % ALPHABET.length];
  return `DHIA-${date.getUTCFullYear()}-${body}-${checkChar(body)}`;
}

export function isWellFormedCertificateNumber(n: string): boolean {
  const m = /^DHIA-(\d{4})-([A-Z2-9]{8})-([A-Z2-9])$/.exec(n.trim().toUpperCase());
  return !!m && [...m[2]].every((c) => ALPHABET.includes(c)) && checkChar(m[2]) === m[3];
}
