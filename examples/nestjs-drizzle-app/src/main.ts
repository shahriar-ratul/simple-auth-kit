import 'dotenv/config';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { apiReference } from '@scalar/nestjs-api-reference';
import type { Request, Response } from 'express';
import { AppModule } from './app.module.js';

async function main() {
  const app = await NestFactory.create(AppModule);
  // Every feature controller declares its own path as "v1/..." (see registry/README.md) —
  // "api" is the one piece of the prefix that belongs to how this app is deployed, not to the
  // route itself, so it's set here rather than baked into the controllers. AppController's
  // own routes ('/' and 'health') and the docs middleware below are deliberately unversioned —
  // a health check and a docs UI aren't part of the API surface being versioned.
  app.setGlobalPrefix('api', { exclude: ['/', 'health'] });

  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('simple-auth-kit API')
      .setDescription('nestjs-drizzle combo — signup/login, sessions, TOTP 2FA, OAuth, password reset, RBAC')
      .setVersion('1.0')
      .addBearerAuth()
      .build(),
  );
  const reference = apiReference({ content: document });
  app.use('/docs', reference);
  app.use('/reference', reference);
  app.use('/docs-json', (_req: Request, res: Response) => res.json(document));

  const port = Number(process.env['PORT'] ?? 3002);
  await app.listen(port);
  console.log(`example-nestjs-drizzle-app listening on http://localhost:${port}`);
  console.log(`API reference at http://localhost:${port}/docs — also at /reference`);
}

main();
