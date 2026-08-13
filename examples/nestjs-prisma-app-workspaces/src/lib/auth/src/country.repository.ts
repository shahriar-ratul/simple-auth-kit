import { ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, PrismaClient } from "../generated/prisma/client.js";
import { toId, toIdOrNull } from "./id.helper.js";
import { buildPageMeta, normalizeLimit, normalizePage, type Paginated } from "./pagination.js";

/** A `Country` row as `findUnique`/`findMany` return it. */
export type CountryRow = Prisma.CountryGetPayload<object>;

/**
 * Every column the `Country` table has — there is no secret to withhold here, unlike `User`.
 * Deliberately not a hand-picked subset, same reasoning as `toUserSummary`.
 */
export interface CountrySummary {
  id: string;
  uuid: string;
  code: string;
  name: string;
  emoji: string;
  phoneCode: string;
  currency: string;
  currencyName: string;
  isoCode: string;
  flag: string | null;
  isActive: boolean;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export function toCountrySummary(row: CountryRow): CountrySummary {
  return {
    id: row.id.toString(),
    uuid: row.uuid,
    code: row.code,
    name: row.name,
    emoji: row.emoji,
    phoneCode: row.phoneCode,
    currency: row.currency,
    currencyName: row.currencyName,
    isoCode: row.isoCode,
    flag: row.flag,
    isActive: row.isActive,
    createdBy: row.createdBy?.toString() ?? null,
    updatedBy: row.updatedBy?.toString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export interface CountryListFilter {
  search?: string;
  page?: number;
  limit?: number;
  activeOnly?: boolean;
}

export type CountryListResult = Paginated<CountrySummary>;

export interface CountryInput {
  code: string;
  name: string;
  emoji: string;
  phoneCode: string;
  currency: string;
  currencyName: string;
  isoCode: string;
  flag?: string | null;
  isActive?: boolean;
}

// Every method takes `workspaceId` first, matching `WorkspaceRepository`'s signature style, and
// every query's `where` includes it — a country lives in exactly one workspace, and `code`/
// `isoCode` uniqueness is checked within that workspace only (see `schema.prisma`'s composite
// unique constraints).
@Injectable()
export class CountryRepository {
  constructor(@Inject(PrismaClient) private readonly prisma: PrismaClient) {}

  /** Newest-first, page-paginated; `search` matches name/code/isoCode. Returns raw rows — shaping is the caller's job. */
  async list(workspaceId: string, filter: CountryListFilter = {}): Promise<CountryListResult> {
    const page = normalizePage(filter.page);
    const limit = normalizeLimit(filter.limit);
    const where: Prisma.CountryWhereInput = {
      workspaceId: toId(workspaceId),
      isDeleted: false,
      isActive: filter.activeOnly ? true : undefined,
      OR: filter.search
        ? [
            { name: { contains: filter.search, mode: "insensitive" } },
            { code: { contains: filter.search, mode: "insensitive" } },
            { isoCode: { contains: filter.search, mode: "insensitive" } },
          ]
        : undefined,
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.country.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: limit, skip: (page - 1) * limit }),
      this.prisma.country.count({ where }),
    ]);

    return { items: rows.map(toCountrySummary), meta: buildPageMeta(page, limit, total) };
  }

  async get(workspaceId: string, countryId: string): Promise<CountrySummary> {
    const row = await this.prisma.country.findUnique({ where: { id: toId(countryId), workspaceId: toId(workspaceId), isDeleted: false } });
    if (!row) throw new NotFoundException(`country "${countryId}" not found`);
    return toCountrySummary(row);
  }

  async create(workspaceId: string, input: CountryInput, actorUserId: string | null): Promise<CountrySummary> {
    const workspaceIdBig = toId(workspaceId);
    const existing = await this.prisma.country.findFirst({ where: { workspaceId: workspaceIdBig, OR: [{ code: input.code }, { isoCode: input.isoCode }] } });
    if (existing) throw new ConflictException("a country with this code or ISO code already exists in this workspace");

    const row = await this.prisma.country.create({
      data: { ...input, workspaceId: workspaceIdBig, createdBy: toIdOrNull(actorUserId), updatedBy: toIdOrNull(actorUserId) },
    });
    return toCountrySummary(row);
  }

  async update(workspaceId: string, countryId: string, input: Partial<CountryInput>, actorUserId: string | null): Promise<CountrySummary> {
    const workspaceIdBig = toId(workspaceId);
    const countryIdBig = toId(countryId);
    const existing = await this.prisma.country.findUnique({ where: { id: countryIdBig, workspaceId: workspaceIdBig, isDeleted: false }, select: { id: true } });
    if (!existing) throw new NotFoundException(`country "${countryId}" not found`);

    if (input.code !== undefined || input.isoCode !== undefined) {
      const clash = await this.prisma.country.findFirst({
        where: { workspaceId: workspaceIdBig, NOT: { id: countryIdBig }, OR: [{ code: input.code }, { isoCode: input.isoCode }] },
      });
      if (clash) throw new ConflictException("a country with this code or ISO code already exists in this workspace");
    }

    const row = await this.prisma.country.update({ where: { id: countryIdBig }, data: { ...input, updatedBy: toIdOrNull(actorUserId) } });
    return toCountrySummary(row);
  }

  // Soft-delete, matching every other table's isDeleted/deletedAt/deletedBy/deletedReason pattern.
  async delete(workspaceId: string, countryId: string, actorUserId: string | null, reason?: string): Promise<void> {
    const workspaceIdBig = toId(workspaceId);
    const countryIdBig = toId(countryId);
    const existing = await this.prisma.country.findUnique({ where: { id: countryIdBig, workspaceId: workspaceIdBig, isDeleted: false }, select: { id: true } });
    if (!existing) throw new NotFoundException(`country "${countryId}" not found`);
    await this.prisma.country.update({
      where: { id: countryIdBig },
      data: { isDeleted: true, deletedAt: new Date(), deletedBy: toIdOrNull(actorUserId), deletedReason: reason ?? null },
    });
  }

  async setActive(workspaceId: string, countryId: string, isActive: boolean, actorUserId: string | null): Promise<void> {
    const workspaceIdBig = toId(workspaceId);
    const countryIdBig = toId(countryId);
    const existing = await this.prisma.country.findUnique({ where: { id: countryIdBig, workspaceId: workspaceIdBig, isDeleted: false }, select: { id: true } });
    if (!existing) throw new NotFoundException(`country "${countryId}" not found`);
    await this.prisma.country.update({ where: { id: countryIdBig }, data: { isActive, updatedBy: toIdOrNull(actorUserId) } });
  }
}
