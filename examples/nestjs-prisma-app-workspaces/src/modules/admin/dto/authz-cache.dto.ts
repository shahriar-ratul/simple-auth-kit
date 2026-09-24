// Swagger-only shapes for the authz-cache admin endpoints (see `AuthzCache.inspect`/`clear`).
import { ApiProperty } from '@nestjs/swagger';

export class AuthzCacheStatsDto {
  @ApiProperty({
    description: 'Resolutions from the database since process start.',
  })
  resolutions!: number;

  @ApiProperty({
    description: 'Requests served from the cache since process start.',
  })
  hits!: number;
}

export class AuthzCacheEntryDto {
  @ApiProperty() key!: string;
  @ApiProperty() userId!: string;
  @ApiProperty({ required: false, description: 'Workspaces variant only.' })
  workspaceId?: string;
  @ApiProperty({ type: String, nullable: true }) version!: string | null;
  @ApiProperty({
    description: 'Stored under an older `authz_version` — the next request re-resolves it.',
  })
  stale!: boolean;
  @ApiProperty({ type: Number, nullable: true }) ttlSeconds!: number | null;
  @ApiProperty({ type: [String] }) roles!: string[];
  @ApiProperty({ type: [String] }) permissions!: string[];
}

export class AuthzCacheInspectionDto {
  @ApiProperty({
    description: 'Caching happens: enabled and a store is configured.',
  })
  active!: boolean;
  @ApiProperty() enabled!: boolean;
  @ApiProperty() revalidate!: boolean;
  @ApiProperty() ttlSeconds!: number;
  @ApiProperty() hasStore!: boolean;
  @ApiProperty({
    description: 'The store implements `list`, so `entries` is filled in.',
  })
  canList!: boolean;
  @ApiProperty({ description: 'The current `authz_version`.' })
  version!: string;
  @ApiProperty({ type: AuthzCacheStatsDto }) stats!: AuthzCacheStatsDto;
  @ApiProperty({ type: [AuthzCacheEntryDto], nullable: true })
  entries!: AuthzCacheEntryDto[] | null;
}

export class AuthzCacheClearDto {
  @ApiProperty({
    description: 'The new `authz_version` — every cached entry is now stale.',
  })
  version!: string;
  @ApiProperty({
    type: Number,
    nullable: true,
    description: "Entries deleted, or null when the store can't clear.",
  })
  removed!: number | null;
}
