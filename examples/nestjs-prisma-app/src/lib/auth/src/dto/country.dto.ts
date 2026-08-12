// Swagger-only DTOs — NOT wired into `@Body()` as the runtime type, same convention as
// dto/auth.dto.ts: the controller keeps its `Record<string, unknown>` + `requireString()`
// validation. Every `@ApiProperty` passes an explicit `type` because this repo runs via `tsx`
// (esbuild), which doesn't reliably emit decorator type metadata for reflection.
import { ApiProperty } from "@nestjs/swagger";
import { PageMetaDto } from "./admin.dto.js";

export class CreateCountryDto {
  @ApiProperty({ type: String, description: "Stable identifier, unique across the deployment.", example: "US" })
  code!: string;

  @ApiProperty({ type: String, example: "United States" })
  name!: string;

  @ApiProperty({ type: String, example: "🇺🇸" })
  emoji!: string;

  @ApiProperty({ type: String, example: "+1" })
  phoneCode!: string;

  @ApiProperty({ type: String, example: "USD" })
  currency!: string;

  @ApiProperty({ type: String, example: "US Dollar" })
  currencyName!: string;

  @ApiProperty({ type: String, description: "Unique across the deployment.", example: "US" })
  isoCode!: string;

  @ApiProperty({ type: String, required: false, nullable: true, description: "A data URI or an externally-hosted URL — stored as-is, never processed server-side." })
  flag?: string | null;

  @ApiProperty({ type: Boolean, required: false })
  isActive?: boolean;
}

export class UpdateCountryDto {
  @ApiProperty({ type: String, required: false })
  code?: string;

  @ApiProperty({ type: String, required: false })
  name?: string;

  @ApiProperty({ type: String, required: false })
  emoji?: string;

  @ApiProperty({ type: String, required: false })
  phoneCode?: string;

  @ApiProperty({ type: String, required: false })
  currency?: string;

  @ApiProperty({ type: String, required: false })
  currencyName?: string;

  @ApiProperty({ type: String, required: false })
  isoCode?: string;

  @ApiProperty({ type: String, required: false, nullable: true, description: "A data URI or an externally-hosted URL — stored as-is, never processed server-side." })
  flag?: string | null;

  @ApiProperty({ type: Boolean, required: false })
  isActive?: boolean;
}

/** Every column the `Country` table has — there is no secret to withhold, unlike `UserSummaryDto`. */
export class CountrySummaryDto {
  @ApiProperty({ type: String })
  id!: string;

  @ApiProperty({ type: String })
  uuid!: string;

  @ApiProperty({ type: String })
  code!: string;

  @ApiProperty({ type: String })
  name!: string;

  @ApiProperty({ type: String })
  emoji!: string;

  @ApiProperty({ type: String })
  phoneCode!: string;

  @ApiProperty({ type: String })
  currency!: string;

  @ApiProperty({ type: String })
  currencyName!: string;

  @ApiProperty({ type: String })
  isoCode!: string;

  @ApiProperty({ type: String, nullable: true })
  flag!: string | null;

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

export class CountryListResponseDto {
  @ApiProperty({ type: [CountrySummaryDto] })
  items!: CountrySummaryDto[];

  @ApiProperty({ type: PageMetaDto })
  meta!: PageMetaDto;
}
