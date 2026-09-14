const ENV_VAR = 'AUTH_JWT_SECRET';
const MIN_SECRET_BYTES = 32; // 256 bits, HS256's own minimum

/**
 * One static HS256 secret, read once from `AUTH_JWT_SECRET` at process start (used by
 * `CoreAuthModule.forRoot()`'s `JwtModule.registerAsync` — see core-auth.module.ts). No
 * database, no generation, no rotation: the secret is deployment configuration, the same way
 * `DATABASE_URL` is — losing it (or changing it) invalidates every outstanding token.
 */
export function loadJwtSecret(): Buffer {
  const raw = process.env[ENV_VAR];
  if (!raw) {
    throw new Error(
      `${ENV_VAR} is not set. Generate one and set it before starting the app — e.g.: openssl rand -base64 32`,
    );
  }
  const secret = Buffer.from(raw, 'base64');
  if (secret.length < MIN_SECRET_BYTES) {
    throw new Error(
      `${ENV_VAR} decodes to ${secret.length} bytes — needs at least ${MIN_SECRET_BYTES} (256 bits) for HS256.`,
    );
  }
  return secret;
}
