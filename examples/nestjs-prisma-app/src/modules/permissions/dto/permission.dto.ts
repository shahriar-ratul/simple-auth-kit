// Swagger-only DTOs — see the note atop auth.dto.ts. Permission-catalog-scoped only;
// user-scoped direct grants (`POST /admin/users/:userId/permissions`) live in admin.dto.ts instead.
import { ApiProperty } from '@nestjs/swagger';

/** One `Permission` row — the catalog as the admin endpoints return it. */
export class PermissionSummaryDto {
  @ApiProperty({ type: String })
  id!: string;

  @ApiProperty({
    type: String,
    description:
      'The ability itself: `@CheckAbility(slug)` on the server, `ability.can(slug, ABILITY_SUBJECT)` in a client.',
    example: 'users:read',
  })
  slug!: string;

  @ApiProperty({
    type: String,
    description: 'Unique across the deployment, alongside slug/displayName.',
    example: 'List users',
  })
  name!: string;

  @ApiProperty({ type: String, example: 'List users' })
  displayName!: string;

  @ApiProperty({ type: String, nullable: true })
  description!: string | null;

  @ApiProperty({
    type: String,
    description: 'Console grouping — a permission matrix renders one section per group.',
    example: 'Users',
  })
  group!: string;

  @ApiProperty({ type: Number })
  groupOrder!: number;

  @ApiProperty({ type: Number })
  order!: number;

  @ApiProperty({
    type: Boolean,
    description:
      'false takes the permission out of every ability that would otherwise carry it, without unpicking a single grant.',
  })
  isActive!: boolean;
}

export class PermissionListResponseDto {
  @ApiProperty({ type: [PermissionSummaryDto] })
  permissions!: PermissionSummaryDto[];
}

export class DefinePermissionDto {
  @ApiProperty({ type: String, example: 'billing:manage' })
  slug!: string;

  @ApiProperty({
    type: String,
    required: false,
    description: 'Unique across the deployment. Defaults to displayName, then slug, when creating.',
  })
  name?: string;

  @ApiProperty({
    type: String,
    required: false,
    description: 'Defaults to the slug when creating.',
  })
  displayName?: string;

  @ApiProperty({ type: String, required: false, nullable: true })
  description?: string | null;

  @ApiProperty({
    type: String,
    required: false,
    description: 'Defaults to "Custom" when creating.',
  })
  group?: string;

  @ApiProperty({ type: Number, required: false })
  groupOrder?: number;

  @ApiProperty({ type: Number, required: false })
  order?: number;

  @ApiProperty({
    type: Boolean,
    required: false,
    description: 'Set false to switch the capability off deployment-wide, effective on the next request.',
  })
  isActive?: boolean;
}
