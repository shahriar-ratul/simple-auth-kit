import "dotenv/config";
import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { apiReference } from "@scalar/nestjs-api-reference";
import type { Request, Response } from "express";
import { AppModule } from "./app.module.js";
import { setupMetrics } from "./infra/metrics/metrics.js";

// Starter entry point, written once by `simple-auth-kit add` and yours from then on — the CLI
// never overwrites or removes it. Replace it with your own whenever you like.
async function main() {
  const app = await NestFactory.create(AppModule);
  // Feature controllers declare their own "v1/..." paths, so they serve at /api/v1/...;
  // '/' and 'health' stay unprefixed.
  app.setGlobalPrefix("api", { exclude: ["/", "health"] });
  app.enableCors({ origin: true, credentials: false });

  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle("API")
      .setVersion("1.0")
      .addBearerAuth()
      .build(),
  );
  const reference = apiReference({ content: document });
  app.use("/docs", reference);
  app.use("/reference", reference);
  app.use("/docs-json", (_req: Request, res: Response) => res.json(document));

  // Prometheus metrics at /metrics; set METRICS_TOKEN to require a bearer token on every scrape.
  setupMetrics(app);

  const port = Number(process.env["PORT"] ?? 3000);
  await app.listen(port);
  console.log(`listening on http://localhost:${port} — API reference at /docs`);
}

main();
