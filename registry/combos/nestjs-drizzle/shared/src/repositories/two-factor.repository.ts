import { Inject, Injectable } from "@nestjs/common";
import { and, eq, isNull } from "drizzle-orm";
import { verifyBackupCode } from "@/lib/auth/core/two-factor.js";
import { DRIZZLE_DB, type Database } from "../config/db.js";
import { twoFactorBackupCodes } from "../schema.js";

// Takes bigint directly, not string: every caller already has the user row's id in hand from
// its own database lookup, so there's nothing to parse here.
@Injectable()
export class TwoFactorRepository {
  constructor(@Inject(DRIZZLE_DB) private readonly db: Database) {}

  /** Replaces any prior set — re-confirming enrollment invalidates old backup codes. */
  async saveBackupCodes(userId: bigint, hashes: string[]): Promise<void> {
    await this.db
      .delete(twoFactorBackupCodes)
      .where(eq(twoFactorBackupCodes.userId, userId));
    if (hashes.length === 0) return;
    await this.db
      .insert(twoFactorBackupCodes)
      .values(hashes.map((codeHash) => ({ userId, codeHash })));
  }

  async consumeBackupCode(userId: bigint, code: string): Promise<boolean> {
    const unused = await this.db
      .select()
      .from(twoFactorBackupCodes)
      .where(
        and(
          eq(twoFactorBackupCodes.userId, userId),
          isNull(twoFactorBackupCodes.usedAt),
        ),
      );
    const match = unused.find((row) => verifyBackupCode(code, row.codeHash));
    if (!match) return false;

    await this.db
      .update(twoFactorBackupCodes)
      .set({ usedAt: new Date() })
      .where(eq(twoFactorBackupCodes.id, match.id));
    return true;
  }

  async clearBackupCodes(userId: bigint): Promise<void> {
    await this.db
      .delete(twoFactorBackupCodes)
      .where(eq(twoFactorBackupCodes.userId, userId));
  }
}
