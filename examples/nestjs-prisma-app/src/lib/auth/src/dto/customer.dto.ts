// Swagger-only DTOs — NOT wired into `@Body()` as the runtime type, same convention as
// dto/auth.dto.ts: the controller keeps its `Record<string, unknown>` + `requireString()`
// validation. Every `@ApiProperty` passes an explicit `type` because this repo runs via `tsx`
// (esbuild), which doesn't reliably emit decorator type metadata for reflection.
import { ApiProperty } from "@nestjs/swagger";
import { PageMetaDto } from "./admin.dto.js";

export class CreateCustomerDto {
  @ApiProperty({ type: String, example: "customer@example.com" })
  email!: string;

  @ApiProperty({ type: String, required: false })
  firstName?: string;

  @ApiProperty({ type: String, required: false })
  lastName?: string;

  @ApiProperty({ type: String, required: false, description: "Unique across the deployment." })
  username?: string;

  @ApiProperty({ type: String, required: false, description: "Unique across the deployment." })
  phone?: string;

  @ApiProperty({ type: String, required: false, format: "date", example: "1990-01-01" })
  dob?: string;

  @ApiProperty({ type: String, required: false, example: "male" })
  gender?: string;

  @ApiProperty({ type: String, required: false, format: "date", description: "Defaults to today when creating." })
  joinedDate?: string;

  @ApiProperty({ type: String, required: false, description: "A data URI or an externally-hosted URL — stored as-is, never processed server-side." })
  photo?: string;

  @ApiProperty({ type: Boolean, required: false })
  isEmailVerified?: boolean;

  @ApiProperty({ type: Boolean, required: false })
  isPhoneVerified?: boolean;

  @ApiProperty({ type: Boolean, required: false })
  isActive?: boolean;
}

export class UpdateCustomerDto {
  @ApiProperty({ type: String, required: false })
  email?: string;

  @ApiProperty({ type: String, required: false, nullable: true })
  firstName?: string | null;

  @ApiProperty({ type: String, required: false, nullable: true })
  lastName?: string | null;

  @ApiProperty({ type: String, required: false, nullable: true })
  username?: string | null;

  @ApiProperty({ type: String, required: false, nullable: true })
  phone?: string | null;

  @ApiProperty({ type: String, required: false, nullable: true, format: "date" })
  dob?: string | null;

  @ApiProperty({ type: String, required: false, nullable: true })
  gender?: string | null;

  @ApiProperty({ type: String, required: false, format: "date" })
  joinedDate?: string;

  @ApiProperty({ type: String, required: false, nullable: true, description: "A data URI or an externally-hosted URL — stored as-is, never processed server-side." })
  photo?: string | null;

  @ApiProperty({ type: Boolean, required: false })
  isEmailVerified?: boolean;

  @ApiProperty({ type: Boolean, required: false })
  isPhoneVerified?: boolean;

  @ApiProperty({ type: Boolean, required: false })
  isActive?: boolean;
}

/** Every column the `Customer` table has — no login credential exists to withhold, unlike `UserSummaryDto`. */
export class CustomerSummaryDto {
  @ApiProperty({ type: String })
  id!: string;

  @ApiProperty({ type: String })
  uuid!: string;

  @ApiProperty({ type: String, nullable: true })
  firstName!: string | null;

  @ApiProperty({ type: String, nullable: true })
  lastName!: string | null;

  @ApiProperty({ type: String, nullable: true, description: "Unique across the deployment." })
  username!: string | null;

  @ApiProperty({ type: String })
  email!: string;

  @ApiProperty({ type: String, nullable: true, description: "Unique across the deployment." })
  phone!: string | null;

  @ApiProperty({ type: String, nullable: true, format: "date" })
  dob!: string | null;

  @ApiProperty({ type: String, nullable: true })
  gender!: string | null;

  @ApiProperty({ type: String, format: "date" })
  joinedDate!: string;

  @ApiProperty({ type: String, nullable: true, description: "A data URI or an externally-hosted URL — stored as-is, never processed server-side." })
  photo!: string | null;

  @ApiProperty({ type: Boolean })
  isEmailVerified!: boolean;

  @ApiProperty({ type: Boolean })
  isPhoneVerified!: boolean;

  @ApiProperty({ type: Boolean })
  isActive!: boolean;

  @ApiProperty({ type: String, nullable: true })
  createdBy!: string | null;

  @ApiProperty({ type: String, nullable: true })
  updatedBy!: string | null;

  @ApiProperty({ type: String })
  createdAt!: string;

  @ApiProperty({ type: String })
  updatedAt!: string;
}

export class CustomerListResponseDto {
  @ApiProperty({ type: [CustomerSummaryDto] })
  items!: CustomerSummaryDto[];

  @ApiProperty({ type: PageMetaDto })
  meta!: PageMetaDto;
}
