import { Inject, Injectable } from "@nestjs/common";
import type { AuditEvent } from "@/lib/auth/core/types.js";
import { Prisma, PrismaClient } from "../generated/prisma/client.js";
import { toIdOrNull, toIdOrUndefined } from "./id.helper.js";
import { buildPageMeta, normalizeLimit, normalizePage, type Paginated } from "./pagination.js";

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

// "role_assigned" -> "Role assigned". Derived rather than passed in, so core never carries display text.
export function humanizeAction(action: string): string {
  const words = action.split("_");
  return [words[0].charAt(0).toUpperCase() + words[0].slice(1), ...words.slice(1)].join(" ");
}

/** An `AuditLog` row as `findMany` returns it. */
export type AuditLogRow = Prisma.AuditLogGetPayload<object>;

/** Shapes a raw row into the wire DTO — applied by the caller (`AuthService.listAuditLog`), not here. */
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

type AuditLogListener = (entry: AuditLogEntry) => void;

@Injectable()
export class AuditLogRepository {
  // How the WS gateway hears about writes without this repository knowing sockets exist —
  // the gateway depends on SessionRepository, which depends on this class, so injecting the
  // gateway here would close a dependency cycle.
  private readonly listeners = new Set<AuditLogListener>();

  constructor(@Inject(PrismaClient) private readonly prisma: PrismaClient) {}

  /** Fires after every successful write, with the same wire shape the REST list endpoint returns. */
  onAppend(listener: AuditLogListener): void {
    this.listeners.add(listener);
  }

  async append(event: AuditEvent, opts: { remarks?: string } = {}): Promise<void> {
    const row = await this.prisma.auditLog.create({
      data: {
        action: event.type,
        name: humanizeAction(event.type),
        userId: "userId" in event ? toIdOrNull(event.userId) : null,
        info: event as unknown as Prisma.InputJsonValue,
        remarks: opts.remarks ?? null,
      },
    });
    const entry = toAuditLogEntry(row);
    for (const listener of this.listeners) {
      try {
        listener(entry);
      } catch {
        // A broken broadcast must never fail the operation being audited.
      }
    }
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
