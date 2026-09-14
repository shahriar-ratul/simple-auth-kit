import { randomBytes } from "node:crypto";
import { JwtSigningKey } from "../types";

export function generateTestSigningKey(kid = "test-kid-1"): JwtSigningKey {
  return { kid, secret: randomBytes(32) };
}
