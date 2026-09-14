// RFC 6238 TOTP + RFC 4648 base32, hand-rolled on node:crypto to avoid a dependency.
import { createHmac, randomBytes } from 'node:crypto';
import { hashToken, timingSafeEqualString } from './crypto.js';

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const TOTP_STEP_SECONDS = 30;
const TOTP_DIGITS = 6;
const TOTP_SECRET_BYTES = 20; // 160 bits, the RFC 4226 recommendation for HMAC-SHA1

function base32Encode(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 0x1f];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32_ALPHABET[(value << (5 - bits)) & 0x1f];
  return output;
}

function base32Decode(encoded: string): Buffer {
  const clean = encoded.toUpperCase().replace(/=+$/, '');
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of clean) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index === -1) continue; // tolerate whitespace/hyphens some authenticator apps insert
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

function hotp(secret: Buffer, counter: number): string {
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac('sha1', secret).update(counterBuffer).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binCode =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return (binCode % 10 ** TOTP_DIGITS).toString().padStart(TOTP_DIGITS, '0');
}

export function generateTotpSecret(): string {
  return base32Encode(randomBytes(TOTP_SECRET_BYTES));
}

/** `otpauth://` URI for QR-code enrollment, the format every major authenticator app understands. */
export function buildTotpProvisioningUri(opts: { secret: string; accountName: string; issuer: string }): string {
  const label = encodeURIComponent(`${opts.issuer}:${opts.accountName}`);
  const params = new URLSearchParams({
    secret: opts.secret,
    issuer: opts.issuer,
    algorithm: 'SHA1',
    digits: String(TOTP_DIGITS),
    period: String(TOTP_STEP_SECONDS),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}

export function generateTotpCode(secret: string): string {
  const counter = Math.floor(Date.now() / 1000 / TOTP_STEP_SECONDS);
  return hotp(base32Decode(secret), counter);
}

/**
 * Checks `code` against the current 30s step, tolerating `window` steps of clock drift on
 * either side (default 1 = accepts the previous/current/next step, ±30s).
 */
export function verifyTotpCode(secret: string, code: string, opts: { window?: number } = {}): boolean {
  const window = opts.window ?? 1;
  const normalized = code.trim();
  if (!/^\d{6}$/.test(normalized)) return false;

  const secretBytes = base32Decode(secret);
  const counter = Math.floor(Date.now() / 1000 / TOTP_STEP_SECONDS);
  for (let offset = -window; offset <= window; offset++) {
    if (counter + offset < 0) continue;
    if (timingSafeEqualString(hotp(secretBytes, counter + offset), normalized)) return true;
  }
  return false;
}

export interface BackupCode {
  code: string;
  hash: string;
}

export function generateBackupCodes(count = 10): BackupCode[] {
  return Array.from({ length: count }, () => {
    const code = randomBytes(5).toString('hex'); // 10 hex chars, easy to type back in
    return { code, hash: hashToken(code) };
  });
}

export function verifyBackupCode(code: string, hash: string): boolean {
  return timingSafeEqualString(hashToken(code.trim().toLowerCase()), hash);
}
