import type { NextFunction, Request, Response } from 'express';
import { AuthCoreError } from '@/core/types';
import { HttpError } from '@/infra/errors/http-error';

/**
 * Replaces the reference combo's `AuthCoreErrorFilter` (a Nest global `@Catch` exception
 * filter). Express has no filter system, so this is a standard 4-arg error-handling
 * middleware — mount it last, after the routers. Maps `AuthCoreError` (thrown deep
 * inside `registry/core/session-policy.ts`/`token-service.ts`, e.g. a stale/reused
 * refresh token) to a 401 JSON response instead of falling through to a bare 500, and
 * maps this combo's own `HttpError` to its intended status code — the plain-Express stand-in
 * for the NestJS exception classes the reference throws.
 */
export function authCoreErrorMiddleware(err: unknown, _req: Request, res: Response, next: NextFunction): void {
  if (res.headersSent) {
    next(err);
    return;
  }

  if (err instanceof AuthCoreError) {
    res.status(401).json({ statusCode: 401, code: err.code, message: err.message });
    return;
  }

  if (err instanceof HttpError) {
    res.status(err.statusCode).json({
      statusCode: err.statusCode,
      code: err.name,
      message: err.message,
    });
    return;
  }

  next(err);
}
