import { ApiProperty } from "@nestjs/swagger";
import { PageMetaDto } from "../../../common/dto/shared.dto.js";

export class AuditLogEntryDto {
  @ApiProperty({ type: String })
  id!: string;

  @ApiProperty({ type: String, nullable: true })
  userId!: string | null;

  @ApiProperty({
    type: String,
    description: "Human-readable label for `action`",
    example: "Role assigned",
  })
  name!: string;

  @ApiProperty({
    type: String,
    description: "AuditEvent discriminant",
    example: "role_assigned",
  })
  action!: string;

  @ApiProperty({
    type: Object,
    description: "The rest of the AuditEvent's fields",
  })
  info!: unknown;

  @ApiProperty({ type: String, nullable: true, description: "Free-text note" })
  remarks!: string | null;

  @ApiProperty({ type: String })
  createdAt!: string;

  @ApiProperty({ type: String })
  updatedAt!: string;
}

export class AuditLogListResponseDto {
  @ApiProperty({ type: [AuditLogEntryDto] })
  items!: AuditLogEntryDto[];

  @ApiProperty({ type: PageMetaDto })
  meta!: PageMetaDto;
}
