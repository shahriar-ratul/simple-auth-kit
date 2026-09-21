import type { INestApplication } from "@nestjs/common";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import type { OpenAPIObject } from "@nestjs/swagger";
import { apiReference } from "@scalar/nestjs-api-reference";
import type { NextFunction, Request, Response } from "express";

// Production-only gate: development keeps zero-friction docs, production requires the DOCS_*
// pair on every docs route. Credentials missing in production fail closed (503), not open.
export function docsBasicAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (process.env["NODE_ENV"] !== "production") return next();

  const username = process.env["DOCS_USERNAME"];
  const password = process.env["DOCS_PASSWORD"];
  if (!username || !password) {
    res
      .status(503)
      .send(
        "Docs are unavailable: DOCS_USERNAME and DOCS_PASSWORD are not set",
      );
    return;
  }

  const header = req.headers.authorization;
  if (header?.startsWith("Basic ")) {
    // Split on the first colon only — RFC 7617 allows colons inside the password.
    const [user, ...rest] = Buffer.from(header.slice("Basic ".length), "base64")
      .toString("utf8")
      .split(":");
    if (user === username && rest.join(":") === password) return next();
  }

  res.setHeader("WWW-Authenticate", 'Basic realm="API docs"');
  res.status(401).send("Authentication required");
}

export interface DocsOptions {
  title?: string;
  description?: string;
  version?: string;
}

/**
 * A Scalar reference at `/docs` and `/reference`, with the raw spec at `/docs-json`, all behind
 * `docsBasicAuth`. Call after `NestFactory.create`, before `listen`.
 *
 * `@nestjs/swagger` still builds the document from the controllers' `@Api*` decorators — only its
 * bundled Swagger UI goes unused, which is what keeps `swagger-ui-dist` (and the `@scarf/scarf`
 * telemetry package underneath it) off the runtime path. Serving one UI instead of two also means
 * `/docs` and `/reference` can no longer disagree about what the API looks like.
 */
export function setupDocs(
  app: INestApplication,
  opts: DocsOptions = {},
): OpenAPIObject {
  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle(opts.title ?? "simple-auth-kit API")
      .setDescription(
        opts.description ??
          "nestjs-prisma reference combo — signup/login, sessions, TOTP 2FA, OAuth, password reset, RBAC, audit log",
      )
      .setVersion(opts.version ?? "1.0")
      .addBearerAuth()
      .build(),
  );

  // The gates must be registered before the handlers below so they run first. `/docs-json` is a
  // separate express path — a `/docs` prefix mount does not cover it.
  for (const path of ["/docs", "/docs-json", "/reference"])
    app.use(path, docsBasicAuth);

  // `/docs-json` is registered by hand because it used to come free with SwaggerModule.setup(),
  // which no longer runs. (`/docs-yaml` went with it — nothing referenced it.)
  const reference = apiReference({ content: document });
  app.use("/docs", reference);
  app.use("/reference", reference);
  app.use("/docs-json", (_req: Request, res: Response) => res.json(document));
  return document;
}
