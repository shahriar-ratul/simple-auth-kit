import type { NextFunction, Request, Response } from "express";
import { verifyAccessToken } from "@/lib/auth/core/token-service.js";
import { KeyProviderService } from "../config/key-provider.js";
import "../request-context.js";
import { SessionRepository } from "../repositories/session.repository.js";

export interface AuthMiddlewareDeps {
  keys: KeyProviderService;
  sessions: SessionRepository;
}

/**
 * Authentication only — proves who the caller is and populates `req.auth`. Authorization
 * (`req.authz`) is a deliberately separate step: pair this with the authz middleware on any
 * route that checks roles or permissions.
 *
 * Replaces the reference combo's `AuthGuard` (a Nest `CanActivate`). There is no guard
 * interface to implement in plain Express — a middleware factory closing over its dependencies
 * is the idiomatic equivalent.
 */
export function createAuthMiddleware(deps: AuthMiddlewareDeps) {
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
          secret: deps.keys.secret,
          isDenylisted: (jti) => deps.sessions.isDenylisted(jti),
        },
        header.slice("Bearer ".length),
      );
    } catch (err) {
      res.status(401).json({
        statusCode: 401,
        code: "UNAUTHORIZED",
        message: err instanceof Error ? err.message : "invalid access token",
      });
      return;
    }
    next();
  };
}
