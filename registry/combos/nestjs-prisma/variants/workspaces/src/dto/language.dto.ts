// Swagger-only DTOs — NOT wired into `@Body()` as the runtime type, same convention as
// dto/auth.dto.ts: the controller keeps its `Record<string, unknown>` + `requireString()`
// validation. Every `@ApiProperty` passes an explicit `type` because this repo runs via `tsx`
// (esbuild), which doesn't reliably emit decorator type metadata for reflection.
import { ApiProperty } from "@nestjs/swagger";
import { PageMetaDto } from "./admin.dto.js";

export class CreateLanguageDto {
  @ApiProperty({ type: String, description: "Stable identifier, unique across the deployment.", example: "en" })
  code!: string;

  @ApiProperty({ type: String, example: "English" })
  name!: string;

  @ApiProperty({ type: String, example: "English" })
  nativeName!: string;

  @ApiProperty({ type: String, required: false, enum: ["ltr", "rtl"], description: 'Defaults to "ltr" when creating.' })
  direction?: string;

  @ApiProperty({ type: Boolean, required: false })
  isDefault?: boolean;

  @ApiProperty({ type: Boolean, required: false })
  isActive?: boolean;
}

export class UpdateLanguageDto {
  @ApiProperty({ type: String, required: false })
  code?: string;

  @ApiProperty({ type: String, required: false })
  name?: string;

  @ApiProperty({ type: String, required: false })
  nativeName?: string;

  @ApiProperty({ type: String, required: false, enum: ["ltr", "rtl"] })
  direction?: string;

  @ApiProperty({ type: Boolean, required: false })
  isDefault?: boolean;

  @ApiProperty({ type: Boolean, required: false })
  isActive?: boolean;
}

/** Every column the `Language` table has — there is no secret to withhold, unlike `UserSummaryDto`. */
export class LanguageSummaryDto {
  @ApiProperty({ type: String })
  id!: string;

  @ApiProperty({ type: String })
  uuid!: string;

  @ApiProperty({ type: String })
  code!: string;

  @ApiProperty({ type: String })
  name!: string;

  @ApiProperty({ type: String })
  nativeName!: string;

  @ApiProperty({ type: String, enum: ["ltr", "rtl"] })
  direction!: string;

  @ApiProperty({ type: Boolean, description: "Given to a new deployment's default locale." })
  isDefault!: boolean;

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

export class LanguageListResponseDto {
  @ApiProperty({ type: [LanguageSummaryDto] })
  items!: LanguageSummaryDto[];

  @ApiProperty({ type: PageMetaDto })
  meta!: PageMetaDto;
}
