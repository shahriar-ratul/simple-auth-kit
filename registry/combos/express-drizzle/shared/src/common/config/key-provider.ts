// NOTE: the `@/lib/auth/core/*` import path below is a placeholder the CLI rewrites
// to your project's actual path alias at install time (see registry.json).
import { createHash } from "node:crypto";
import type { JwtSigningKey } from "@/lib/auth/core/types";

const ENV_VAR = "AUTH_JWT_SECRET";
const MIN_SECRET_BYTES = 32; // 256 bits, HS256's own minimum

function loadSecret(): Uint8Array {
  const raw = process.env[ENV_VAR];
  if (!raw) {
    throw new Error(
      `${ENV_VAR} is not set. Generate one and set it before starting the app — e.g.: openssl rand -base64 32`,
    );
  }
  const secret = Buffer.from(raw, "base64");
  if (secret.length < MIN_SECRET_BYTES) {
    throw new Error(
      `${ENV_VAR} decodes to ${secret.length} bytes — needs at least ${MIN_SECRET_BYTES} (256 bits) for HS256.`,
    );
  }
  return secret;
}

/**
 * One static HS256 secret, read once from `AUTH_JWT_SECRET` at process start. No database, no
 * generation, no rotation: the secret is deployment configuration, the same way `DATABASE_URL`
 * is — losing it (or changing it) invalidates every outstanding token, which is the same
 * failure mode an RSA keypair rotation has for its *retired* keys, just without the grace
 * window this library previously bought by keeping old keys verifiable in the database.
 *
 * `kid` is derived from the secret (a hash prefix) rather than configured separately, so it
 * changes automatically whenever the secret does, with nothing else to keep in sync. It is
 * carried in the JWT header for tooling/debugging only — `token-service.ts`'s verify path does
 * not consult it, because there is only ever one secret in play.
 *
 * Plain class, no decorators — Express has no DI container to register with. Construct
 * it directly in create-auth-app.ts and pass it into whatever else needs it.
 */
export class KeyProviderService {
  private readonly key: JwtSigningKey;

  constructor() {
    const secret = loadSecret();
    const kid = createHash("sha256").update(secret).digest("hex").slice(0, 12);
    this.key = { kid, secret };
  }

  async getActiveKey(): Promise<JwtSigningKey> {
    return this.key;
  }

  get secret(): Uint8Array {
    return this.key.secret;
  }
}
