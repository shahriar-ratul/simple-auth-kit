// Hand-authored OpenAPI 3.0 document for this combo's Express routers.
//
// There's no NestJS here, so there are no `@nestjs/swagger` decorators to generate this from
// (contrast with the nestjs-* combos' controllers + dto/*.dto.ts, which produce their spec from
// `@Api*` decorators reflected at boot). This is a plain object transcribed from those same
// reference controllers — same routes, same request/response shapes, same bearer-auth
// requirements — served as static JSON via swagger-ui-express (see create-auth-app.ts).
//
// The split mirrors the routers it documents: this file covers the identity endpoints
// (auth.router.ts) and merges in `openapi-admin.ts`, which documents everything the admin router
// exposes. Administration is what a deployment's authorization model changes the shape of, so it
// is documented next to the router that serves it rather than inlined here.
//
// Typed loosely: this is a giant JSON literal, not application logic. Correctness of the JSON
// shape (valid OpenAPI) matters far more than TS precision here.
import { adminSpec } from "./openapi-admin.js";

export const openApiSpec: Record<string, unknown> = {
  openapi: "3.0.3",
  info: {
    title: "easy-auth API",
    description: "express-drizzle combo — signup/login, sessions, TOTP 2FA, OAuth, password reset, RBAC, audit log",
    version: "1.0",
  },
  servers: [{ url: "/" }],
  tags: [{ name: "auth" }, ...adminSpec.tags],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
      },
    },
    schemas: {
      SignupDto: {
        type: "object",
        required: ["email", "password"],
        properties: {
          email: { type: "string", example: "alice@example.com" },
          password: { type: "string", example: "correct-horse-battery-staple" },
          firstName: { type: "string", description: "Unique across the deployment.", example: "Alice" },
          lastName: { type: "string", description: "Unique across the deployment.", example: "Nguyen" },
          displayName: { type: "string", example: "Alice Nguyen" },
          phone: { type: "string", description: "Unique across the deployment." },
          username: { type: "string", description: "Unique across the deployment." },
        },
      },
      LoginDto: {
        type: "object",
        required: ["identifier", "password"],
        properties: {
          identifier: { type: "string", description: "Email, username, or phone — whichever the account has set.", example: "alice@example.com" },
          password: { type: "string", example: "correct-horse-battery-staple" },
        },
      },
      LoginTwoFactorDto: {
        type: "object",
        required: ["challengeToken", "code"],
        properties: {
          challengeToken: { type: "string", description: "Returned by POST /auth/login when the account has 2FA enabled" },
          code: { type: "string", description: "6-digit TOTP code, or an unused backup code", example: "123456" },
        },
      },
      RefreshDto: {
        type: "object",
        required: ["refreshToken"],
        properties: {
          refreshToken: { type: "string" },
        },
      },
      TwoFactorCodeDto: {
        type: "object",
        required: ["code"],
        properties: {
          code: { type: "string", example: "123456" },
        },
      },
      ForgotPasswordDto: {
        type: "object",
        required: ["email"],
        properties: {
          email: { type: "string" },
        },
      },
      ResetPasswordDto: {
        type: "object",
        required: ["token", "newPassword"],
        properties: {
          token: { type: "string", description: "Raw token from the sendPasswordResetEmail hook" },
          newPassword: { type: "string" },
        },
      },
      ChangePasswordDto: {
        type: "object",
        required: ["currentPassword", "newPassword"],
        properties: {
          currentPassword: { type: "string", description: "The caller's current password, re-checked server-side before anything changes." },
          newPassword: { type: "string" },
        },
      },
      AuthTokensDto: {
        type: "object",
        properties: {
          accessToken: { type: "string" },
          refreshToken: { type: "string" },
          sessionId: { type: "string" },
        },
      },
      RefreshResponseDto: {
        type: "object",
        properties: {
          accessToken: { type: "string" },
          refreshToken: { type: "string" },
        },
      },
      TwoFactorChallengeDto: {
        type: "object",
        properties: {
          twoFactorRequired: { type: "boolean", enum: [true] },
          challengeToken: { type: "string" },
        },
      },
      CurrentUserDto: {
        type: "object",
        properties: {
          sub: { type: "string", description: "User id" },
          sessionId: { type: "string" },
          roles: { type: "array", items: { type: "string" } },
          permissions: { type: "array", items: { type: "string" } },
          twoFactorEnabled: { type: "boolean" },
          email: { type: "string" },
          firstName: { type: "string", nullable: true },
          lastName: { type: "string", nullable: true },
          displayName: { type: "string", nullable: true },
          phone: { type: "string", nullable: true },
          username: { type: "string", nullable: true },
          photo: { type: "string", nullable: true, description: "A data URI or an externally-hosted URL — stored as-is, never processed server-side." },
        },
      },
      SelfProfileDto: {
        type: "object",
        properties: {
          id: { type: "string" },
          email: { type: "string" },
          firstName: { type: "string", nullable: true },
          lastName: { type: "string", nullable: true },
          displayName: { type: "string", nullable: true },
          phone: { type: "string", nullable: true },
          username: { type: "string", nullable: true },
          photo: { type: "string", nullable: true, description: "A data URI or an externally-hosted URL — stored as-is, never processed server-side." },
          createdAt: { type: "string", format: "date-time" },
        },
      },
      SessionSummaryDto: {
        type: "object",
        properties: {
          id: { type: "string" },
          createdAt: { type: "string" },
          userAgent: { type: "string" },
          ip: { type: "string" },
        },
      },
      OkResponseDto: {
        type: "object",
        properties: {
          ok: { type: "boolean", enum: [true] },
        },
      },
      EnrollTwoFactorResponseDto: {
        type: "object",
        properties: {
          secret: { type: "string", description: "Base32 TOTP secret" },
          provisioningUri: { type: "string", description: "otpauth:// provisioning URI, render as a QR code" },
        },
      },
      ConfirmTwoFactorResponseDto: {
        type: "object",
        properties: {
          backupCodes: { type: "array", items: { type: "string" }, description: "One-time recovery codes — shown once" },
        },
      },
      OAuthStartResponseDto: {
        type: "object",
        properties: {
          url: { type: "string", description: "Redirect the user/webview to this URL to start the OAuth flow" },
        },
      },
      RoleSummaryDto: {
        type: "object",
        properties: {
          id: { type: "string" },
          name: { type: "string" },
        },
      },
      ...adminSpec.schemas,
    },
  },
  paths: {
    "/auth/signup": {
      post: {
        tags: ["auth"],
        summary: "Create a user and issue a session",
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/SignupDto" } } },
        },
        responses: {
          "201": {
            description: "Session created",
            content: { "application/json": { schema: { $ref: "#/components/schemas/AuthTokensDto" } } },
          },
        },
      },
    },
    "/auth/login": {
      post: {
        tags: ["auth"],
        summary: "Log in with email, username, or phone + password",
        description:
          "identifier is matched against email, username, and phone, in that order. Returns tokens directly, or a 2FA challenge if the account has 2FA enabled.",
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/LoginDto" } } },
        },
        responses: {
          "200": {
            description: "Tokens, or a 2FA challenge",
            content: {
              "application/json": {
                schema: {
                  oneOf: [
                    { $ref: "#/components/schemas/AuthTokensDto" },
                    { $ref: "#/components/schemas/TwoFactorChallengeDto" },
                  ],
                },
              },
            },
          },
        },
      },
    },
    "/auth/login/2fa": {
      post: {
        tags: ["auth"],
        summary: "Complete the 2FA challenge from POST /auth/login",
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/LoginTwoFactorDto" } } },
        },
        responses: {
          "200": {
            description: "Session created",
            content: { "application/json": { schema: { $ref: "#/components/schemas/AuthTokensDto" } } },
          },
        },
      },
    },
    "/auth/refresh": {
      post: {
        tags: ["auth"],
        summary: "Rotate a refresh token for a new access+refresh pair",
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/RefreshDto" } } },
        },
        responses: {
          "200": {
            description: "New token pair",
            content: { "application/json": { schema: { $ref: "#/components/schemas/RefreshResponseDto" } } },
          },
        },
      },
    },
    "/auth/me": {
      get: {
        tags: ["auth"],
        summary: "Current session's identity",
        description: "`roles` and `permissions` are whatever applies to this request — see authz.middleware.ts for how they are resolved.",
        security: [{ bearerAuth: [] }],
        parameters: adminSpec.scopeParameters,
        responses: {
          "200": {
            description: "Current user",
            content: { "application/json": { schema: { $ref: "#/components/schemas/CurrentUserDto" } } },
          },
        },
      },
      patch: {
        tags: ["auth"],
        summary: "Update the current user's own profile",
        description: "Self-service — no admin permission required. Updates the caller's own row directly; unrelated to any workspace.",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/UpdateUserRequest" } } },
        },
        responses: {
          "200": {
            description: "Updated profile",
            content: { "application/json": { schema: { $ref: "#/components/schemas/SelfProfileDto" } } },
          },
          "401": { description: "Missing or invalid access token" },
        },
      },
    },
    "/auth/sessions": {
      get: {
        tags: ["auth"],
        summary: "List the current user's active (non-revoked) sessions",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": {
            description: "Active sessions",
            content: { "application/json": { schema: { type: "array", items: { $ref: "#/components/schemas/SessionSummaryDto" } } } },
          },
        },
      },
    },
    "/auth/logout": {
      post: {
        tags: ["auth"],
        summary: "Revoke the current session",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": {
            description: "OK",
            content: { "application/json": { schema: { $ref: "#/components/schemas/OkResponseDto" } } },
          },
        },
      },
    },
    "/auth/logout-all": {
      post: {
        tags: ["auth"],
        summary: "Revoke every session for the current user",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": {
            description: "OK",
            content: { "application/json": { schema: { $ref: "#/components/schemas/OkResponseDto" } } },
          },
        },
      },
    },
    "/auth/logout-others": {
      post: {
        tags: ["auth"],
        summary: "Revoke every session except the current one",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": {
            description: "OK",
            content: { "application/json": { schema: { $ref: "#/components/schemas/OkResponseDto" } } },
          },
        },
      },
    },
    "/auth/2fa/enroll": {
      post: {
        tags: ["auth"],
        summary: "Begin TOTP enrollment",
        description: "Not active until confirmed via POST /auth/2fa/confirm.",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": {
            description: "TOTP secret + provisioning URI",
            content: { "application/json": { schema: { $ref: "#/components/schemas/EnrollTwoFactorResponseDto" } } },
          },
        },
      },
    },
    "/auth/2fa/confirm": {
      post: {
        tags: ["auth"],
        summary: "Confirm TOTP enrollment with a code",
        description: "Enables 2FA and returns one-time backup codes, shown only here.",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/TwoFactorCodeDto" } } },
        },
        responses: {
          "200": {
            description: "Backup codes",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ConfirmTwoFactorResponseDto" } } },
          },
        },
      },
    },
    "/auth/2fa/disable": {
      post: {
        tags: ["auth"],
        summary: "Disable 2FA",
        description: "Requires a valid TOTP or backup code.",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/TwoFactorCodeDto" } } },
        },
        responses: {
          "200": {
            description: "OK",
            content: { "application/json": { schema: { $ref: "#/components/schemas/OkResponseDto" } } },
          },
        },
      },
    },
    "/auth/password/forgot": {
      post: {
        tags: ["auth"],
        summary: "Request a password reset",
        description: "Always reports success, whether or not the email exists — avoids account enumeration.",
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/ForgotPasswordDto" } } },
        },
        responses: {
          "200": {
            description: "OK",
            content: { "application/json": { schema: { $ref: "#/components/schemas/OkResponseDto" } } },
          },
        },
      },
    },
    "/auth/password/reset": {
      post: {
        tags: ["auth"],
        summary: "Complete a password reset",
        description: "Revokes every existing session for the user on success.",
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/ResetPasswordDto" } } },
        },
        responses: {
          "200": {
            description: "OK",
            content: { "application/json": { schema: { $ref: "#/components/schemas/OkResponseDto" } } },
          },
        },
      },
    },
    "/auth/password/change": {
      post: {
        tags: ["auth"],
        summary: "Change the current user's password",
        description: "Verifies currentPassword server-side, then revokes every other session for the user — the calling session is left alone.",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/ChangePasswordDto" } } },
        },
        responses: {
          "200": {
            description: "OK",
            content: { "application/json": { schema: { $ref: "#/components/schemas/OkResponseDto" } } },
          },
        },
      },
    },
    "/auth/oauth/{provider}/start": {
      get: {
        tags: ["auth"],
        summary: "Get the redirect URL to start an OAuth login",
        parameters: [{ name: "provider", in: "path", required: true, schema: { type: "string", enum: ["google", "apple"] } }],
        responses: {
          "200": {
            description: "Redirect URL",
            content: { "application/json": { schema: { $ref: "#/components/schemas/OAuthStartResponseDto" } } },
          },
        },
      },
    },
    "/auth/oauth/{provider}/callback": {
      get: {
        tags: ["auth"],
        summary: "OAuth provider callback — exchanges the code and completes login",
        parameters: [
          { name: "provider", in: "path", required: true, schema: { type: "string", enum: ["google", "apple"] } },
          { name: "code", in: "query", required: true, schema: { type: "string" } },
          { name: "state", in: "query", required: true, schema: { type: "string" } },
        ],
        responses: {
          "200": {
            description: "Session created",
            content: { "application/json": { schema: { $ref: "#/components/schemas/AuthTokensDto" } } },
          },
        },
      },
    },
    ...adminSpec.paths,
  },
};
