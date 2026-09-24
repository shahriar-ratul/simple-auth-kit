import type { NextFunction, Request, Response } from "express";
import { verifyAccessToken } from "@/lib/auth/core/token-service";
import { KeyProviderService } from "@/common/config/key-provider";
import "@/infra/request-context";
import { SessionRepository } from "@/common/repositories/session.repository";

/**
 * Authentication only — proves who the caller is and populates `req.auth`. Authorization
 * (`req.authz`) is a deliberately separate step: pair this with the authz middleware on any
 * route that checks roles or permissions.
 *
 * Express middleware equivalent of the reference combo's auth.guard.ts (a NestJS
 * `CanActivate`). Express has no guard/decorator system, so this is a plain factory function
 * returning a request handler — mount it directly on whichever routes need it.
 */
export function createAuthMiddleware(
  keys: KeyProviderService,
  sessions: SessionRepository,
) {
  return async function authMiddleware(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    const header = req.headers["authorization"];
    if (!header?.startsWith("Bearer ")) {
      res.status(401).json({
        statusCode: 401,
        code: "UNAUTHORIZED",
        message: "missing bearer token",
      });
      return;
    }

    try {
      req.auth = await verifyAccessToken(
        {
          secret: keys.secret,
          isDenylisted: (jti) => sessions.isDenylisted(jti),
        },
        header.slice("Bearer ".length),
      );
      next();
    } catch (err) {
      res.status(401).json({
        statusCode: 401,
        code: "UNAUTHORIZED",
        message: err instanceof Error ? err.message : "invalid access token",
      });
    }
  };
}
