// Prometheus instrumentation for this combo's HTTP surface.
//
// Two handlers, mounted by `create-auth-app.ts`: `metricsCollector()` observes every request, and
// `metricsEndpoint()` serves the exposition format at `/metrics`. Both are plain middleware — the
// same shape as `requestLogger()` and `responseEnvelope()` next to them — rather than routes on a
// tiered router, for two reasons that are really the same reason:
//
//   • `/metrics` is operator plumbing, not API surface. `createTieredRouter` exists so that every
//     route a *caller* can reach has named its authentication tier; `/docs` sits outside it for
//     the same reason this does. Access here is gated on METRICS_TOKEN below — an operator
//     secret — not on a permission slug, because a scraper is not a user and holds no role.
//   • Mount order does the rest. The collector goes on before any router, so requests the auth
//     middleware rejects with a 401 (and the ability middleware with a 403) are still counted —
//     precisely the requests an auth service most needs counted. The endpoint goes on before
//     `responseEnvelope()`, so the bare text format Prometheus parses is never wrapped in
//     `{success, statusCode, message, data}`.
//
// Status is read off `res`'s "finish" event, not from the handler's return: "finish" fires once
// the response is fully written regardless of which layer wrote it — a route handler, a tier
// middleware, or `authCoreErrorMiddleware` — so the status recorded is the one the client got.
import { timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { collectDefaultMetrics, Counter, Histogram, Registry } from '@prometheus-io/client';
import { log } from '@/infra/logger/logger';

/**
 * This combo's own registry rather than @prometheus-io/client's global `register`, so an application that
 * already collects its own metrics keeps its registry untouched and nothing here depends on
 * module-load order across two packages.
 */
export const metricsRegistry = new Registry();

/**
 * Node runtime metrics: `process_cpu_seconds_total`, `process_resident_memory_bytes`,
 * `nodejs_eventloop_lag_seconds`, `nodejs_heap_size_used_bytes`, GC histograms. Event-loop lag is
 * the one that matters most here — argon2 hashing is CPU-bound, so a login flood shows up as lag
 * well before it shows up as a 5xx.
 */
collectDefaultMetrics({ register: metricsRegistry });

/** Identical on both metrics, so a request rate and a latency quantile slice the same way. */
const HTTP_LABELS = ['method', 'route', 'status_code'] as const;

export const httpRequestsTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total HTTP requests, by method, matched route pattern and response status.',
  labelNames: HTTP_LABELS,
  registers: [metricsRegistry],
});

export const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request latency in seconds, by method, matched route pattern and response status.',
  labelNames: HTTP_LABELS,
  // @prometheus-io/client's default bucket set, written out because the spread is load-bearing
  // here: argon2 password hashing puts signup and login in the 100-500ms range under normal load,
  // so the resolution that matters is in the middle of this range, not at the fast end.
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [metricsRegistry],
});

/**
 * The single most important line in this file. Prometheus creates one time series per distinct
 * label combination, so labelling by `req.path` would mint a series per user id, per session id,
 * and per invented URL an internet scanner tries — an unauthenticated caller could exhaust the
 * server's memory just by looping over random paths.
 *
 * Express records the *pattern* that matched on `req.route` (e.g. "/users/:id"), relative to the
 * router's mount point, with the prefix on `req.baseUrl` — every router here is mounted under
 * `/api/v1/...`, so both halves are needed. Anything that matched no route collapses to one fixed
 * label rather than being echoed back verbatim.
 */
export function routeLabel(req: Request): string {
  const matched = (req.route as { path?: string | string[] } | undefined)?.path;
  if (matched === undefined) return '<unmatched>';
  const pattern = Array.isArray(matched) ? matched.join('|') : String(matched);
  return `${req.baseUrl}${pattern}` || '/';
}

/**
 * Records duration and outcome for every request. Mount first, before any router, so nothing that
 * a tier middleware rejects is missed.
 *
 * `/metrics` itself is skipped — a scrape that records its own scrape is noise that scales with
 * the scrape interval and says nothing about the application.
 */
export function metricsCollector(): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    if (req.path === '/metrics') {
      next();
      return;
    }
    const stop = httpRequestDuration.startTimer();
    res.on('finish', () => {
      const labels = {
        method: req.method,
        route: routeLabel(req),
        status_code: String(res.statusCode),
      };
      stop(labels);
      httpRequestsTotal.inc(labels);
    });
    next();
  };
}

/**
 * Serves the exposition format.
 *
 * The response reveals the full route table, process memory and runtime versions, so it is gated
 * on METRICS_TOKEN whenever that is set. The token is read per request rather than captured when
 * the handler is built, so rotating it needs no restart — and so the proof cycle can exercise the
 * gated and ungated paths against a single running app.
 */
export function metricsEndpoint(): RequestHandler {
  return (req: Request, res: Response) => {
    if (!authorizeScrape(req, res)) return;
    metricsRegistry
      .metrics()
      .then((body) => {
        res.setHeader('content-type', metricsRegistry.contentType);
        res.status(200).send(body);
      })
      .catch(() => {
        // Never leak a collector's internals from an endpoint reachable without a token.
        res.status(500).send('failed to collect metrics');
      });
  };
}

function authorizeScrape(req: Request, res: Response): boolean {
  const expected = process.env['METRICS_TOKEN'];
  if (!expected) return true;

  const header = req.headers.authorization ?? '';
  const presented = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : '';
  if (constantTimeEquals(presented, expected)) return true;

  res.setHeader('www-authenticate', 'Bearer realm="metrics"');
  res.status(401).send('metrics scrape requires a bearer token');
  return false;
}

/** Compares without leaking the token's length or its matching prefix through timing. */
function constantTimeEquals(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/**
 * One-line warning at boot when `/metrics` is being served without a token. Called from
 * `createAuthApp`, next to the in-memory-store warning it deliberately reads like.
 */
export function warnIfMetricsUnprotected(): void {
  if (process.env['METRICS_TOKEN']) return;
  log.warn(
    'auth',
    '[simple-auth-kit] METRICS_TOKEN not set — /metrics is served to anyone who can reach this ' +
      'port. It exposes the route table, process memory and runtime versions. Fine behind a ' +
      'private network (a compose network, a Kubernetes pod network); set METRICS_TOKEN and give ' +
      'Prometheus the matching bearer token before this port is reachable from anywhere else.',
  );
}
