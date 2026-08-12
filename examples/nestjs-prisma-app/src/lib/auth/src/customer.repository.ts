import { ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, PrismaClient } from "../generated/prisma/client.js";
import { toId, toIdOrNull } from "./id.helper.js";
import { buildPageMeta, normalizeLimit, normalizePage, type Paginated } from "./pagination.js";

/** A `Customer` row as `findUnique`/`findMany` return it. */
export type CustomerRow = Prisma.CustomerGetPayload<object>;

/**
 * Every column the `Customer` table has — no login credential exists to withhold, unlike `User`.
 * Deliberately not a hand-picked subset, same reasoning as `toUserSummary`.
 */
export interface CustomerSummary {
  id: string;
  uuid: string;
  firstName: string | null;
  lastName: string | null;
  username: string | null;
  email: string;
  phone: string | null;
  dob: string | null;
  gender: string | null;
  joinedDate: string;
  photo: string | null;
  isEmailVerified: boolean;
  isPhoneVerified: boolean;
  isActive: boolean;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export function toCustomerSummary(row: CustomerRow): CustomerSummary {
  return {
    id: row.id.toString(),
    uuid: row.uuid,
    firstName: row.firstName,
    lastName: row.lastName,
    username: row.username,
    email: row.email,
    phone: row.phone,
    dob: row.dob?.toISOString() ?? null,
    gender: row.gender,
    joinedDate: row.joinedDate.toISOString(),
    photo: row.photo,
    isEmailVerified: row.isEmailVerified,
    isPhoneVerified: row.isPhoneVerified,
    isActive: row.isActive,
    createdBy: row.createdBy?.toString() ?? null,
    updatedBy: row.updatedBy?.toString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export interface CustomerListFilter {
  search?: string;
  page?: number;
  limit?: number;
  activeOnly?: boolean;
}

export type CustomerListResult = Paginated<CustomerSummary>;

export interface CustomerInput {
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  username?: string | null;
  phone?: string | null;
  dob?: string | null;
  gender?: string | null;
  joinedDate?: string;
  photo?: string | null;
  isEmailVerified?: boolean;
  isPhoneVerified?: boolean;
  isActive?: boolean;
}

function toPrismaInput(input: Partial<CustomerInput>): Omit<Partial<CustomerInput>, "dob" | "joinedDate"> & { dob?: Date | null; joinedDate?: Date } {
  return {
    ...input,
    dob: input.dob === undefined ? undefined : input.dob === null ? null : new Date(input.dob),
    joinedDate: input.joinedDate === undefined ? undefined : new Date(input.joinedDate),
  };
}

@Injectable()
export class CustomerRepository {
  constructor(@Inject(PrismaClient) private readonly prisma: PrismaClient) {}

  /** Newest-first, page-paginated; `search` matches name/email/username/phone. Returns raw rows — shaping is the caller's job. */
  async list(filter: CustomerListFilter = {}): Promise<CustomerListResult> {
    const page = normalizePage(filter.page);
    const limit = normalizeLimit(filter.limit);
    const where: Prisma.CustomerWhereInput = {
      isDeleted: false,
      isActive: filter.activeOnly ? true : undefined,
      OR: filter.search
        ? [
            { firstName: { contains: filter.search, mode: "insensitive" } },
            { lastName: { contains: filter.search, mode: "insensitive" } },
            { email: { contains: filter.search, mode: "insensitive" } },
            { username: { contains: filter.search, mode: "insensitive" } },
            { phone: { contains: filter.search, mode: "insensitive" } },
          ]
        : undefined,
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.customer.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: limit, skip: (page - 1) * limit }),
      this.prisma.customer.count({ where }),
    ]);

    return { items: rows.map(toCustomerSummary), meta: buildPageMeta(page, limit, total) };
  }

  async get(customerId: string): Promise<CustomerSummary> {
    const row = await this.prisma.customer.findUnique({ where: { id: toId(customerId), isDeleted: false } });
    if (!row) throw new NotFoundException(`customer "${customerId}" not found`);
    return toCustomerSummary(row);
  }

  async create(input: CustomerInput, actorUserId: string | null): Promise<CustomerSummary> {
    const existing = await this.prisma.customer.findUnique({ where: { email: input.email } });
    if (existing) throw new ConflictException("a customer with this email already exists");

    const row = await this.prisma.customer.create({
      data: { ...toPrismaInput(input), email: input.email, createdBy: toIdOrNull(actorUserId), updatedBy: toIdOrNull(actorUserId) },
    });
    return toCustomerSummary(row);
  }

  async update(customerId: string, input: Partial<CustomerInput>, actorUserId: string | null): Promise<CustomerSummary> {
    const customerIdBig = toId(customerId);
    const existing = await this.prisma.customer.findUnique({ where: { id: customerIdBig, isDeleted: false }, select: { id: true } });
    if (!existing) throw new NotFoundException(`customer "${customerId}" not found`);

    if (input.email !== undefined) {
      const clash = await this.prisma.customer.findFirst({ where: { NOT: { id: customerIdBig }, email: input.email } });
      if (clash) throw new ConflictException("a customer with this email already exists");
    }

    const row = await this.prisma.customer.update({
      where: { id: customerIdBig },
      data: { ...toPrismaInput(input), updatedBy: toIdOrNull(actorUserId) },
    });
    return toCustomerSummary(row);
  }

  // Soft-delete, matching every other table's isDeleted/deletedAt/deletedBy/deletedReason pattern.
  async delete(customerId: string, actorUserId: string | null, reason?: string): Promise<void> {
    const customerIdBig = toId(customerId);
    const existing = await this.prisma.customer.findUnique({ where: { id: customerIdBig, isDeleted: false }, select: { id: true } });
    if (!existing) throw new NotFoundException(`customer "${customerId}" not found`);
    await this.prisma.customer.update({
      where: { id: customerIdBig },
      data: { isDeleted: true, deletedAt: new Date(), deletedBy: toIdOrNull(actorUserId), deletedReason: reason ?? null },
    });
  }

  async setActive(customerId: string, isActive: boolean, actorUserId: string | null): Promise<void> {
    const customerIdBig = toId(customerId);
    const existing = await this.prisma.customer.findUnique({ where: { id: customerIdBig, isDeleted: false }, select: { id: true } });
    if (!existing) throw new NotFoundException(`customer "${customerId}" not found`);
    await this.prisma.customer.update({ where: { id: customerIdBig }, data: { isActive, updatedBy: toIdOrNull(actorUserId) } });
  }
}
