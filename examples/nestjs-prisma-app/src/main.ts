import "dotenv/config";
import "reflect-metadata";
import { Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { AuthModule } from "./lib/auth/src/auth.module.js";
import { setupDocs } from "./lib/auth/src/docs.js";

@Module({
  imports: [AuthModule.forRoot()],
})
class AppModule {}

async function main() {
  const app = await NestFactory.create(AppModule);
  // This instance is shared by 4 local browser-based dev clients (admin-nextjs, admin-react,
  // and the web targets of the mobile apps), each on its own localhost port — permissive CORS
  // is fine for this local dev instance since the actual security boundary is the Bearer token,
  // not same-origin.
  app.enableCors({ origin: true, credentials: false });

  // Swagger UI at /docs, Scalar at /reference — both Basic-Auth-gated when NODE_ENV=production
  // (DOCS_USERNAME/DOCS_PASSWORD), open in dev.
  setupDocs(app);

  const port = Number(process.env["PORT"] ?? 3001);
  await app.listen(port);
  console.log(`example-nestjs-prisma-app listening on http://localhost:${port}`);
  console.log(`Swagger UI at http://localhost:${port}/docs — Scalar at /reference`);
}

main();
