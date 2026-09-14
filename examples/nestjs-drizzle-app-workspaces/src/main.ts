import 'dotenv/config';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
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
      .setDescription(
        'nestjs-drizzle combo, workspaces variant — signup/login, sessions, TOTP 2FA, OAuth, password reset, RBAC, workspace membership',
      )
      .setVersion('1.0')
      .addBearerAuth()
      .build(),
  );
  SwaggerModule.setup('docs', app, document);

  const port = Number(process.env['PORT'] ?? 3006);
  await app.listen(port);
  console.log(`example-nestjs-drizzle-app-workspaces listening on http://localhost:${port}`);
  console.log(`Swagger UI at http://localhost:${port}/docs`);
}

main();
