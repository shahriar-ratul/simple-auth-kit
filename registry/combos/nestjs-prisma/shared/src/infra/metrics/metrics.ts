// Prometheus instrumentation for this combo's HTTP surface.
//
// Mounted as raw Express middleware via `setupMetrics(app)`, not as a Nest controller — the same
// place `/docs` lives (see infra/openapi/docs.ts). That is deliberate, and it is what makes the
// numbers correct rather than merely convenient:
//
//   • A Nest interceptor runs *after* guards, so every 401 from AuthGuard and every 403 from
//     AbilityGuard would never reach it — precisely the requests an auth service most needs
//     counted. Middleware runs before the guard chain, and `res.on("finish")` fires once the
//     response has actually been written, whoever wrote it (handler, guard, or the
//     AuthCoreErrorFilter), so the status recorded here is always the one the client received.
//   • Writing the exposition response straight to `res` keeps it out of ResponseInterceptor's
//     `{success, statusCode, message, data}` envelope. Prometheus needs the bare text format.
//
// Because it is not a Nest route it is also not part of the three-tier route table, exactly like
// `/docs` — `assertEveryRouteDeclaresATier` covers the API surface, and `/metrics` is operator
// plumbing, gated by METRICS_TOKEN below rather than by a permission slug.
import { timingSafeEqual } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import type { NextFunction, Request, RequestHandler, Response } from "express";
import {
  collectDefaultMetrics,
  Counter,
  Histogram,
  Registry,
} from "prom-client";
import { log } from "@/infra/logger/logger";

/**
 * This library's own registry rather than prom-client's global `register`. A consuming app that
 * already collects its own metrics keeps its registry untouched, and nothing here depends on
 * module-load order across two packages.
 */
export const metricsRegistry = new Registry();

/**
 * Node runtime metrics: `process_cpu_seconds_total`, `process_resident_memory_bytes`,
 * `nodejs_eventloop_lag_seconds`, `nodejs_heap_size_used_bytes`, GC histograms. Event-loop lag is
 * the one that matters most here — argon2 hashing is CPU-bound, so a login flood shows up as lag
 * long before it shows up as a 5xx.
 */
collectDefaultMetrics({ register: metricsRegistry });

/** Labels kept identical on both metrics so a rate and a quantile can be sliced the same way. */
const HTTP_LABELS = ["method", "route", "status_code"] as const;

export const httpRequestsTotal = new Counter({
  name: "http_requests_total",
  help: "Total HTTP requests, by method, matched route pattern and response status.",
  labelNames: HTTP_LABELS,
  registers: [metricsRegistry],
});

export const httpRequestDuration = new Histogram({
  name: "http_request_duration_seconds",
  help: "HTTP request latency in seconds, by method, matched route pattern and response status.",
  labelNames: HTTP_LABELS,
  // prom-client's defaults, stated explicitly because the top bucket is load-bearing here: argon2
  // password hashing puts signup/login in the 100-500ms range under normal load, so the useful
  // resolution sits in the middle of this range, not at the fast end.
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [metricsRegistry],
});

/**
 * The single most important line in this file. A time series is created per distinct label
 * combination, so labelling by `req.path` would mint one series per user id, per session id and
 * per 404 an internet scanner invents — an unauthenticated caller could exhaust Prometheus's
 * memory just by looping over random URLs.
 *
 * Express records the *pattern* that matched on `req.route` (e.g. "/users/:id"), relative to the
 * mount point, with the prefix on `req.baseUrl`. Anything that matched no route at all collapses
 * to one fixed label rather than being reported verbatim.
 */
export function routeLabel(req: Request): string {
  const matched = (req.route as { path?: string | string[] } | undefined)?.path;
  if (matched === undefined) return "<unmatched>";
  const pattern = Array.isArray(matched) ? matched.join("|") : String(matched);
  return `${req.baseUrl}${pattern}` || "/";
}

/**
 * Observes every request. Registered before Nest's router, so it sees requests the guard chain
 * rejects too; the `finish` listener reads the final status rather than assuming the handler set
 * it.
 *
 * `/metrics` itself is skipped — a scrape recording its own scrape is noise that grows with the
 * scrape interval and tells you nothing about the application.
 */
export function metricsCollector(): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    if (req.path === "/metrics") {
      next();
      return;
    }
    const stop = httpRequestDuration.startTimer();
    res.on("finish", () => {
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
 * `/metrics` reveals the full route table, process memory and runtime versions, so it is gated on
 * METRICS_TOKEN when that is set. The token is read per request, not captured at mount time, so
 * rotating it does not need a restart — and so the proof cycle can exercise both the gated and
 * ungated paths against one running app.
 */
export function metricsEndpoint(): RequestHandler {
  return (req: Request, res: Response) => {
    if (!authorizeScrape(req, res)) return;
    metricsRegistry
      .metrics()
      .then((body) => {
        res.setHeader("content-type", metricsRegistry.contentType);
        res.status(200).send(body);
      })
      .catch(() => {
        // Never leak a collector's internals to an endpoint reachable without a token.
        res.status(500).send("failed to collect metrics");
      });
  };
}

function authorizeScrape(req: Request, res: Response): boolean {
  const expected = process.env["METRICS_TOKEN"];
  if (!expected) return true;

  const header = req.headers.authorization ?? "";
  const presented = header.startsWith("Bearer ")
    ? header.slice("Bearer ".length)
    : "";
  if (constantTimeEquals(presented, expected)) return true;

  res.setHeader("www-authenticate", 'Bearer realm="metrics"');
  res.status(401).send("metrics scrape requires a bearer token");
  return false;
}

/** Compares without leaking the token's length or its matching prefix through timing. */
function constantTimeEquals(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/**
 * Installs collection and the `/metrics` endpoint. Call after `NestFactory.create` and before
 * `listen`, alongside `setupDocs(app)`:
 *
 * ```ts
 * const app = await NestFactory.create(AppModule);
 * app.setGlobalPrefix("api", { exclude: ["/", "health"] });
 * setupMetrics(app);
 * ```
 *
 * `setGlobalPrefix` only rewrites Nest-routed controllers, so `/metrics` stays at the root
 * whichever order these two are called in — which is what every Prometheus default expects.
 */
export function setupMetrics(app: INestApplication): void {
  if (!process.env["METRICS_TOKEN"]) {
    log.warn(
      "auth",
      "[simple-auth-kit] METRICS_TOKEN not set — /metrics is served to anyone who can reach this " +
        "port. It exposes the route table, process memory and runtime versions. Fine behind a " +
        "private network (a compose network, a Kubernetes pod network); set METRICS_TOKEN and " +
        "give Prometheus the matching bearer token before this port is reachable from anywhere else.",
    );
  }
  app.use(metricsCollector());
  app.use("/metrics", metricsEndpoint());
}
