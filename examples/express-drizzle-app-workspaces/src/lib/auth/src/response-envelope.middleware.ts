import type { NextFunction, Request, RequestHandler, Response } from "express";

function deriveMessage(method: string): string {
  switch (method) {
    case "GET":
      return "Fetched successfully";
    case "POST":
      return "Created successfully";
    case "PATCH":
    case "PUT":
      return "Updated successfully";
    case "DELETE":
      return "Deleted successfully";
    default:
      return "Request successful";
  }
}

/**
 * Wraps every `res.json(...)` call made after this middleware runs, so no individual route
 * handler needs to know the envelope exists. Distinguishes success from error purely by
 * `res.statusCode` (already set via `res.status(x)` before `.json()` is ever called, by every
 * call site in this codebase) — a body from an error path is spread with `success: false` rather
 * than nested under `data`, since it's already shaped as `{statusCode, message, ...}`.
 *
 * Skips `/docs` and `/docs-json` regardless of where those routes are mounted relative to this
 * middleware — the raw OpenAPI JSON must stay unwrapped.
 */
export function responseEnvelope(): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    if (req.path === "/docs-json" || req.path.startsWith("/docs")) {
      next();
      return;
    }

    const originalJson = res.json.bind(res);
    res.json = ((body: unknown) => {
      if (res.statusCode >= 400) {
        const shaped = body && typeof body === "object" ? (body as Record<string, unknown>) : { message: body };
        return originalJson({ success: false, statusCode: res.statusCode, ...shaped });
      }
      return originalJson({ success: true, statusCode: res.statusCode, message: deriveMessage(req.method), data: body });
    }) as typeof res.json;
    next();
  };
}
