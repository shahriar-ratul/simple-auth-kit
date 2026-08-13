# Build context MUST be the repo root (not this directory) — this app is a pnpm workspace
# member that depends on @easy-auth/auth-client via `workspace:*`, which is compiled to
# dist/ and must be built from source (it's not consumed as raw TS). That requires the
# whole workspace (pnpm-workspace.yaml, the lockfile, packages/auth-client) in scope.
#
# Runs `next dev` (not a production build): a generic image can't sensibly bake
# NEXT_PUBLIC_* values at build time (Next.js inlines them then), and this is a
# convenience local/demo stack, not a production deploy.
FROM node:26-bookworm-slim

WORKDIR /repo

# pnpm v11 per the repo's Prerequisites — resolved via corepack rather than hardcoding an
# install method, pinned to an exact version for reproducible builds. Node 26 no longer
# bundles corepack, so it's installed explicitly first.
RUN npm install -g corepack@latest && corepack enable && corepack prepare pnpm@11.21.0 --activate

COPY . .

# Scoped to admin-nextjs-workspaces + its workspace dependencies (auth-client) — avoids installing the
# unrelated combos/mobile-app dependency trees (argon2, prisma, etc.). pnpm v10+ still
# refuses to run even the remaining (harmless, platform-binary-linking) build scripts like
# esbuild's without explicit approval; --config here only affects this image layer, not the
# repo's own pnpm config.
RUN pnpm install --frozen-lockfile --filter "admin-nextjs-workspaces..." --config.dangerously-allow-all-builds=true
RUN pnpm --filter @easy-auth/auth-client run build

WORKDIR /repo/apps/admin-nextjs-workspaces
EXPOSE 3010
# `pnpm exec` (not `pnpm run dev -- ...`) so the -H flag actually reaches next's CLI parser
# instead of being swallowed as a literal "--" argument.
CMD ["pnpm", "exec", "next", "dev", "-H", "0.0.0.0", "-p", "3010"]
