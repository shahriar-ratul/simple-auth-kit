// Response shapes for the admin endpoints — the ones that describe *administered principals*
// rather than the caller's own identity. Here that principal is a membership of the named
// workspace, and an audit entry records which workspace it happened in.
import { ApiProperty } from "@nestjs/swagger";

export class UserSummaryDto {
  @ApiProperty({ type: String, description: "WorkspaceMember id — the handle for member-scoped operations" })
  memberId!: string;

  @ApiProperty({ type: String })
  userId!: string;

  @ApiProperty({ type: String })
  uuid!: string;

  @ApiProperty({ type: String })
  email!: string;

  @ApiProperty({ type: String, nullable: true, description: "Unique across the deployment." })
  firstName!: string | null;

  @ApiProperty({ type: String, nullable: true, description: "Unique across the deployment." })
  lastName!: string | null;

  @ApiProperty({ type: String, nullable: true })
  displayName!: string | null;

  @ApiProperty({ type: String, nullable: true, description: "Unique across the deployment." })
  phone!: string | null;

  @ApiProperty({ type: String, nullable: true, description: "Unique across the deployment." })
  username!: string | null;

  @ApiProperty({ type: String, nullable: true })
  photo!: string | null;

  @ApiProperty({ type: String, nullable: true, description: "ISO 8601. Set on every successful signup/login/OAuth callback, never on a token refresh." })
  lastLogin!: string | null;

  @ApiProperty({ type: Boolean, description: "Security/moderation block — distinct from isActive, see the model note." })
  blocked!: boolean;

  @ApiProperty({ type: Boolean, description: "Routine administrative on/off toggle — distinct from blocked, see the model note." })
  isActive!: boolean;

  @ApiProperty({ type: Boolean })
  twoFactorEnabled!: boolean;

  @ApiProperty({ type: [String] })
  roles!: string[];

  @ApiProperty({ type: String, nullable: true, description: "User id of whoever created this account, if it wasn't a self-signup." })
  createdBy!: string | null;

  @ApiProperty({ type: String, nullable: true, description: "User id of whoever last edited this account's profile." })
  updatedBy!: string | null;

  @ApiProperty({ type: String })
  createdAt!: string;

  @ApiProperty({ type: String })
  updatedAt!: string;
}

export class PageMetaDto {
  @ApiProperty({ type: Number, description: "1-indexed" })
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

export class UserListResponseDto {
  @ApiProperty({ type: [UserSummaryDto] })
  items!: UserSummaryDto[];

  @ApiProperty({ type: PageMetaDto })
  meta!: PageMetaDto;
}

export class AuditLogEntryDto {
  @ApiProperty({ type: String })
  id!: string;

  @ApiProperty({ type: String, nullable: true, description: "Null for events that happened outside any workspace" })
  workspaceId!: string | null;

  @ApiProperty({ type: String, nullable: true })
  userId!: string | null;

  @ApiProperty({ type: String, description: "Human-readable label for `action`", example: "Role assigned" })
  name!: string;

  @ApiProperty({ type: String, description: "AuditEvent discriminant", example: "role_assigned" })
  action!: string;

  @ApiProperty({ type: Object, description: "The rest of the AuditEvent's fields" })
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
