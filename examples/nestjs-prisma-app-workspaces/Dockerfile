# Build context is the repo root (see docker-compose.yml) so a single root .dockerignore
# covers every service. This app is a standalone npm project (not a pnpm workspace member).
FROM node:26-bookworm-slim

# Prisma's query engine needs libssl to detect the OpenSSL version at generate/runtime.
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY examples/nestjs-prisma-app-workspaces/package.json examples/nestjs-prisma-app-workspaces/package-lock.json ./
RUN npm ci

COPY examples/nestjs-prisma-app-workspaces/ .

# prisma.config.ts (which supplies datasource.url from DATABASE_URL, required by Prisma 7)
# lives at the project root, alongside prisma/ — Prisma's own convention, no cd needed.
# `prisma generate` only needs the schema file, not a reachable database, so it's safe to
# run at build time. `prisma migrate deploy` (needs Postgres) runs from the entrypoint instead.
RUN npx prisma generate

RUN chmod +x docker-entrypoint.sh

EXPOSE 3005
ENTRYPOINT ["./docker-entrypoint.sh"]
