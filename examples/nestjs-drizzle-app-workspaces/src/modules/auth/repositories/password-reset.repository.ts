import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import type { PasswordResetStoreDeps } from '@/core/password-reset';
import { DRIZZLE_DB, type Database } from '../../../common/config/db';
import { passwordResetTokens, users } from '@/database/schema';
import { toId } from '../../../common/helpers/id.helper';

@Injectable()
export class PasswordResetRepository implements PasswordResetStoreDeps {
  constructor(@Inject(DRIZZLE_DB) private readonly db: Database) {}

  async saveResetToken(input: { userId: string; tokenHash: string; expiresAt: string }): Promise<void> {
    await this.db.insert(passwordResetTokens).values({
      userId: toId(input.userId),
      tokenHash: input.tokenHash,
      expiresAt: new Date(input.expiresAt),
    });
  }

  async findValidResetToken(tokenHash: string): Promise<{
    userId: string;
    expiresAt: string;
    consumedAt: string | null;
  } | null> {
    const [row] = await this.db
      .select()
      .from(passwordResetTokens)
      .where(eq(passwordResetTokens.tokenHash, tokenHash))
      .limit(1);
    if (!row) return null;
    return {
      userId: row.userId.toString(),
      expiresAt: row.expiresAt.toISOString(),
      consumedAt: row.consumedAt?.toISOString() ?? null,
    };
  }

  async consumeResetToken(tokenHash: string): Promise<void> {
    await this.db
      .update(passwordResetTokens)
      .set({ consumedAt: new Date() })
      .where(eq(passwordResetTokens.tokenHash, tokenHash));
  }

  async setPasswordHash(userId: string, passwordHash: string): Promise<void> {
    await this.db
      .update(users)
      .set({ passwordHash })
      .where(eq(users.id, toId(userId)));
  }
}
