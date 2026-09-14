import { describe, expect, it } from "vitest";
import { hashPassword, timingSafeEqualString, verifyPassword } from "../crypto";

describe("crypto", () => {
  it("hashes and verifies a correct password", async () => {
    const hash = await hashPassword("correct-horse-battery-staple");
    expect(hash.startsWith("$argon2id$")).toBe(true);
    expect(await verifyPassword(hash, "correct-horse-battery-staple")).toBe(
      true,
    );
  });

  it("rejects an incorrect password", async () => {
    const hash = await hashPassword("correct-horse-battery-staple");
    expect(await verifyPassword(hash, "wrong-password")).toBe(false);
  });

  it("does not throw on a malformed hash", async () => {
    await expect(verifyPassword("not-a-real-hash", "anything")).resolves.toBe(
      false,
    );
  });

  it("timingSafeEqualString matches equal strings and rejects different ones", () => {
    expect(timingSafeEqualString("abc123", "abc123")).toBe(true);
    expect(timingSafeEqualString("abc123", "abc124")).toBe(false);
    expect(timingSafeEqualString("short", "muchlonger")).toBe(false);
  });
});
