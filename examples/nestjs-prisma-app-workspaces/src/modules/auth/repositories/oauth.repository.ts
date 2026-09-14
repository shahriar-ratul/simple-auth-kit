import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import type { OAuthStoreDeps } from '@/core/oauth';
import { PrismaService } from '@/modules/prisma/prisma.service';
import { toId } from '@/common/helpers/id.helper';

@Injectable()
export class OAuthRepository implements OAuthStoreDeps {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async findAccountByProvider(provider: string, providerAccountId: string): Promise<{ userId: string } | null> {
    const row = await this.prisma.oAuthAccount.findUnique({
      where: { provider_providerAccountId: { provider, providerAccountId } },
    });
    return row ? { userId: row.userId.toString() } : null;
  }

  async linkAccount(input: {
    userId: string;
    provider: string;
    providerAccountId: string;
    email?: string;
  }): Promise<void> {
    await this.prisma.oAuthAccount.create({
      data: { ...input, userId: toId(input.userId) },
    });
  }

  async findUserByVerifiedEmail(email: string): Promise<{ id: string } | null> {
    const row = await this.prisma.user.findUnique({ where: { email } });
    return row ? { id: row.id.toString() } : null;
  }

  // OAuth-only signup: no password is set, which is why `User.passwordHash` is nullable.
  async createUserFromOAuth(input: { email?: string }): Promise<{ id: string }> {
    if (!input.email) throw new BadRequestException('OAuth provider did not return an email address');
    const row = await this.prisma.user.create({
      data: { email: input.email, passwordHash: null },
    });
    return { id: row.id.toString() };
  }
}
