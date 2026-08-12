// Swagger-only DTOs, documentation-only — NOT wired into `@Body()` as the runtime type (the
// controller keeps its `Record<string, unknown>` + `requireString()` validation). Every
// `@ApiProperty` passes an explicit `type` because this repo runs via `tsx` (esbuild), which
// doesn't reliably emit decorator type metadata for reflection.
import { ApiProperty } from "@nestjs/swagger";

export class SignupDto {
  @ApiProperty({ type: String, example: "alice@example.com" })
  email!: string;

  @ApiProperty({ type: String, example: "correct-horse-battery-staple" })
  password!: string;

  @ApiProperty({ type: String, required: false, description: "Unique across the deployment.", example: "Alice" })
  firstName?: string;

  @ApiProperty({ type: String, required: false, description: "Unique across the deployment.", example: "Nguyen" })
  lastName?: string;

  @ApiProperty({ type: String, required: false, example: "Alice Nguyen" })
  displayName?: string;

  @ApiProperty({ type: String, required: false, description: "Unique across the deployment." })
  phone?: string;

  @ApiProperty({ type: String, required: false, description: "Unique across the deployment." })
  username?: string;
}

export class LoginDto {
  @ApiProperty({ type: String, description: "Email, username, or phone — whichever the account has set.", example: "alice@example.com" })
  identifier!: string;

  @ApiProperty({ type: String, example: "correct-horse-battery-staple" })
  password!: string;
}

export class LoginTwoFactorDto {
  @ApiProperty({ type: String, description: "Returned by POST /auth/login when the account has 2FA enabled" })
  challengeToken!: string;

  @ApiProperty({ type: String, description: "6-digit TOTP code, or an unused backup code", example: "123456" })
  code!: string;
}

export class RefreshDto {
  @ApiProperty({ type: String })
  refreshToken!: string;
}

export class TwoFactorCodeDto {
  @ApiProperty({ type: String, example: "123456" })
  code!: string;
}

export class ForgotPasswordDto {
  @ApiProperty({ type: String })
  email!: string;
}

export class ResetPasswordDto {
  @ApiProperty({ type: String, description: "Raw token from the sendPasswordResetEmail hook" })
  token!: string;

  @ApiProperty({ type: String })
  newPassword!: string;
}

export class ChangePasswordDto {
  @ApiProperty({ type: String, description: "The caller's current password, re-checked server-side before anything changes." })
  currentPassword!: string;

  @ApiProperty({ type: String })
  newPassword!: string;
}

export class CreateRoleDto {
  @ApiProperty({ type: String, description: "Stable identifier. Grants and assignments are keyed on it.", example: "billing-manager" })
  slug!: string;

  @ApiProperty({ type: String, required: false, description: "Unique across the deployment. Defaults to displayName, then slug." })
  name?: string;

  @ApiProperty({ type: String, required: false, description: "Human label for the console. Defaults to the slug.", example: "Billing manager" })
  displayName?: string;

  @ApiProperty({ type: String, required: false, nullable: true })
  description?: string | null;

  @ApiProperty({ type: Boolean, required: false, description: "Given to every newly signed-up user. Defaults to false." })
  isDefault?: boolean;

  @ApiProperty({ type: Boolean, required: false, description: "Defaults to true." })
  isActive?: boolean;
}

export class UpdateRoleDto {
  @ApiProperty({ type: String, required: false })
  name?: string;

  @ApiProperty({ type: String, required: false })
  displayName?: string;

  @ApiProperty({ type: String, required: false, nullable: true })
  description?: string | null;

  @ApiProperty({ type: Boolean, required: false, description: "Given to every newly signed-up user." })
  isDefault?: boolean;

  @ApiProperty({ type: Boolean, required: false, description: "false suspends the role without deleting it — it stops granting immediately." })
  isActive?: boolean;
}

export class CreateUserDto {
  @ApiProperty({ type: String, example: "alice@example.com" })
  email!: string;

  @ApiProperty({ type: String, description: "Set directly — there is no invitation email, the account is usable immediately." })
  password!: string;

  @ApiProperty({ type: String, required: false, description: "Unique across the deployment." })
  firstName?: string;

  @ApiProperty({ type: String, required: false, description: "Unique across the deployment." })
  lastName?: string;

  @ApiProperty({ type: String, required: false })
  displayName?: string;

  @ApiProperty({ type: String, required: false, description: "Unique across the deployment." })
  phone?: string;

  @ApiProperty({ type: String, required: false, description: "Unique across the deployment." })
  username?: string;

  @ApiProperty({ type: String, required: false, description: "A data URI or an externally-hosted URL — stored as-is, never processed server-side." })
  photo?: string;

  @ApiProperty({ type: String, required: false, description: "Date of birth, ISO date (yyyy-mm-dd)." })
  dob?: string;

  @ApiProperty({ type: String, required: false })
  gender?: string;

  @ApiProperty({ type: String, required: false, description: "ISO date (yyyy-mm-dd). Defaults to today." })
  joinedDate?: string;

  @ApiProperty({ type: Boolean, required: false, description: "Defaults to true — false creates the account already deactivated." })
  isActive?: boolean;

  @ApiProperty({ type: [String], required: false, description: "Role slugs to assign. Defaults to whichever roles are flagged isDefault, same as a self-signup." })
  roles?: string[];
}

export class UpdateUserDto {
  @ApiProperty({ type: String, required: false, nullable: true, description: "Unique across the deployment." })
  firstName?: string | null;

  @ApiProperty({ type: String, required: false, nullable: true, description: "Unique across the deployment." })
  lastName?: string | null;

  @ApiProperty({ type: String, required: false, nullable: true })
  displayName?: string | null;

  @ApiProperty({ type: String, required: false, nullable: true, description: "Unique across the deployment." })
  phone?: string | null;

  @ApiProperty({ type: String, required: false, nullable: true, description: "Unique across the deployment." })
  username?: string | null;

  @ApiProperty({ type: String, required: false, nullable: true })
  photo?: string | null;

  @ApiProperty({ type: String, required: false, nullable: true, description: "Date of birth, ISO date (yyyy-mm-dd)." })
  dob?: string | null;

  @ApiProperty({ type: String, required: false, nullable: true })
  gender?: string | null;

  @ApiProperty({ type: String, required: false, description: "ISO date (yyyy-mm-dd). Not nullable — omit to leave unchanged." })
  joinedDate?: string;
}

export class DeleteReasonDto {
  @ApiProperty({ type: String, required: false, description: "Free-text note, for whoever reviews the deletion later." })
  reason?: string;
}

export class AttachPermissionDto {
  @ApiProperty({ type: String, description: "Permission slug", example: "billing:manage" })
  permission!: string;
}

export class AssignRoleDto {
  @ApiProperty({ type: String, description: "Role slug", example: "billing-manager" })
  role!: string;
}

/** One `Permission` row — the catalog as the admin endpoints return it. */
export class PermissionSummaryDto {
  @ApiProperty({ type: String })
  id!: string;

  @ApiProperty({ type: String, description: "The ability itself: `@CheckAbility(slug)` on the server, `ability.can(slug, ABILITY_SUBJECT)` in a client.", example: "users:read" })
  slug!: string;

  @ApiProperty({ type: String, description: "Unique across the deployment, alongside slug/displayName.", example: "List users" })
  name!: string;

  @ApiProperty({ type: String, example: "List users" })
  displayName!: string;

  @ApiProperty({ type: String, nullable: true })
  description!: string | null;

  @ApiProperty({ type: String, description: "Console grouping — a permission matrix renders one section per group.", example: "Users" })
  group!: string;

  @ApiProperty({ type: Number })
  groupOrder!: number;

  @ApiProperty({ type: Number })
  order!: number;

  @ApiProperty({ type: Boolean, description: "false takes the permission out of every ability that would otherwise carry it, without unpicking a single grant." })
  isActive!: boolean;
}

export class PermissionListResponseDto {
  @ApiProperty({ type: [PermissionSummaryDto] })
  permissions!: PermissionSummaryDto[];
}

export class DefinePermissionDto {
  @ApiProperty({ type: String, example: "billing:manage" })
  slug!: string;

  @ApiProperty({ type: String, required: false, description: "Unique across the deployment. Defaults to displayName, then slug, when creating." })
  name?: string;

  @ApiProperty({ type: String, required: false, description: "Defaults to the slug when creating." })
  displayName?: string;

  @ApiProperty({ type: String, required: false, nullable: true })
  description?: string | null;

  @ApiProperty({ type: String, required: false, description: 'Defaults to "Custom" when creating.' })
  group?: string;

  @ApiProperty({ type: Number, required: false })
  groupOrder?: number;

  @ApiProperty({ type: Number, required: false })
  order?: number;

  @ApiProperty({ type: Boolean, required: false, description: "Set false to switch the capability off deployment-wide, effective on the next request." })
  isActive?: boolean;
}

export class GrantPermissionDto {
  @ApiProperty({ type: String, example: "billing:manage" })
  permission!: string;
}

// ---- responses ----

export class AuthTokensDto {
  @ApiProperty({ type: String })
  accessToken!: string;

  @ApiProperty({ type: String })
  refreshToken!: string;

  @ApiProperty({ type: String })
  sessionId!: string;
}

export class RefreshResponseDto {
  @ApiProperty({ type: String })
  accessToken!: string;

  @ApiProperty({ type: String })
  refreshToken!: string;
}

export class TwoFactorChallengeDto {
  @ApiProperty({ type: Boolean, enum: [true] })
  twoFactorRequired!: true;

  @ApiProperty({ type: String })
  challengeToken!: string;
}

export class CurrentUserDto {
  @ApiProperty({ type: String, description: "User id" })
  sub!: string;

  @ApiProperty({ type: String })
  sessionId!: string;

  @ApiProperty({ type: [String] })
  roles!: string[];

  @ApiProperty({
    type: [String],
    description:
      "Permission slugs. `defineAbilitiesFor(permissions)` from src/ability.ts rebuilds, in the client, the very ability the server's own guard just answered with — " +
      "so the console holds no second copy of the rules and cannot offer an action the API will refuse.",
    example: ["users:read", "audit-log:read"],
  })
  permissions!: string[];

  @ApiProperty({ type: Boolean })
  twoFactorEnabled!: boolean;

  @ApiProperty({ type: String })
  email!: string;

  @ApiProperty({ type: String, nullable: true })
  firstName!: string | null;

  @ApiProperty({ type: String, nullable: true })
  lastName!: string | null;

  @ApiProperty({ type: String, nullable: true })
  displayName!: string | null;

  @ApiProperty({ type: String, nullable: true })
  phone!: string | null;

  @ApiProperty({ type: String, nullable: true })
  username!: string | null;

  @ApiProperty({ type: String, nullable: true, description: "A data URI or an externally-hosted URL — stored as-is, never processed server-side." })
  photo!: string | null;
}

/** `PATCH /auth/me`'s response — the same shape whether or not the combo has workspaces, since a profile isn't a workspace concept. */
export class SelfProfileDto {
  @ApiProperty({ type: String })
  id!: string;

  @ApiProperty({ type: String })
  email!: string;

  @ApiProperty({ type: String, nullable: true })
  firstName!: string | null;

  @ApiProperty({ type: String, nullable: true })
  lastName!: string | null;

  @ApiProperty({ type: String, nullable: true })
  displayName!: string | null;

  @ApiProperty({ type: String, nullable: true })
  phone!: string | null;

  @ApiProperty({ type: String, nullable: true })
  username!: string | null;

  @ApiProperty({ type: String, nullable: true, description: "A data URI or an externally-hosted URL — stored as-is, never processed server-side." })
  photo!: string | null;

  @ApiProperty({ type: String, format: "date-time" })
  createdAt!: string;
}

/** One live session, as a "your devices" screen would render it. Revoked and expired rows are not returned. */
export class SessionSummaryDto {
  @ApiProperty({ type: String })
  id!: string;

  @ApiProperty({ type: String })
  createdAt!: string;

  @ApiProperty({ type: String, description: "Absolute cut-off, fixed when the session was created. Refreshing does not extend it." })
  expiresAt!: string;

  @ApiProperty({ type: String, required: false, description: "The OAuth provider this login came through; absent for a password login.", example: "google" })
  provider?: string;

  @ApiProperty({ type: String, required: false })
  userAgent?: string;

  @ApiProperty({ type: String, required: false })
  ip?: string;
}

export class OkResponseDto {
  @ApiProperty({ type: Boolean, enum: [true] })
  ok!: true;
}

export class EnrollTwoFactorResponseDto {
  @ApiProperty({ type: String, description: "Base32 TOTP secret" })
  secret!: string;

  @ApiProperty({ type: String, description: "otpauth:// provisioning URI, render as a QR code" })
  provisioningUri!: string;
}

export class ConfirmTwoFactorResponseDto {
  @ApiProperty({ type: [String], description: "One-time recovery codes — shown once" })
  backupCodes!: string[];
}

export class OAuthStartResponseDto {
  @ApiProperty({ type: String, description: "Redirect the user/webview to this URL to start the OAuth flow" })
  url!: string;
}

export class RoleSummaryDto {
  @ApiProperty({ type: String })
  id!: string;

  @ApiProperty({ type: String })
  slug!: string;

  @ApiProperty({ type: String, description: "Unique across the deployment, alongside slug/displayName." })
  name!: string;

  @ApiProperty({ type: String })
  displayName!: string;

  @ApiProperty({ type: Boolean, description: "Given to every new user (or, in the workspace variant, every new membership)." })
  isDefault!: boolean;

  @ApiProperty({ type: Boolean })
  isActive!: boolean;

  @ApiProperty({ type: [String], description: "Permission slugs currently attached to this role." })
  permissions!: string[];
}

export class RoleListResponseDto {
  @ApiProperty({ type: [RoleSummaryDto] })
  roles!: RoleSummaryDto[];
}
