import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { deriveModule, log, newTraceId, redact, withTraceId } from '@/infra/logger/logger';

/**
 * Logs every request's start (debug) and end (info/warn/error by status), and opens the
 * per-request AsyncLocalStorage context so any `log.*` call made deeper in the request —
 * inside a service or repository that never sees `req`/`res` — is tagged with the same
 * `traceId` automatically (`next()` runs synchronously inside `withTraceId` below, so every
 * downstream route handler, and everything it awaits, executes inside that context).
 *
 * Response body capture works by patching `res.json` — mounted (in `create-auth-app.ts`) right
 * after `express.json()` and *before* `responseEnvelope()`, so `responseEnvelope()`'s own patch
 * wraps ours: by the time our patch actually runs, it's receiving the already-enveloped
 * `{success, statusCode, message, data}` body — the same one the client receives, whether it came
 * from a route handler or `authCoreErrorMiddleware`.
 *
 * Status/duration are still read off `res`'s "finish" event (not the `res.json` patch) — "finish"
 * fires once the response is fully sent regardless of which path wrote it, so the status this
 * logs is always the one the client actually received.
 */
export function requestLogger(): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    // Captured once, up front — Express mutates `req.url`/`req.path` while dispatching into a
    // mounted sub-router (every feature router here is mounted via `app.use("/api/v1/x", ...)`)
    // and doesn't reliably restore it before the deferred "finish" event fires, so re-reading
    // `req.path`/`req.method` inside that callback can log the route's *mount-relative* path
    // (e.g. "/signup") instead of the real one ("/api/v1/auth/signup").
    const method = req.method;
    const path = req.path;
    const payload = redact(req.body);
    const module = deriveModule(path);
    if (!module) {
      next();
      return;
    }

    const traceId = newTraceId();
    const start = Date.now();
    const startedAt = new Date(start).toISOString();
    let responseBody: unknown;

    const originalJson = res.json.bind(res);
    res.json = ((body: unknown) => {
      responseBody = body;
      return originalJson(body);
    }) as typeof res.json;

    log.debug(module, `${method} ${path} — start`, {
      traceId,
      startedAt,
      payload,
    });

    res.on('finish', () => {
      const meta = {
        traceId,
        method,
        path,
        statusCode: res.statusCode,
        // When the request arrived — kept on the "end" line too (not just the "start" line) so
        // a monitor filtering on status/duration never has to cross-reference a separate entry
        // to know when the slow/failed request actually came in.
        startedAt,
        durationMs: Date.now() - start,
        payload,
        response: redact(responseBody),
      };
      const message = `${method} ${path} — end`;
      if (res.statusCode >= 500) log.error(module, message, meta);
      else if (res.statusCode >= 400) log.warn(module, message, meta);
      else log.info(module, message, meta);
    });

    withTraceId(traceId, next);
  };
}
