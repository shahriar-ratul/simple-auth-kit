import { ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, PrismaClient } from "../generated/prisma/client.js";
import { toId, toIdOrNull } from "./id.helper.js";
import { buildPageMeta, normalizeLimit, normalizePage, type Paginated } from "./pagination.js";

/** A `Language` row as `findUnique`/`findMany` return it. */
export type LanguageRow = Prisma.LanguageGetPayload<object>;

/** Every column the `Language` table has — no secret to withhold, same reasoning as `toUserSummary`. */
export interface LanguageSummary {
  id: string;
  uuid: string;
  code: string;
  name: string;
  nativeName: string;
  direction: string;
  isDefault: boolean;
  isActive: boolean;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export function toLanguageSummary(row: LanguageRow): LanguageSummary {
  return {
    id: row.id.toString(),
    uuid: row.uuid,
    code: row.code,
    name: row.name,
    nativeName: row.nativeName,
    direction: row.direction,
    isDefault: row.isDefault,
    isActive: row.isActive,
    createdBy: row.createdBy?.toString() ?? null,
    updatedBy: row.updatedBy?.toString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export interface LanguageListFilter {
  search?: string;
  page?: number;
  limit?: number;
  activeOnly?: boolean;
}

export type LanguageListResult = Paginated<LanguageSummary>;

export interface LanguageInput {
  code: string;
  name: string;
  nativeName: string;
  direction?: string;
  isDefault?: boolean;
  isActive?: boolean;
}

// Every method takes `workspaceId` first, matching `WorkspaceRepository`'s signature style, and
// every query's `where` includes it — a language lives in exactly one workspace, and `code`
// uniqueness is checked within that workspace only (see `schema.prisma`'s composite unique constraint).
@Injectable()
export class LanguageRepository {
  constructor(@Inject(PrismaClient) private readonly prisma: PrismaClient) {}

  /** Newest-first, page-paginated; `search` matches name/code/nativeName. Returns raw rows — shaping is the caller's job. */
  async list(workspaceId: string, filter: LanguageListFilter = {}): Promise<LanguageListResult> {
    const page = normalizePage(filter.page);
    const limit = normalizeLimit(filter.limit);
    const where: Prisma.LanguageWhereInput = {
      workspaceId: toId(workspaceId),
      isDeleted: false,
      isActive: filter.activeOnly ? true : undefined,
      OR: filter.search
        ? [
            { name: { contains: filter.search, mode: "insensitive" } },
            { code: { contains: filter.search, mode: "insensitive" } },
            { nativeName: { contains: filter.search, mode: "insensitive" } },
          ]
        : undefined,
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.language.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: limit, skip: (page - 1) * limit }),
      this.prisma.language.count({ where }),
    ]);

    return { items: rows.map(toLanguageSummary), meta: buildPageMeta(page, limit, total) };
  }

  async get(workspaceId: string, languageId: string): Promise<LanguageSummary> {
    const row = await this.prisma.language.findUnique({ where: { id: toId(languageId), workspaceId: toId(workspaceId), isDeleted: false } });
    if (!row) throw new NotFoundException(`language "${languageId}" not found`);
    return toLanguageSummary(row);
  }

  async create(workspaceId: string, input: LanguageInput, actorUserId: string | null): Promise<LanguageSummary> {
    const workspaceIdBig = toId(workspaceId);
    const existing = await this.prisma.language.findFirst({ where: { workspaceId: workspaceIdBig, code: input.code } });
    if (existing) throw new ConflictException("a language with this code already exists in this workspace");

    const row = await this.prisma.language.create({
      data: { ...input, workspaceId: workspaceIdBig, createdBy: toIdOrNull(actorUserId), updatedBy: toIdOrNull(actorUserId) },
    });
    return toLanguageSummary(row);
  }

  async update(workspaceId: string, languageId: string, input: Partial<LanguageInput>, actorUserId: string | null): Promise<LanguageSummary> {
    const workspaceIdBig = toId(workspaceId);
    const languageIdBig = toId(languageId);
    const existing = await this.prisma.language.findUnique({ where: { id: languageIdBig, workspaceId: workspaceIdBig, isDeleted: false }, select: { id: true } });
    if (!existing) throw new NotFoundException(`language "${languageId}" not found`);

    if (input.code !== undefined) {
      const clash = await this.prisma.language.findFirst({ where: { workspaceId: workspaceIdBig, NOT: { id: languageIdBig }, code: input.code } });
      if (clash) throw new ConflictException("a language with this code already exists in this workspace");
    }

    const row = await this.prisma.language.update({ where: { id: languageIdBig }, data: { ...input, updatedBy: toIdOrNull(actorUserId) } });
    return toLanguageSummary(row);
  }

  // Soft-delete, matching every other table's isDeleted/deletedAt/deletedBy/deletedReason pattern.
  async delete(workspaceId: string, languageId: string, actorUserId: string | null, reason?: string): Promise<void> {
    const workspaceIdBig = toId(workspaceId);
    const languageIdBig = toId(languageId);
    const existing = await this.prisma.language.findUnique({ where: { id: languageIdBig, workspaceId: workspaceIdBig, isDeleted: false }, select: { id: true } });
    if (!existing) throw new NotFoundException(`language "${languageId}" not found`);
    await this.prisma.language.update({
      where: { id: languageIdBig },
      data: { isDeleted: true, deletedAt: new Date(), deletedBy: toIdOrNull(actorUserId), deletedReason: reason ?? null },
    });
  }

  async setActive(workspaceId: string, languageId: string, isActive: boolean, actorUserId: string | null): Promise<void> {
    const workspaceIdBig = toId(workspaceId);
    const languageIdBig = toId(languageId);
    const existing = await this.prisma.language.findUnique({ where: { id: languageIdBig, workspaceId: workspaceIdBig, isDeleted: false }, select: { id: true } });
    if (!existing) throw new NotFoundException(`language "${languageId}" not found`);
    await this.prisma.language.update({ where: { id: languageIdBig }, data: { isActive, updatedBy: toIdOrNull(actorUserId) } });
  }
}
