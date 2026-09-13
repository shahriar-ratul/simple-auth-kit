import type { PasswordResetStoreDeps } from "@/lib/auth/core/password-reset.js";
import { PrismaClient } from "../../generated/prisma/client.js";
import { toId } from "../helpers/id.helper.js";

// Plain class, no DI container — constructed directly with a PrismaClient in
// create-auth-app.ts. Identical Prisma queries to the reference combo.
export class PasswordResetRepository implements PasswordResetStoreDeps {
  constructor(private readonly prisma: PrismaClient) {}

  async saveResetToken(input: {
    userId: string;
    tokenHash: string;
    expiresAt: string;
  }): Promise<void> {
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
