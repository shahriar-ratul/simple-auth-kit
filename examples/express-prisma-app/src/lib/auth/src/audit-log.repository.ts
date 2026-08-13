import type { AuditEvent } from "@/lib/auth/core/types.js";
import { Prisma, PrismaClient } from "../generated/prisma/client.js";
import { buildPageMeta, normalizeLimit, normalizePage, type Paginated } from "./pagination.js";
import { toIdOrNull, toIdOrUndefined } from "./id.helper.js";

export interface AuditLogEntry {
  id: string;
  userId: string | null;
  name: string;
  action: string;
  info: unknown;
  remarks: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AuditLogListFilter {
  userId?: string;
  action?: string;
  since?: string;
  until?: string;
  page?: number;
  limit?: number;
}

/** An `AuditLog` row as `findMany` returns it. */
export type AuditLogRow = Prisma.AuditLogGetPayload<object>;

/** Shapes a raw row into the wire DTO. Applied by the caller (`AuthService.listAuditLog`), not here. */
export function toAuditLogEntry(row: AuditLogRow): AuditLogEntry {
  return {
    id: row.id.toString(),
    userId: row.userId?.toString() ?? null,
    name: row.name,
    action: row.action,
    info: row.info,
    remarks: row.remarks,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** "role_assigned" -> "Role assigned". Derived rather than passed in, so core never has to carry display text. */
export function humanizeAction(action: string): string {
  const words = action.split("_");
  return [words[0].charAt(0).toUpperCase() + words[0].slice(1), ...words.slice(1)].join(" ");
}

// Plain class, no DI container — constructed directly with a PrismaClient in
// create-auth-app.ts. Identical Prisma queries to the reference combo.
export class AuditLogRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async append(event: AuditEvent, opts: { remarks?: string } = {}): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        action: event.type,
        name: humanizeAction(event.type),
        userId: "userId" in event ? toIdOrNull(event.userId) : null,
        info: event as unknown as Prisma.InputJsonValue,
        remarks: opts.remarks ?? null,
      },
    });
  }

  /** Newest-first, page-paginated. Returns raw rows — shaping is the caller's job, see `toAuditLogEntry`. */
  async list(filter: AuditLogListFilter): Promise<Paginated<AuditLogRow>> {
    const page = normalizePage(filter.page);
    const limit = normalizeLimit(filter.limit);
    const where = {
      userId: toIdOrUndefined(filter.userId),
      action: filter.action,
      createdAt: {
        gte: filter.since ? new Date(filter.since) : undefined,
        lte: filter.until ? new Date(filter.until) : undefined,
      },
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: limit,
        skip: (page - 1) * limit,
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return { items: rows, meta: buildPageMeta(page, limit, total) };
  }
}
