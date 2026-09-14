import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import type { Request, Response } from 'express';
import { deriveModule, log, newTraceId, redact, withTraceId } from '@/infra/logger/logger';

/**
 * Logs every request's start (debug) and end (info/warn/error by status), and opens the
 * per-request AsyncLocalStorage context so any `log.*` call made deeper in the request —
 * inside a service or repository that never sees `req`/`res` — is tagged with the same
 * `traceId` automatically.
 *
 * Must be registered as the OUTERMOST `APP_INTERCEPTOR` (i.e. before `ResponseInterceptor` in
 * the providers array — Nest's first-registered interceptor wraps every later one) so the `tap`
 * below observes the value *after* `ResponseInterceptor` has already shaped it into the
 * `{success, statusCode, message, data}` envelope — the same final body the client receives, not
 * the controller's raw return value.
 *
 * Status/duration are read off `res`'s "finish" event rather than the RxJS pipeline — when the
 * handler throws, the exception filter (not this interceptor) is what actually writes the
 * response and its final status code, and "finish" fires only once that's done, so the status
 * this logs is always the one the client actually received. The controller method call itself
 * happens synchronously inside `next.handle().subscribe(...)` below, so it (and everything it
 * awaits) runs inside `withTraceId`'s AsyncLocalStorage context.
 */
@Injectable()
export class RequestLoggerInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();
    // Captured once, up front, rather than re-read from `req` inside the deferred "finish"
    // callback below — Express (which Nest's platform-express sits on) mutates `req.url`/
    // `req.path` while dispatching into a mounted sub-router and isn't guaranteed to have
    // restored it by the time an async event fires, so re-reading late risks logging a
    // route-relative path instead of the real one.
    const method = req.method;
    const path = req.path;
    const payload = redact(req.body);
    const module = deriveModule(path);
    if (!module) return next.handle();

    const traceId = newTraceId();
    const start = Date.now();
    const startedAt = new Date(start).toISOString();
    // Populated by the `tap` below once the (already-enveloped) response value flows back
    // through; stays undefined on a thrown error, where we fall back to the error's own message
    // instead — the exact wire-format error body is the exception filter's concern, not ours.
    let responseBody: unknown;

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

    return new Observable((subscriber) => {
      withTraceId(traceId, () => {
        next
          .handle()
          .pipe(
            tap({
              next: (body) => {
                responseBody = body;
              },
              error: (err: unknown) => {
                responseBody = {
                  error: err instanceof Error ? err.message : String(err),
                };
              },
            }),
          )
          .subscribe(subscriber);
      });
    });
  }
}
