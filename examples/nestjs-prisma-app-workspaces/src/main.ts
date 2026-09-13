import "dotenv/config";
import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { AppModule } from "./app.module.js";

async function main() {
  const app = await NestFactory.create(AppModule);
  // This instance is shared by 4 local browser-based dev clients (admin-nextjs, admin-react,
  // and the web targets of the mobile apps), each on its own localhost port — permissive CORS
  // is fine for this local dev instance since the actual security boundary is the Bearer token,
  // not same-origin.
  app.enableCors({ origin: true, credentials: false });

  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle("simple-auth-kit API")
      .setDescription(
        "nestjs-prisma reference combo, workspaces variant — signup/login, sessions, TOTP 2FA, OAuth, password reset, RBAC, audit log, workspace membership",
      )
      .setVersion("1.0")
      .addBearerAuth()
      .build(),
  );
  SwaggerModule.setup("docs", app, document);

  const port = Number(process.env["PORT"] ?? 3005);
  await app.listen(port);
  console.log(
    `example-nestjs-prisma-app-workspaces listening on http://localhost:${port}`,
  );
  console.log(`Swagger UI at http://localhost:${port}/docs`);
}

main();
