// Hand-authored OpenAPI 3.0 document for this combo's Express routers.
//
// Unlike the nestjs-* combos — which derive their spec from `@nestjs/swagger` decorators on the
// controllers and DTOs — a plain Express app has no decorator metadata to reflect, so this is
// transcribed by hand from the actual route handlers. Keep it in sync with them: every
// path/method/status here should match a real `router.get`/`router.post` call.
//
// Split in two along the same line the routers are: the identity endpoints below, and
// everything the administration side adds, which comes from `./openapi-admin.js`.
//
// Typed loosely as `Record<string, unknown>` — this is a giant JSON literal handed to
// swagger-ui-express, not a data structure this codebase manipulates, so fighting for a
// precise OpenAPI TS type isn't worth it.
import { adminSpec } from "./openapi-admin.js";
import { errorResponse } from "./openapi-fragment.js";

export const openApiSpec: Record<string, unknown> = {
  openapi: "3.0.3",
  info: {
    title: "easy-auth API",
    description: "express-prisma combo — signup/login, sessions, TOTP 2FA, OAuth, password reset, RBAC.",
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
      SignupRequest: {
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
      LoginRequest: {
        type: "object",
        required: ["identifier", "password"],
        properties: {
          identifier: { type: "string", description: "Email, username, or phone — whichever the account has set.", example: "alice@example.com" },
          password: { type: "string", example: "correct-horse-battery-staple" },
        },
      },
      LoginTwoFactorRequest: {
        type: "object",
        required: ["challengeToken", "code"],
        properties: {
          challengeToken: { type: "string", description: "Returned by POST /auth/login when the account has 2FA enabled" },
          code: { type: "string", description: "6-digit TOTP code, or an unused backup code", example: "123456" },
        },
      },
      RefreshRequest: {
        type: "object",
        required: ["refreshToken"],
        properties: {
          refreshToken: { type: "string" },
        },
      },
      TwoFactorCodeRequest: {
        type: "object",
        required: ["code"],
        properties: {
          code: { type: "string", example: "123456" },
        },
      },
      ForgotPasswordRequest: {
        type: "object",
        required: ["email"],
        properties: {
          email: { type: "string" },
        },
      },
      ResetPasswordRequest: {
        type: "object",
        required: ["token", "newPassword"],
        properties: {
          token: { type: "string", description: "Raw token from the sendPasswordResetEmail hook" },
          newPassword: { type: "string" },
        },
      },
      ChangePasswordRequest: {
        type: "object",
        required: ["currentPassword", "newPassword"],
        properties: {
          currentPassword: { type: "string" },
          newPassword: { type: "string" },
        },
      },

      AuthTokens: {
        type: "object",
        required: ["accessToken", "refreshToken", "sessionId"],
        properties: {
          accessToken: { type: "string" },
          refreshToken: { type: "string" },
          sessionId: { type: "string" },
        },
      },
      RefreshResponse: {
        type: "object",
        required: ["accessToken", "refreshToken"],
        properties: {
          accessToken: { type: "string" },
          refreshToken: { type: "string" },
        },
      },
      TwoFactorChallenge: {
        type: "object",
        required: ["twoFactorRequired", "challengeToken"],
        properties: {
          twoFactorRequired: { type: "boolean", enum: [true] },
          challengeToken: { type: "string" },
        },
      },
      CurrentUser: {
        type: "object",
        required: ["sub", "sessionId", "roles", "permissions", "twoFactorEnabled", "email"],
        properties: {
          sub: { type: "string", description: "User id" },
          sessionId: { type: "string" },
          roles: { type: "array", items: { type: "string" } },
          permissions: {
            type: "array",
            items: { type: "string" },
            description:
              "`defineAbilitiesFor(permissions)` from ability.ts rebuilds, in the client, the very ability the server's own route check just answered with — " +
              "so the console holds no second copy of the rules and cannot offer an action the API will refuse.",
            example: ["users:read", "audit-log:read"],
          },
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
      SelfProfile: {
        type: "object",
        required: ["id", "email", "createdAt"],
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
      SessionSummary: {
        type: "object",
        required: ["id", "createdAt"],
        properties: {
          id: { type: "string" },
          createdAt: { type: "string", format: "date-time" },
          userAgent: { type: "string" },
          ip: { type: "string" },
        },
      },
      OkResponse: {
        type: "object",
        required: ["ok"],
        properties: {
          ok: { type: "boolean", enum: [true] },
        },
      },
      EnrollTwoFactorResponse: {
        type: "object",
        required: ["secret", "provisioningUri"],
        properties: {
          secret: { type: "string", description: "Base32 TOTP secret" },
          provisioningUri: { type: "string", description: "otpauth:// provisioning URI, render as a QR code" },
        },
      },
      ConfirmTwoFactorResponse: {
        type: "object",
        required: ["backupCodes"],
        properties: {
          backupCodes: { type: "array", items: { type: "string" }, description: "One-time recovery codes — shown once" },
        },
      },
      OAuthStartResponse: {
        type: "object",
        required: ["url"],
        properties: {
          url: { type: "string", description: "Redirect the user/webview to this URL to start the OAuth flow" },
        },
      },
      ErrorResponse: {
        type: "object",
        required: ["statusCode", "message"],
        properties: {
          statusCode: { type: "integer" },
          code: { type: "string" },
          message: { type: "string" },
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
          content: { "application/json": { schema: { $ref: "#/components/schemas/SignupRequest" } } },
        },
        responses: {
          "201": { description: "Created", content: { "application/json": { schema: { $ref: "#/components/schemas/AuthTokens" } } } },
          "400": errorResponse("Missing required field"),
          "409": errorResponse("Email already registered"),
        },
      },
    },
    "/auth/login": {
      post: {
        tags: ["auth"],
        summary: "Log in with email, username, or phone + password",
        description: "identifier is matched against email, username, and phone, in that order. Returns tokens directly, or a 2FA challenge if the account has 2FA enabled.",
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/LoginRequest" } } },
        },
        responses: {
          "200": {
            description: "OK",
            content: {
              "application/json": {
                schema: { oneOf: [{ $ref: "#/components/schemas/AuthTokens" }, { $ref: "#/components/schemas/TwoFactorChallenge" }] },
              },
            },
          },
          "400": errorResponse("Missing required field"),
          "401": errorResponse("Invalid credentials"),
          "429": errorResponse("Too many login attempts"),
        },
      },
    },
    "/auth/login/2fa": {
      post: {
        tags: ["auth"],
        summary: "Complete the 2FA challenge from POST /auth/login",
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/LoginTwoFactorRequest" } } },
        },
        responses: {
          "200": { description: "OK", content: { "application/json": { schema: { $ref: "#/components/schemas/AuthTokens" } } } },
          "400": errorResponse("Missing required field"),
          "401": errorResponse("Invalid or expired challenge token / code"),
        },
      },
    },
    "/auth/refresh": {
      post: {
        tags: ["auth"],
        summary: "Rotate a refresh token for a new access+refresh pair",
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/RefreshRequest" } } },
        },
        responses: {
          "200": { description: "OK", content: { "application/json": { schema: { $ref: "#/components/schemas/RefreshResponse" } } } },
          "400": errorResponse("Missing required field"),
          "401": errorResponse("Stale/reused/invalid refresh token"),
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
          "200": { description: "OK", content: { "application/json": { schema: { $ref: "#/components/schemas/CurrentUser" } } } },
          "401": errorResponse("Missing or invalid access token"),
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
          "200": { description: "OK", content: { "application/json": { schema: { $ref: "#/components/schemas/SelfProfile" } } } },
          "401": errorResponse("Missing or invalid access token"),
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
            description: "OK",
            content: { "application/json": { schema: { type: "array", items: { $ref: "#/components/schemas/SessionSummary" } } } },
          },
          "401": errorResponse("Missing or invalid access token"),
        },
      },
    },
    "/auth/logout": {
      post: {
        tags: ["auth"],
        summary: "Revoke the current session",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": { description: "OK", content: { "application/json": { schema: { $ref: "#/components/schemas/OkResponse" } } } },
          "401": errorResponse("Missing or invalid access token"),
        },
      },
    },
    "/auth/logout-all": {
      post: {
        tags: ["auth"],
        summary: "Revoke every session for the current user",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": { description: "OK", content: { "application/json": { schema: { $ref: "#/components/schemas/OkResponse" } } } },
          "401": errorResponse("Missing or invalid access token"),
        },
      },
    },
    "/auth/logout-others": {
      post: {
        tags: ["auth"],
        summary: "Revoke every session except the current one",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": { description: "OK", content: { "application/json": { schema: { $ref: "#/components/schemas/OkResponse" } } } },
          "401": errorResponse("Missing or invalid access token"),
        },
      },
    },
    "/auth/password/change": {
      post: {
        tags: ["auth"],
        summary: "Change the current user's password",
        description: "Requires the current password. Revokes every other session for the user; the session making this call is left alone.",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/ChangePasswordRequest" } } },
        },
        responses: {
          "200": { description: "OK", content: { "application/json": { schema: { $ref: "#/components/schemas/OkResponse" } } } },
          "400": errorResponse("Missing required field"),
          "401": errorResponse("Missing/invalid access token, or wrong current password"),
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
          "200": { description: "OK", content: { "application/json": { schema: { $ref: "#/components/schemas/EnrollTwoFactorResponse" } } } },
          "401": errorResponse("Missing or invalid access token"),
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
          content: { "application/json": { schema: { $ref: "#/components/schemas/TwoFactorCodeRequest" } } },
        },
        responses: {
          "200": { description: "OK", content: { "application/json": { schema: { $ref: "#/components/schemas/ConfirmTwoFactorResponse" } } } },
          "400": errorResponse("call enrollTwoFactor first"),
          "401": errorResponse("Invalid two-factor code"),
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
          content: { "application/json": { schema: { $ref: "#/components/schemas/TwoFactorCodeRequest" } } },
        },
        responses: {
          "200": { description: "OK", content: { "application/json": { schema: { $ref: "#/components/schemas/OkResponse" } } } },
          "400": errorResponse("Two-factor is not enabled"),
          "401": errorResponse("Invalid two-factor code"),
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
          content: { "application/json": { schema: { $ref: "#/components/schemas/ForgotPasswordRequest" } } },
        },
        responses: {
          "200": { description: "OK", content: { "application/json": { schema: { $ref: "#/components/schemas/OkResponse" } } } },
          "400": errorResponse("Missing required field"),
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
          content: { "application/json": { schema: { $ref: "#/components/schemas/ResetPasswordRequest" } } },
        },
        responses: {
          "200": { description: "OK", content: { "application/json": { schema: { $ref: "#/components/schemas/OkResponse" } } } },
          "400": errorResponse("Missing required field"),
          "401": errorResponse("Invalid or expired reset token"),
        },
      },
    },
    "/auth/oauth/{provider}/start": {
      get: {
        tags: ["auth"],
        summary: "Get the redirect URL to start an OAuth login",
        parameters: [{ name: "provider", in: "path", required: true, schema: { type: "string", enum: ["google", "apple"] } }],
        responses: {
          "200": { description: "OK", content: { "application/json": { schema: { $ref: "#/components/schemas/OAuthStartResponse" } } } },
          "400": errorResponse("Unknown or unconfigured OAuth provider"),
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
          "200": { description: "OK", content: { "application/json": { schema: { $ref: "#/components/schemas/AuthTokens" } } } },
          "400": errorResponse("Unknown or unconfigured OAuth provider"),
          "401": errorResponse("OAuth exchange failed"),
        },
      },
    },

    ...adminSpec.paths,
  },
};
