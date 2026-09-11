import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildTotpProvisioningUri, generateBackupCodes, generateTotpCode, generateTotpSecret, verifyBackupCode, verifyTotpCode } from "../two-factor.js";

// Shared seed from RFC 6238 Appendix B / RFC 4226 Appendix D ("12345678901234567890",
// base32-encoded) — RFC 4226's own T=0 vector for this seed is the well-known "755224".
const RFC_SECRET = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";

describe("two-factor: TOTP", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("matches the RFC 4226 test vector at T=0 (counter 0, 6 digits)", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(0));
    expect(verifyTotpCode(RFC_SECRET, "755224")).toBe(true);
  });

  it("matches the 6-digit truncation of the RFC 6238 T=59 vector (counter 1)", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(59_000));
    expect(verifyTotpCode(RFC_SECRET, "287082")).toBe(true);
  });

  it("accepts the adjacent step's code within the default window, rejects it with window 0", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(59_000)); // counter 1; "755224" is counter 0's code
    expect(verifyTotpCode(RFC_SECRET, "755224")).toBe(true); // default window is 1
    expect(verifyTotpCode(RFC_SECRET, "755224", { window: 0 })).toBe(false);
  });

  it("rejects a malformed code without throwing", () => {
    expect(verifyTotpCode(RFC_SECRET, "not-a-code")).toBe(false);
    expect(verifyTotpCode(RFC_SECRET, "12345")).toBe(false);
  });

  it("generateTotpCode round-trips with verifyTotpCode", () => {
    const secret = generateTotpSecret();
    expect(verifyTotpCode(secret, generateTotpCode(secret))).toBe(true);
  });

  it("generateTotpSecret produces a fresh base32 secret each call", () => {
    const a = generateTotpSecret();
    const b = generateTotpSecret();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Z2-7]+$/);
  });

  it("buildTotpProvisioningUri embeds the issuer, account name, and secret", () => {
    const uri = buildTotpProvisioningUri({ secret: RFC_SECRET, accountName: "alice@example.com", issuer: "simple-auth-kit" });
    expect(uri).toContain("otpauth://totp/");
    expect(uri).toContain(`secret=${RFC_SECRET}`);
    expect(decodeURIComponent(uri)).toContain("simple-auth-kit:alice@example.com");
  });
});

describe("two-factor: backup codes", () => {
  it("generates unique codes with matching hashes that verify correctly", () => {
    const codes = generateBackupCodes(10);
    expect(codes).toHaveLength(10);
    expect(new Set(codes.map((c) => c.code)).size).toBe(10);

    for (const { code, hash } of codes) {
      expect(verifyBackupCode(code, hash)).toBe(true);
    }
  });

  it("rejects an incorrect backup code", () => {
    const [{ hash }] = generateBackupCodes(1);
    expect(verifyBackupCode("0000000000", hash)).toBe(false);
  });
});
