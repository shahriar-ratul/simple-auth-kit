import 'dotenv/config';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { setupMetrics } from './infra/metrics/metrics.js';
import { setupDocs } from './infra/openapi/docs.js';

async function main() {
  const app = await NestFactory.create(AppModule);
  // Every feature controller declares its own path as "v1/..." (see registry/README.md) —
  // "api" is the one piece of the prefix that belongs to how this app is deployed, not to the
  // route itself, so it's set here rather than baked into the controllers. AppController's
  // own routes ('/' and 'health') and the docs/reference middleware below are deliberately
  // unversioned — a health check and a docs UI aren't part of the API surface being versioned.
  app.setGlobalPrefix('api', { exclude: ['/', 'health'] });
  // This instance is shared by 4 local browser-based dev clients (admin-nextjs, admin-react,
  // and the web targets of the mobile apps), each on its own localhost port — permissive CORS
  // is fine for this local dev instance since the actual security boundary is the Bearer token,
  // not same-origin.
  app.enableCors({ origin: true, credentials: false });

  // Swagger UI at /docs, Scalar at /reference — both Basic-Auth-gated when NODE_ENV=production
  // (DOCS_USERNAME/DOCS_PASSWORD), open in dev.
  setupDocs(app);

  // Prometheus metrics at /metrics. Raw middleware, like the docs above — a Nest
  // controller would sit behind the guard chain and never see the 401s and 403s it
  // raises. Set METRICS_TOKEN to require a bearer token on every scrape.
  setupMetrics(app);

  const port = Number(process.env['PORT'] ?? 3001);
  await app.listen(port);
  console.log(`example-nestjs-prisma-app listening on http://localhost:${port}`);
  console.log(`Swagger UI at http://localhost:${port}/docs — Scalar at /reference`);
}

main();
