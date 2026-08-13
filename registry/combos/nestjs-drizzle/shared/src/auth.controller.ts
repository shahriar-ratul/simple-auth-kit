import { BadRequestException, Body, Controller, Get, Inject, Ip, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiBody, ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { AUTH_CONFIG, AuthConfig } from "./auth.config.js";
import { AuthGuard } from "./auth.guard.js";
import { AuthService } from "./auth.service.js";
import { AuthzGuard } from "./authz.guard.js";
import { Authenticated, Public } from "./route-tiers.js";
import {
  AuthTokensDto,
  ChangePasswordDto,
  ConfirmTwoFactorResponseDto,
  CurrentUserDto,
  EnrollTwoFactorResponseDto,
  ForgotPasswordDto,
  LoginDto,
  LoginTwoFactorDto,
  OAuthStartResponseDto,
  OkResponseDto,
  RefreshDto,
  RefreshResponseDto,
  ResetPasswordDto,
  SelfProfileDto,
  SessionSummaryDto,
  SignupDto,
  TwoFactorChallengeDto,
  TwoFactorCodeDto,
  UpdateUserDto,
} from "./dto/auth.dto.js";

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) throw new BadRequestException(`${field} is required`);
  return value;
}

const optionalString = (value: unknown): string | undefined => (typeof value === "string" ? value : undefined);

/**
 * Identity endpoints — everything that is about *a user*, never about a group of them.
 * Administration lives in admin.controller.ts.
 */
@ApiTags("auth")
@Controller("auth")
export class AuthController {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(AUTH_CONFIG) private readonly config: AuthConfig,
  ) {}

  @Post("signup")
  @Public()
  @ApiOperation({ summary: "Create a user and issue a session" })
  @ApiBody({ type: SignupDto })
  @ApiResponse({ status: 201, type: AuthTokensDto })
  async signup(@Body() body: Record<string, unknown>, @Req() req: Request, @Ip() ip: string) {
    return this.auth.signup({
      email: requireString(body.email, "email"),
      password: requireString(body.password, "password"),
      firstName: optionalString(body.firstName),
      lastName: optionalString(body.lastName),
      displayName: optionalString(body.displayName),
      phone: optionalString(body.phone),
      username: optionalString(body.username),
      userAgent: req.headers["user-agent"],
      ip,
    });
  }

  @Post("login")
  @Public()
  @ApiOperation({
    summary: "Log in with email, username, or phone + password",
    description: "identifier is matched against email, username, and phone, in that order. Returns tokens directly, or a 2FA challenge if the account has 2FA enabled.",
  })
  @ApiBody({ type: LoginDto })
  @ApiResponse({ status: 201, schema: { oneOf: [{ $ref: "#/components/schemas/AuthTokensDto" }, { $ref: "#/components/schemas/TwoFactorChallengeDto" }] } })
  async login(@Body() body: Record<string, unknown>, @Req() req: Request, @Ip() ip: string) {
    return this.auth.login({
      identifier: requireString(body.identifier, "identifier"),
      password: requireString(body.password, "password"),
      userAgent: req.headers["user-agent"],
      ip,
    });
  }

  @Post("login/2fa")
  @Public()
  @ApiOperation({ summary: "Complete the 2FA challenge from POST /auth/login" })
  @ApiBody({ type: LoginTwoFactorDto })
  @ApiResponse({ status: 201, type: AuthTokensDto })
  async loginTwoFactor(@Body() body: Record<string, unknown>, @Req() req: Request, @Ip() ip: string) {
    return this.auth.loginTwoFactor({
      challengeToken: requireString(body.challengeToken, "challengeToken"),
      code: requireString(body.code, "code"),
      userAgent: req.headers["user-agent"],
      ip,
    });
  }

  @Post("refresh")
  @Public()
  @ApiOperation({ summary: "Rotate a refresh token for a new access+refresh pair" })
  @ApiBody({ type: RefreshDto })
  @ApiResponse({ status: 201, type: RefreshResponseDto })
  async refresh(@Body() body: Record<string, unknown>) {
    return this.auth.refresh(requireString(body.refreshToken, "refreshToken"));
  }

  @Get("me")
  @Authenticated()
  @ApiBearerAuth()
  @UseGuards(AuthGuard, AuthzGuard)
  @ApiOperation({
    summary: "Current session's identity",
    description:
      "`roles` and `permissions` are whatever applies to this request — see AuthzGuard for how they are resolved. " +
      "`permissions` is the caller's whole authorization: `defineAbilitiesFor(permissions)` from src/ability.ts rebuilds, " +
      "in the client, the identical CASL ability the server's own guard just answered with, so the UI cannot disagree with " +
      "what the API will allow.",
  })
  @ApiResponse({ status: 200, type: CurrentUserDto })
  async me(@Req() req: Request) {
    const { sub, sessionId } = req.auth!;
    const [{ twoFactorEnabled }, profile] = await Promise.all([this.auth.getTwoFactorStatus(sub), this.auth.getProfile(sub)]);
    // The same `req.authz` AbilityGuard's ability was built from — not re-resolved here.
    return {
      sub,
      sessionId,
      roles: req.authz?.roles ?? [],
      permissions: req.authz?.permissions ?? [],
      twoFactorEnabled,
      email: profile.email,
      firstName: profile.firstName,
      lastName: profile.lastName,
      displayName: profile.displayName,
      phone: profile.phone,
      username: profile.username,
      photo: profile.photo,
    };
  }

  @Get("sessions")
  @Authenticated()
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: "List the current user's active (non-revoked) sessions" })
  @ApiResponse({ status: 200, type: [SessionSummaryDto] })
  async sessions(@Req() req: Request) {
    return this.auth.listActiveSessions(req.auth!.sub);
  }

  @Post("logout")
  @Authenticated()
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: "Revoke the current session" })
  @ApiResponse({ status: 201, type: OkResponseDto })
  async logout(@Req() req: Request, @Ip() ip: string) {
    const { sessionId, jti, sub } = req.auth!;
    // The revoker is the caller themselves. Recorded so the row can later be told apart from a
    // session an administrator ended — see `sessions.revoked_by`.
    await this.auth.logout(sessionId, jti, this.config.accessTokenTtlSeconds, { userId: sub, ip });
    return { ok: true };
  }

  @Post("logout-all")
  @Authenticated()
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: "Revoke every session for the current user" })
  @ApiResponse({ status: 201, type: OkResponseDto })
  async logoutAll(@Req() req: Request, @Ip() ip: string) {
    await this.auth.logoutAll(req.auth!.sub, { userId: req.auth!.sub, ip });
    return { ok: true };
  }

  @Post("logout-others")
  @Authenticated()
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: "Revoke every session except the current one" })
  @ApiResponse({ status: 201, type: OkResponseDto })
  async logoutOthers(@Req() req: Request, @Ip() ip: string) {
    await this.auth.logoutOthers(req.auth!.sub, req.auth!.sessionId, { userId: req.auth!.sub, ip });
    return { ok: true };
  }

  @Post("password/change")
  @Authenticated()
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  @ApiOperation({
    summary: "Change the current password",
    description: "Requires the current password. Every other session is revoked; the one making this call is left alone.",
  })
  @ApiBody({ type: ChangePasswordDto })
  @ApiResponse({ status: 201, type: OkResponseDto })
  async changePassword(@Body() body: Record<string, unknown>, @Req() req: Request) {
    await this.auth.changePassword(req.auth!.sub, req.auth!.sessionId, {
      currentPassword: requireString(body.currentPassword, "currentPassword"),
      newPassword: requireString(body.newPassword, "newPassword"),
    });
    return { ok: true };
  }

  @Patch("me")
  @Authenticated()
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  @ApiOperation({
    summary: "Update the current user's own profile",
    description: "Self-service — no admin permission required. Updates the caller's own row directly; unrelated to any workspace.",
  })
  @ApiBody({ type: UpdateUserDto })
  @ApiResponse({ status: 200, type: SelfProfileDto })
  async updateMe(@Body() body: Record<string, unknown>, @Req() req: Request) {
    return this.auth.updateProfile(req.auth!.sub, {
      firstName: body.firstName === null ? null : optionalString(body.firstName),
      lastName: body.lastName === null ? null : optionalString(body.lastName),
      displayName: body.displayName === null ? null : optionalString(body.displayName),
      phone: body.phone === null ? null : optionalString(body.phone),
      username: body.username === null ? null : optionalString(body.username),
      photo: body.photo === null ? null : optionalString(body.photo),
    });
  }

  @Post("2fa/enroll")
  @Authenticated()
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: "Begin TOTP enrollment", description: "Not active until confirmed via POST /auth/2fa/confirm." })
  @ApiResponse({ status: 201, type: EnrollTwoFactorResponseDto })
  async enrollTwoFactor(@Req() req: Request) {
    return this.auth.enrollTwoFactor(req.auth!.sub);
  }

  @Post("2fa/confirm")
  @Authenticated()
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: "Confirm TOTP enrollment with a code", description: "Enables 2FA and returns one-time backup codes, shown only here." })
  @ApiBody({ type: TwoFactorCodeDto })
  @ApiResponse({ status: 201, type: ConfirmTwoFactorResponseDto })
  async confirmTwoFactor(@Body() body: Record<string, unknown>, @Req() req: Request) {
    return this.auth.confirmTwoFactor(req.auth!.sub, requireString(body.code, "code"));
  }

  @Post("2fa/disable")
  @Authenticated()
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: "Disable 2FA", description: "Requires a valid TOTP or backup code." })
  @ApiBody({ type: TwoFactorCodeDto })
  @ApiResponse({ status: 201, type: OkResponseDto })
  async disableTwoFactor(@Body() body: Record<string, unknown>, @Req() req: Request) {
    await this.auth.disableTwoFactor(req.auth!.sub, requireString(body.code, "code"));
    return { ok: true };
  }

  @Post("password/forgot")
  @Public()
  @ApiOperation({ summary: "Request a password reset", description: "Always reports success, whether or not the email exists — avoids account enumeration." })
  @ApiBody({ type: ForgotPasswordDto })
  @ApiResponse({ status: 201, type: OkResponseDto })
  async forgotPassword(@Body() body: Record<string, unknown>) {
    await this.auth.requestPasswordReset(requireString(body.email, "email"));
    return { ok: true }; // always 200 — never reveal whether the email exists
  }

  @Post("password/reset")
  @Public()
  @ApiOperation({ summary: "Complete a password reset", description: "Revokes every existing session for the user on success." })
  @ApiBody({ type: ResetPasswordDto })
  @ApiResponse({ status: 201, type: OkResponseDto })
  async resetPassword(@Body() body: Record<string, unknown>) {
    await this.auth.resetPassword(requireString(body.token, "token"), requireString(body.newPassword, "newPassword"));
    return { ok: true };
  }

  @Get("oauth/:provider/start")
  @Public()
  @ApiOperation({ summary: "Get the redirect URL to start an OAuth login" })
  @ApiParam({ name: "provider", enum: ["google", "apple"] })
  @ApiResponse({ status: 200, type: OAuthStartResponseDto })
  async oauthStart(@Param("provider") provider: string) {
    return this.auth.startOAuth(provider);
  }

  @Get("oauth/:provider/callback")
  @Public()
  @ApiOperation({ summary: "OAuth provider callback — exchanges the code and completes login" })
  @ApiParam({ name: "provider", enum: ["google", "apple"] })
  @ApiQuery({ name: "code", required: true })
  @ApiQuery({ name: "state", required: true })
  @ApiResponse({ status: 200, type: AuthTokensDto })
  async oauthCallback(@Param("provider") provider: string, @Query("code") code: string, @Query("state") state: string) {
    return this.auth.completeOAuthCallback(provider, requireString(code, "code"), requireString(state, "state"));
  }
}
