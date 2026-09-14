import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import type { OAuthStoreDeps } from '@/core/oauth';
import { DRIZZLE_DB, type Database } from '@/common/config/db';
import { oauthAccounts, users } from '@/database/schema';
import { toId } from '@/common/helpers/id.helper';

@Injectable()
export class OAuthRepository implements OAuthStoreDeps {
  constructor(@Inject(DRIZZLE_DB) private readonly db: Database) {}

  async findAccountByProvider(provider: string, providerAccountId: string): Promise<{ userId: string } | null> {
    const [row] = await this.db
      .select()
      .from(oauthAccounts)
      .where(and(eq(oauthAccounts.provider, provider), eq(oauthAccounts.providerAccountId, providerAccountId)))
      .limit(1);
    return row ? { userId: row.userId.toString() } : null;
  }

  async linkAccount(input: {
    userId: string;
    provider: string;
    providerAccountId: string;
    email?: string;
  }): Promise<void> {
    await this.db.insert(oauthAccounts).values({ ...input, userId: toId(input.userId) });
  }

  async findUserByVerifiedEmail(email: string): Promise<{ id: string } | null> {
    const [row] = await this.db.select().from(users).where(eq(users.email, email)).limit(1);
    return row ? { id: row.id.toString() } : null;
  }

  /** OAuth-only signup: no password is ever set, which is why `User.passwordHash` is nullable. */
  async createUserFromOAuth(input: { email?: string }): Promise<{ id: string }> {
    if (!input.email) throw new BadRequestException('OAuth provider did not return an email address');
    const [row] = await this.db.insert(users).values({ email: input.email, passwordHash: null }).returning();
    return { id: row.id.toString() };
  }
}
