import { Inject, Injectable } from '@nestjs/common';
import { verifyBackupCode } from '@/core/two-factor.js';
import { PrismaClient } from '@/database/generated/prisma/client.js';

// Takes bigint directly, not string: every caller already has the user row's id in hand from
// its own Prisma lookup, so there's nothing to parse here.
@Injectable()
export class TwoFactorRepository {
  constructor(@Inject(PrismaClient) private readonly prisma: PrismaClient) {}

  /** Replaces any prior set — re-confirming enrollment invalidates old backup codes. */
  async saveBackupCodes(userId: bigint, hashes: string[]): Promise<void> {
    await this.prisma.twoFactorBackupCode.deleteMany({ where: { userId } });
    await this.prisma.twoFactorBackupCode.createMany({
      data: hashes.map((codeHash) => ({ userId, codeHash })),
    });
  }

  async consumeBackupCode(userId: bigint, code: string): Promise<boolean> {
    const unused = await this.prisma.twoFactorBackupCode.findMany({
      where: { userId, usedAt: null },
    });
    const match = unused.find((row) => verifyBackupCode(code, row.codeHash));
    if (!match) return false;

    await this.prisma.twoFactorBackupCode.update({
      where: { id: match.id },
      data: { usedAt: new Date() },
    });
    return true;
  }

  async clearBackupCodes(userId: bigint): Promise<void> {
    await this.prisma.twoFactorBackupCode.deleteMany({ where: { userId } });
  }
}
