// Tiny DTOs genuinely shared across feature modules (auth, admin, roles, permissions, audit-log)
// — kept here once rather than duplicated in each module's own dto file. Swagger-documentation
// only, like every other DTO in this combo — see the note atop auth.dto.ts.
import { ApiProperty } from '@nestjs/swagger';

export class OkResponseDto {
  @ApiProperty({ type: Boolean, enum: [true] })
  ok!: true;
}

export class DeleteReasonDto {
  @ApiProperty({
    type: String,
    required: false,
    description: 'Free-text note, for whoever reviews the deletion later.',
  })
  reason?: string;
}

export class PageMetaDto {
  @ApiProperty({ type: Number, description: '1-indexed' })
  page!: number;

  @ApiProperty({ type: Number })
  limit!: number;

  @ApiProperty({ type: Number })
  total!: number;

  @ApiProperty({ type: Number })
  pageCount!: number;

  @ApiProperty({ type: Boolean })
  hasPreviousPage!: boolean;

  @ApiProperty({ type: Boolean })
  hasNextPage!: boolean;
}
