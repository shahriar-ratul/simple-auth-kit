// DTOs for the admin surface: member management, block/activate, and member-scoped role/
// permission assignment — the ones that describe *administered principals* rather than the
// caller's own identity. Here that principal is a membership of the named workspace. Kept apart
// from auth.dto.ts for that reason; role/permission-catalog DTOs live in their own modules
// (roles/dto/role.dto.ts, permissions/dto/permission.dto.ts) instead.
import { ApiProperty } from "@nestjs/swagger";
import { PageMetaDto } from "@/common/dto/shared.dto";

export class UserSummaryDto {
  @ApiProperty({
    type: String,
    description: "WorkspaceMember id — the handle for member-scoped operations",
  })
  memberId!: string;

  @ApiProperty({ type: String })
  userId!: string;

  @ApiProperty({ type: String })
  uuid!: string;

  @ApiProperty({ type: String })
  email!: string;

  @ApiProperty({
    type: String,
    nullable: true,
    description: "Unique across the deployment.",
  })
  firstName!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description: "Unique across the deployment.",
  })
  lastName!: string | null;

  @ApiProperty({ type: String, nullable: true })
  displayName!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description: "Unique across the deployment.",
  })
  phone!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description: "Unique across the deployment.",
  })
  username!: string | null;

  @ApiProperty({ type: String, nullable: true })
  photo!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description: "Date of birth, ISO 8601.",
  })
  dob!: string | null;

  @ApiProperty({ type: String, nullable: true })
  gender!: string | null;

  @ApiProperty({
    type: String,
    description: "ISO 8601. Defaults to the account's creation day.",
  })
  joinedDate!: string;

  @ApiProperty({
    type: String,
    nullable: true,
    description:
      "ISO 8601. Set on every successful signup/login/OAuth callback, never on a token refresh.",
  })
  lastLogin!: string | null;

  @ApiProperty({
    type: Boolean,
    description:
      "Security/moderation block — distinct from isActive, see the model note.",
  })
  blocked!: boolean;

  @ApiProperty({
    type: Boolean,
    description:
      "Routine administrative on/off toggle — distinct from blocked, see the model note.",
  })
  isActive!: boolean;

  @ApiProperty({ type: Boolean })
  twoFactorEnabled!: boolean;

  @ApiProperty({ type: [String] })
  roles!: string[];

  @ApiProperty({
    type: String,
    nullable: true,
    description:
      "User id of whoever created this account, if it wasn't a self-signup.",
  })
  createdBy!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description: "User id of whoever last edited this account's profile.",
  })
  updatedBy!: string | null;

  @ApiProperty({ type: String })
  createdAt!: string;

  @ApiProperty({ type: String })
  updatedAt!: string;
}

export class UserListResponseDto {
  @ApiProperty({ type: [UserSummaryDto] })
  items!: UserSummaryDto[];

  @ApiProperty({ type: PageMetaDto })
  meta!: PageMetaDto;
}

export class CreateUserDto {
  @ApiProperty({ type: String, example: "alice@example.com" })
  email!: string;

  @ApiProperty({
    type: String,
    description:
      "Set directly — there is no invitation email, the account is usable immediately.",
  })
  password!: string;

  @ApiProperty({
    type: String,
    required: false,
    description: "Unique across the deployment.",
  })
  firstName?: string;

  @ApiProperty({
    type: String,
    required: false,
    description: "Unique across the deployment.",
  })
  lastName?: string;

  @ApiProperty({ type: String, required: false })
  displayName?: string;

  @ApiProperty({
    type: String,
    required: false,
    description: "Unique across the deployment.",
  })
  phone?: string;

  @ApiProperty({
    type: String,
    required: false,
    description: "Unique across the deployment.",
  })
  username?: string;

  @ApiProperty({
    type: [String],
    required: false,
    description:
      "Role slugs to assign in this workspace. Defaults to whichever roles are flagged isDefault.",
  })
  roles?: string[];
}

/** `PATCH /admin/users/:userId` — the admin-surface edit of a member's profile. Self-service profile edits (`PATCH /auth/me`) have their own `UpdateUserDto` in auth.dto.ts. */
export class UpdateUserDto {
  @ApiProperty({
    type: String,
    required: false,
    nullable: true,
    description: "Unique across the deployment.",
  })
  firstName?: string | null;

  @ApiProperty({
    type: String,
    required: false,
    nullable: true,
    description: "Unique across the deployment.",
  })
  lastName?: string | null;

  @ApiProperty({ type: String, required: false, nullable: true })
  displayName?: string | null;

  @ApiProperty({
    type: String,
    required: false,
    nullable: true,
    description: "Unique across the deployment.",
  })
  phone?: string | null;

  @ApiProperty({
    type: String,
    required: false,
    nullable: true,
    description: "Unique across the deployment.",
  })
  username?: string | null;

  @ApiProperty({ type: String, required: false, nullable: true })
  photo?: string | null;
}

export class AssignRoleDto {
  @ApiProperty({
    type: String,
    description: "Role slug",
    example: "billing-manager",
  })
  role!: string;
}

export class GrantPermissionDto {
  @ApiProperty({ type: String, example: "billing:manage" })
  permission!: string;
}
