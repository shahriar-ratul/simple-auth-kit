import type { INestApplication } from "@nestjs/common";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import type { OpenAPIObject } from "@nestjs/swagger";
import { apiReference } from "@scalar/nestjs-api-reference";
import type { NextFunction, Request, Response } from "express";

// Production-only gate: development keeps zero-friction docs, production requires the DOCS_*
// pair on every docs route. Credentials missing in production fail closed (503), not open.
export function docsBasicAuth(req: Request, res: Response, next: NextFunction): void {
  if (process.env["NODE_ENV"] !== "production") return next();

  const username = process.env["DOCS_USERNAME"];
  const password = process.env["DOCS_PASSWORD"];
  if (!username || !password) {
    res.status(503).send("Docs are unavailable: DOCS_USERNAME and DOCS_PASSWORD are not set");
    return;
  }

  const header = req.headers.authorization;
  if (header?.startsWith("Basic ")) {
    // Split on the first colon only — RFC 7617 allows colons inside the password.
    const [user, ...rest] = Buffer.from(header.slice("Basic ".length), "base64").toString("utf8").split(":");
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
 * Swagger UI at `/docs` and a Scalar reference at `/reference`, both (plus the raw spec routes
 * Swagger registers alongside the UI) behind `docsBasicAuth`. Call after `NestFactory.create`,
 * before `listen`.
 */
export function setupDocs(app: INestApplication, opts: DocsOptions = {}): OpenAPIObject {
  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle(opts.title ?? "easy-auth API")
      .setDescription(opts.description ?? "nestjs-prisma reference combo — signup/login, sessions, TOTP 2FA, OAuth, password reset, RBAC, audit log")
      .setVersion(opts.version ?? "1.0")
      .addBearerAuth()
      .build(),
  );

  // The gates must be registered before SwaggerModule.setup so they run ahead of the UI
  // middleware. `/docs-json` and `/docs-yaml` are separate express paths — a `/docs` prefix
  // mount does not cover them.
  for (const path of ["/docs", "/docs-json", "/docs-yaml", "/reference"]) app.use(path, docsBasicAuth);

  SwaggerModule.setup("docs", app, document);
  app.use("/reference", apiReference({ content: document }));
  return document;
}
