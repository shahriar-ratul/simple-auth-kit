// NOTE: the `@/lib/auth/core/*` import path below is a placeholder the CLI rewrites
// to your project's actual path alias at install time (see registry.json).
import { createHash } from "node:crypto";
import { Injectable } from "@nestjs/common";
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

// One static HS256 secret, read once from `AUTH_JWT_SECRET` at process start. No database, no
// generation, no rotation — changing it invalidates every outstanding token. `kid` is derived
// from the secret (a hash prefix) for tooling/debugging only; the verify path never consults it.
@Injectable()
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
