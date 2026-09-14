import { and, eq, isNull } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { verifyBackupCode } from "@/lib/auth/core/two-factor.js";
import * as schema from "@/database/schema.js";

/**
 * Plain class, no decorators — Drizzle-specific implementation mirroring the reference
 * combo's TwoFactorRepository.
 *
 * Takes bigint directly, not string: every caller already has the user row's id in hand from
 * its own database lookup, so there's nothing to parse here.
 */
export class TwoFactorRepository {
  constructor(private readonly db: NodePgDatabase<typeof schema>) {}

  /** Replaces any prior set — re-confirming enrollment invalidates old backup codes. */
  async saveBackupCodes(userId: bigint, hashes: string[]): Promise<void> {
    await this.db
      .delete(schema.twoFactorBackupCodes)
      .where(eq(schema.twoFactorBackupCodes.userId, userId));
    if (hashes.length === 0) return;
    await this.db
      .insert(schema.twoFactorBackupCodes)
      .values(hashes.map((codeHash) => ({ userId, codeHash })));
  }

  async consumeBackupCode(userId: bigint, code: string): Promise<boolean> {
    const unused = await this.db
      .select()
      .from(schema.twoFactorBackupCodes)
      .where(
        and(
          eq(schema.twoFactorBackupCodes.userId, userId),
          isNull(schema.twoFactorBackupCodes.usedAt),
        ),
      );
    const match = unused.find((row) => verifyBackupCode(code, row.codeHash));
    if (!match) return false;

    await this.db
      .update(schema.twoFactorBackupCodes)
      .set({ usedAt: new Date() })
      .where(eq(schema.twoFactorBackupCodes.id, match.id));
    return true;
  }

  async clearBackupCodes(userId: bigint): Promise<void> {
    await this.db
      .delete(schema.twoFactorBackupCodes)
      .where(eq(schema.twoFactorBackupCodes.userId, userId));
  }
}
