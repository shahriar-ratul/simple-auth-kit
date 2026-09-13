import "dotenv/config";
import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { AppModule } from "./app.module.js";

async function main() {
  const app = await NestFactory.create(AppModule);

  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle("simple-auth-kit API")
      .setDescription(
        "nestjs-drizzle combo — signup/login, sessions, TOTP 2FA, OAuth, password reset, RBAC",
      )
      .setVersion("1.0")
      .addBearerAuth()
      .build(),
  );
  SwaggerModule.setup("docs", app, document);

  const port = Number(process.env["PORT"] ?? 3002);
  await app.listen(port);
  console.log(
    `example-nestjs-drizzle-app listening on http://localhost:${port}`,
  );
  console.log(`Swagger UI at http://localhost:${port}/docs`);
}

main();
