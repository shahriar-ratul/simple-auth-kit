import { eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { PasswordResetStoreDeps } from '@/core/password-reset';
import * as schema from '@/database/schema';
import { toId } from '../../../common/helpers/id.helper';

/**
 * Plain class, no decorators — Drizzle-specific implementation of `PasswordResetStoreDeps`
 * (registry/core/password-reset.js), mirroring the reference combo's PasswordResetRepository.
 */
export class PasswordResetRepository implements PasswordResetStoreDeps {
  constructor(private readonly db: NodePgDatabase<typeof schema>) {}

  async saveResetToken(input: { userId: string; tokenHash: string; expiresAt: string }): Promise<void> {
    await this.db.insert(schema.passwordResetTokens).values({
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
      .from(schema.passwordResetTokens)
      .where(eq(schema.passwordResetTokens.tokenHash, tokenHash))
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
      .update(schema.passwordResetTokens)
      .set({ consumedAt: new Date() })
      .where(eq(schema.passwordResetTokens.tokenHash, tokenHash));
  }

  async setPasswordHash(userId: string, passwordHash: string): Promise<void> {
    await this.db
      .update(schema.users)
      .set({ passwordHash })
      .where(eq(schema.users.id, toId(userId)));
  }
}
