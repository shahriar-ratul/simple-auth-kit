import { Inject, Injectable } from '@nestjs/common';
import type { PasswordResetStoreDeps } from '@/core/password-reset';
import { PrismaService } from '@/modules/prisma/prisma.service';
import { toId } from '@/common/helpers/id.helper';

@Injectable()
export class PasswordResetRepository implements PasswordResetStoreDeps {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async saveResetToken(input: { userId: string; tokenHash: string; expiresAt: string }): Promise<void> {
    await this.prisma.passwordResetToken.create({
      data: {
        userId: toId(input.userId),
        tokenHash: input.tokenHash,
        expiresAt: new Date(input.expiresAt),
      },
    });
  }

  async findValidResetToken(tokenHash: string): Promise<{
    userId: string;
    expiresAt: string;
    consumedAt: string | null;
  } | null> {
    const row = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash },
    });
    if (!row) return null;
    return {
      userId: row.userId.toString(),
      expiresAt: row.expiresAt.toISOString(),
      consumedAt: row.consumedAt?.toISOString() ?? null,
    };
  }

  async consumeResetToken(tokenHash: string): Promise<void> {
    await this.prisma.passwordResetToken.update({
      where: { tokenHash },
      data: { consumedAt: new Date() },
    });
  }

  async setPasswordHash(userId: string, passwordHash: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: toId(userId) },
      data: { passwordHash },
    });
  }
}
