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

  @ApiProperty({ type: String, nullable: true, description: "Date of birth, ISO 8601." })
  dob!: string | null;

  @ApiProperty({ type: String, nullable: true })
  gender!: string | null;

  @ApiProperty({ type: String, description: "ISO 8601. Defaults to the account's creation day." })
  joinedDate!: string;

  @ApiProperty({ type: String, nullable: true, description: "ISO 8601. Set on every successful signup/login/OAuth callback, never on a token refresh." })
  lastLogin!: string | null;

  @ApiProperty({ type: Boolean })
  blocked!: boolean;

  @ApiProperty({ type: [String] })
  roles!: string[];

  @ApiProperty({ type: String })
  createdAt!: string;
}

export class UserListResponseDto {
  @ApiProperty({ type: [UserSummaryDto] })
  users!: UserSummaryDto[];

  @ApiProperty({ type: String, nullable: true })
  nextCursor!: string | null;
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
  entries!: AuditLogEntryDto[];

  @ApiProperty({ type: String, nullable: true })
  nextCursor!: string | null;
}
