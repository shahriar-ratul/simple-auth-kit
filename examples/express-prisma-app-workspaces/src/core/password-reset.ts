import { hashPassword, hashToken, randomToken } from './crypto';
import { AuditEvent, PasswordResetTokenInvalidError } from './types';

const RESET_TOKEN_TTL_SECONDS_DEFAULT = 60 * 60; // 1 hour

export interface PasswordResetStoreDeps {
  saveResetToken: (input: { userId: string; tokenHash: string; expiresAt: string }) => Promise<void>;
  findValidResetToken: (
    tokenHash: string,
  ) => Promise<{ userId: string; expiresAt: string; consumedAt: string | null } | null>;
  consumeResetToken: (tokenHash: string) => Promise<void>;
  setPasswordHash: (userId: string, passwordHash: string) => Promise<void>;
  appendAuditEvent?: (event: AuditEvent) => Promise<void>;
}

// Persists only the token's hash, never the raw value; returns the raw token so the caller
// can email it — this module owns no mailer.
export async function requestPasswordReset(
  deps: PasswordResetStoreDeps,
  userId: string,
  opts: { ttlSeconds?: number } = {},
): Promise<{ token: string }> {
  const token = randomToken();
  const expiresAt = new Date(Date.now() + (opts.ttlSeconds ?? RESET_TOKEN_TTL_SECONDS_DEFAULT) * 1000).toISOString();
  await deps.saveResetToken({ userId, tokenHash: hashToken(token), expiresAt });
  await deps.appendAuditEvent?.({ type: 'password_reset_requested', userId });
  return { token };
}

// Does not revoke existing sessions — callers should follow up with
// `revokeAllSessionsForUser` from session-policy.ts.
export async function resetPassword(
  deps: PasswordResetStoreDeps,
  token: string,
  newPassword: string,
): Promise<{ userId: string }> {
  const tokenHash = hashToken(token);
  const record = await deps.findValidResetToken(tokenHash);
  if (!record || record.consumedAt || new Date(record.expiresAt).getTime() < Date.now()) {
    throw new PasswordResetTokenInvalidError();
  }

  const passwordHash = await hashPassword(newPassword);
  await deps.setPasswordHash(record.userId, passwordHash);
  await deps.consumeResetToken(tokenHash);
  await deps.appendAuditEvent?.({ type: 'password_reset_completed', userId: record.userId });
  return { userId: record.userId };
}
