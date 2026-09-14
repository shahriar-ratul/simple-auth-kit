import { and, eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { OAuthStoreDeps } from '@/core/oauth';
import { HttpError } from '../../../infra/errors/http-error';
import * as schema from '@/database/schema';
import { toId } from '../../../common/helpers/id.helper';

/**
 * Plain class, no decorators — Drizzle-specific implementation of `OAuthStoreDeps`
 * (registry/core/oauth.js), mirroring the reference combo's OAuthRepository.
 */
export class OAuthRepository implements OAuthStoreDeps {
  constructor(private readonly db: NodePgDatabase<typeof schema>) {}

  async findAccountByProvider(provider: string, providerAccountId: string): Promise<{ userId: string } | null> {
    const [row] = await this.db
      .select()
      .from(schema.oauthAccounts)
      .where(
        and(eq(schema.oauthAccounts.provider, provider), eq(schema.oauthAccounts.providerAccountId, providerAccountId)),
      )
      .limit(1);
    return row ? { userId: row.userId.toString() } : null;
  }

  async linkAccount(input: {
    userId: string;
    provider: string;
    providerAccountId: string;
    email?: string;
  }): Promise<void> {
    await this.db.insert(schema.oauthAccounts).values({
      userId: toId(input.userId),
      provider: input.provider,
      providerAccountId: input.providerAccountId,
      email: input.email,
    });
  }

  async findUserByVerifiedEmail(email: string): Promise<{ id: string } | null> {
    const [row] = await this.db.select().from(schema.users).where(eq(schema.users.email, email)).limit(1);
    return row ? { id: row.id.toString() } : null;
  }

  /** OAuth-only signup: no password is ever set, which is why `User.passwordHash` is nullable. */
  async createUserFromOAuth(input: { email?: string }): Promise<{ id: string }> {
    if (!input.email) throw new HttpError(400, 'OAuth provider did not return an email address');
    const [row] = await this.db.insert(schema.users).values({ email: input.email, passwordHash: null }).returning();
    return { id: row.id.toString() };
  }
}
