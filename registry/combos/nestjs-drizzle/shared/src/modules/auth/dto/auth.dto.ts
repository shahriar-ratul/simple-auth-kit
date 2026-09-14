// Swagger-only DTOs: these exist to give @nestjs/swagger a typed shape to generate the OpenAPI
// schema from. They are NOT wired into `@Body()` as the runtime type (the controller keeps its
// existing `Record<string, unknown>` + `requireString()` validation, unchanged, to avoid
// widening this into a class-validator migration with its own behavioral risk) — these are
// documentation-only, referenced via `@ApiBody({ type: ... })` / `@ApiResponse({ type: ... })`.
//
// Every `@ApiProperty` below passes an explicit `type` instead of relying on reflected
// `design:type` metadata — this repo runs via `tsx` (esbuild), which doesn't reliably emit
// decorator type metadata the way a full `tsc` build does, and @nestjs/swagger throws a
// "circular dependency" error at boot trying to reflect an unresolved type otherwise.
//
// Identity/session-scoped DTOs only — everything about *administered principals* (users, roles,
// permissions, audit log) lives in that feature module's own dto file instead.
import { ApiProperty } from "@nestjs/swagger";

export class SignupDto {
  @ApiProperty({ type: String, example: "alice@example.com" })
  email!: string;

  @ApiProperty({ type: String, example: "correct-horse-battery-staple" })
  password!: string;

  @ApiProperty({
    type: String,
    required: false,
    description: "Unique across the deployment.",
    example: "Alice",
  })
  firstName?: string;

  @ApiProperty({
    type: String,
    required: false,
    description: "Unique across the deployment.",
    example: "Nguyen",
  })
  lastName?: string;

  @ApiProperty({ type: String, required: false, example: "Alice Nguyen" })
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
}

export class LoginDto {
  @ApiProperty({
    type: String,
    description: "Email, username, or phone — whichever the account has set.",
    example: "alice@example.com",
  })
  identifier!: string;

  @ApiProperty({ type: String, example: "correct-horse-battery-staple" })
  password!: string;
}

export class LoginTwoFactorDto {
  @ApiProperty({
    type: String,
    description:
      "Returned by POST /auth/login when the account has 2FA enabled",
  })
  challengeToken!: string;

  @ApiProperty({
    type: String,
    description: "6-digit TOTP code, or an unused backup code",
    example: "123456",
  })
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
  @ApiProperty({
    type: String,
    description: "Raw token from the sendPasswordResetEmail hook",
  })
  token!: string;

  @ApiProperty({ type: String })
  newPassword!: string;
}

export class ChangePasswordDto {
  @ApiProperty({
    type: String,
    description:
      "The caller's current password, re-checked server-side before anything changes.",
  })
  currentPassword!: string;

  @ApiProperty({ type: String })
  newPassword!: string;
}

/** `PATCH /auth/me` only — self-service profile fields. The admin-surface edit (`PATCH /admin/users/:userId`) has its own, wider `UpdateUserDto` in admin.dto.ts. */
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

  @ApiProperty({
    type: String,
    nullable: true,
    description:
      "A data URI or an externally-hosted URL — stored as-is, never processed server-side.",
  })
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

  @ApiProperty({
    type: String,
    nullable: true,
    description:
      "A data URI or an externally-hosted URL — stored as-is, never processed server-side.",
  })
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

  @ApiProperty({
    type: String,
    description:
      "Absolute cut-off, fixed when the session was created. Refreshing does not extend it.",
  })
  expiresAt!: string;

  @ApiProperty({
    type: String,
    required: false,
    description:
      "The OAuth provider this login came through; absent for a password login.",
    example: "google",
  })
  provider?: string;

  @ApiProperty({ type: String, required: false })
  userAgent?: string;

  @ApiProperty({ type: String, required: false })
  ip?: string;
}

export class EnrollTwoFactorResponseDto {
  @ApiProperty({ type: String, description: "Base32 TOTP secret" })
  secret!: string;

  @ApiProperty({
    type: String,
    description: "otpauth:// provisioning URI, render as a QR code",
  })
  provisioningUri!: string;
}

export class ConfirmTwoFactorResponseDto {
  @ApiProperty({
    type: [String],
    description: "One-time recovery codes — shown once",
  })
  backupCodes!: string[];
}

export class OAuthStartResponseDto {
  @ApiProperty({
    type: String,
    description:
      "Redirect the user/webview to this URL to start the OAuth flow",
  })
  url!: string;
}
