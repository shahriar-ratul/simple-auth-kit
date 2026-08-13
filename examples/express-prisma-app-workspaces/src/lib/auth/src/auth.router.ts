import type { NextFunction, Request, RequestHandler, Response } from "express";
import type { AuthConfig } from "./auth.config.js";
import { AuthService } from "./auth.service.js";
import { HttpError } from "./http-error.js";
import { authenticated, createTieredRouter, publicRoute, type TierMiddleware } from "./route-tiers.js";
import "./request-context.js";

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) throw new HttpError(400, `${field} is required`);
  return value;
}

const optionalString = (value: unknown): string | undefined => (typeof value === "string" ? value : undefined);

export interface AuthRouterDeps extends TierMiddleware {
  auth: AuthService;
  config: AuthConfig;
}

/**
 * Identity endpoints — everything that is about *a user*, never about a group of them.
 * Administration lives in admin.router.ts.
 *
 * Replaces the reference combo's `AuthController` (a Nest `@Controller`). Same endpoints, same
 * validation, same status codes — just an Express `Router()` instead of a decorated class, and
 * middleware passed in where the controller lists `@UseGuards(...)`. Every handler is wrapped in
 * try/catch + `next(err)` so a thrown `HttpError`/`AuthCoreError` reaches the error-handling
 * middleware mounted in create-auth-app.ts instead of leaking a bare 500.
 */
export function createAuthRouter(deps: AuthRouterDeps): RequestHandler {
  const { auth, config, authentication, authorization } = deps;
  const router = createTieredRouter({ authentication, authorization });

  router.route("post", "/signup", publicRoute(), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = req.body as Record<string, unknown>;
      const tokens = await auth.signup({
        email: requireString(body.email, "email"),
        password: requireString(body.password, "password"),
        firstName: optionalString(body.firstName),
        lastName: optionalString(body.lastName),
        displayName: optionalString(body.displayName),
        phone: optionalString(body.phone),
        username: optionalString(body.username),
        userAgent: req.headers["user-agent"],
        ip: req.ip,
      });
      res.status(201).json(tokens);
    } catch (err) {
      next(err);
    }
  });

  router.route("post", "/login", publicRoute(), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = req.body as Record<string, unknown>;
      const result = await auth.login({
        identifier: requireString(body.identifier, "identifier"),
        password: requireString(body.password, "password"),
        userAgent: req.headers["user-agent"],
        ip: req.ip,
      });
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  });

  router.route("post", "/login/2fa", publicRoute(), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = req.body as Record<string, unknown>;
      const tokens = await auth.loginTwoFactor({
        challengeToken: requireString(body.challengeToken, "challengeToken"),
        code: requireString(body.code, "code"),
        userAgent: req.headers["user-agent"],
        ip: req.ip,
      });
      res.status(200).json(tokens);
    } catch (err) {
      next(err);
    }
  });

  router.route("post", "/refresh", publicRoute(), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = req.body as Record<string, unknown>;
      const tokens = await auth.refresh(requireString(body.refreshToken, "refreshToken"));
      res.status(200).json(tokens);
    } catch (err) {
      next(err);
    }
  });

  // `roles`/`permissions` are whatever applies to this request — see authz.middleware.ts for how
  // they are resolved. A request that names no authorization scope gets empty arrays.
  //
  // `permissions` is the caller's whole authorization: `defineAbilitiesFor(permissions)` from
  // ability.ts rebuilds, in the client, the identical CASL ability the server's own route check
  // just answered with, so the UI cannot disagree with what the API will allow. The slugs go on
  // the wire rather than a serialised ability, so the payload is something a human can read in a
  // log — and it is the same `req.authz` the ability was built from, not a re-resolution.
  router.route("get", "/me", authenticated(), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { sub, sessionId } = req.auth!;
      const [{ twoFactorEnabled }, profile] = await Promise.all([auth.getTwoFactorStatus(sub), auth.getProfile(sub)]);
      res.status(200).json({
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
      });
    } catch (err) {
      next(err);
    }
  });

  router.route("get", "/sessions", authenticated(), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const sessions = await auth.listActiveSessions(req.auth!.sub);
      res.status(200).json(sessions);
    } catch (err) {
      next(err);
    }
  });

  router.route("post", "/logout", authenticated(), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { sessionId, jti, sub } = req.auth!;
      // Recorded so the row can later be told apart from a session an administrator ended —
      // see `sessions.revoked_by`.
      await auth.logout(sessionId, jti, config.accessTokenTtlSeconds, { userId: sub, ip: req.ip });
      res.status(200).json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  router.route("post", "/logout-all", authenticated(), async (req: Request, res: Response, next: NextFunction) => {
    try {
      await auth.logoutAll(req.auth!.sub, { userId: req.auth!.sub, ip: req.ip });
      res.status(200).json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  router.route("post", "/logout-others", authenticated(), async (req: Request, res: Response, next: NextFunction) => {
    try {
      await auth.logoutOthers(req.auth!.sub, req.auth!.sessionId, { userId: req.auth!.sub, ip: req.ip });
      res.status(200).json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  router.route("post", "/password/change", authenticated(), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = req.body as Record<string, unknown>;
      await auth.changePassword(req.auth!.sub, req.auth!.sessionId, {
        currentPassword: requireString(body.currentPassword, "currentPassword"),
        newPassword: requireString(body.newPassword, "newPassword"),
      });
      res.status(200).json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  // Self-service — no admin permission required. Updates the caller's own row directly; unrelated
  // to any workspace. Same null-vs-undefined field parsing every PATCH handler in this codebase
  // uses — see admin.router.ts's PATCH /users/:userId.
  router.route("patch", "/me", authenticated(), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = req.body as Record<string, unknown>;
      const profile = await auth.updateProfile(req.auth!.sub, {
        firstName: body.firstName === null ? null : optionalString(body.firstName),
        lastName: body.lastName === null ? null : optionalString(body.lastName),
        displayName: body.displayName === null ? null : optionalString(body.displayName),
        phone: body.phone === null ? null : optionalString(body.phone),
        username: body.username === null ? null : optionalString(body.username),
        photo: body.photo === null ? null : optionalString(body.photo),
      });
      res.status(200).json(profile);
    } catch (err) {
      next(err);
    }
  });

  router.route("post", "/2fa/enroll", authenticated(), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await auth.enrollTwoFactor(req.auth!.sub);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  });

  router.route("post", "/2fa/confirm", authenticated(), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = req.body as Record<string, unknown>;
      const result = await auth.confirmTwoFactor(req.auth!.sub, requireString(body.code, "code"));
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  });

  router.route("post", "/2fa/disable", authenticated(), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = req.body as Record<string, unknown>;
      await auth.disableTwoFactor(req.auth!.sub, requireString(body.code, "code"));
      res.status(200).json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  router.route("post", "/password/forgot", publicRoute(), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = req.body as Record<string, unknown>;
      await auth.requestPasswordReset(requireString(body.email, "email"));
      res.status(200).json({ ok: true }); // always 200 — never reveal whether the email exists
    } catch (err) {
      next(err);
    }
  });

  router.route("post", "/password/reset", publicRoute(), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = req.body as Record<string, unknown>;
      await auth.resetPassword(requireString(body.token, "token"), requireString(body.newPassword, "newPassword"));
      res.status(200).json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  router.route("get", "/oauth/:provider/start", publicRoute(), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await auth.startOAuth(requireString(req.params.provider, "provider"));
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  });

  router.route("get", "/oauth/:provider/callback", publicRoute(), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tokens = await auth.completeOAuthCallback(
        requireString(req.params.provider, "provider"),
        requireString(req.query.code, "code"),
        requireString(req.query.state, "state"),
      );
      res.status(200).json(tokens);
    } catch (err) {
      next(err);
    }
  });

  return router.handler;
}
