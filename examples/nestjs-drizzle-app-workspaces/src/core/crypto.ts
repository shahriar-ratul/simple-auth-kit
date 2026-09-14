import argon2 from 'argon2';
import { createHash, randomBytes, timingSafeEqual as nodeTimingSafeEqual } from 'node:crypto';

const ARGON2ID_DEFAULTS: argon2.HashOptions = {
  type: argon2.argon2id,
  memoryCost: 19456, // ~19 MiB, OWASP minimum recommendation
  timeCost: 2,
  parallelism: 1,
};

export async function hashPassword(password: string, opts: argon2.HashOptions = {}): Promise<string> {
  return argon2.hash(password, { ...ARGON2ID_DEFAULTS, ...opts });
}

export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}

export function timingSafeEqualString(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) {
    // still run a comparison of equal length to avoid a length-based timing signal
    nodeTimingSafeEqual(aBuf, aBuf);
    return false;
  }
  return nodeTimingSafeEqual(aBuf, bBuf);
}

/** High-entropy opaque token for password-reset links and 2FA backup codes. */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('hex');
}

// sha256, not argon2id: random high-entropy tokens have no offline-guessing risk, so lookups
// can stay a plain indexed equality match instead of a per-row argon2.verify call.
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
