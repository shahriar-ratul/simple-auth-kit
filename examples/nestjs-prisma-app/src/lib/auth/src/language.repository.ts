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

@Injectable()
export class LanguageRepository {
  constructor(@Inject(PrismaClient) private readonly prisma: PrismaClient) {}

  /** Newest-first, page-paginated; `search` matches name/code/nativeName. Returns raw rows — shaping is the caller's job. */
  async list(filter: LanguageListFilter = {}): Promise<LanguageListResult> {
    const page = normalizePage(filter.page);
    const limit = normalizeLimit(filter.limit);
    const where: Prisma.LanguageWhereInput = {
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

  async get(languageId: string): Promise<LanguageSummary> {
    const row = await this.prisma.language.findUnique({ where: { id: toId(languageId), isDeleted: false } });
    if (!row) throw new NotFoundException(`language "${languageId}" not found`);
    return toLanguageSummary(row);
  }

  async create(input: LanguageInput, actorUserId: string | null): Promise<LanguageSummary> {
    const existing = await this.prisma.language.findUnique({ where: { code: input.code } });
    if (existing) throw new ConflictException("a language with this code already exists");

    const row = await this.prisma.language.create({
      data: { ...input, createdBy: toIdOrNull(actorUserId), updatedBy: toIdOrNull(actorUserId) },
    });
    return toLanguageSummary(row);
  }

  async update(languageId: string, input: Partial<LanguageInput>, actorUserId: string | null): Promise<LanguageSummary> {
    const languageIdBig = toId(languageId);
    const existing = await this.prisma.language.findUnique({ where: { id: languageIdBig, isDeleted: false }, select: { id: true } });
    if (!existing) throw new NotFoundException(`language "${languageId}" not found`);

    if (input.code !== undefined) {
      const clash = await this.prisma.language.findFirst({ where: { NOT: { id: languageIdBig }, code: input.code } });
      if (clash) throw new ConflictException("a language with this code already exists");
    }

    const row = await this.prisma.language.update({ where: { id: languageIdBig }, data: { ...input, updatedBy: toIdOrNull(actorUserId) } });
    return toLanguageSummary(row);
  }

  // Soft-delete, matching every other table's isDeleted/deletedAt/deletedBy/deletedReason pattern.
  async delete(languageId: string, actorUserId: string | null, reason?: string): Promise<void> {
    const languageIdBig = toId(languageId);
    const existing = await this.prisma.language.findUnique({ where: { id: languageIdBig, isDeleted: false }, select: { id: true } });
    if (!existing) throw new NotFoundException(`language "${languageId}" not found`);
    await this.prisma.language.update({
      where: { id: languageIdBig },
      data: { isDeleted: true, deletedAt: new Date(), deletedBy: toIdOrNull(actorUserId), deletedReason: reason ?? null },
    });
  }

  async setActive(languageId: string, isActive: boolean, actorUserId: string | null): Promise<void> {
    const languageIdBig = toId(languageId);
    const existing = await this.prisma.language.findUnique({ where: { id: languageIdBig, isDeleted: false }, select: { id: true } });
    if (!existing) throw new NotFoundException(`language "${languageId}" not found`);
    await this.prisma.language.update({ where: { id: languageIdBig }, data: { isActive, updatedBy: toIdOrNull(actorUserId) } });
  }
}
