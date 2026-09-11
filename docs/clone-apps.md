# Clone a single app

Every backend, admin console, and mobile app in this repo has its own `README.md` with setup
steps. Each one can be pulled on its own with [`degit`](https://github.com/Rich-Harris/degit)
— it fetches just that folder's files (no `.git` history, nothing else from the repo):

```bash
# Backends (examples/)
npx degit shahriar-ratul/simple-auth-kit/examples/nestjs-prisma-app              nestjs-prisma-app
npx degit shahriar-ratul/simple-auth-kit/examples/nestjs-prisma-app-workspaces   nestjs-prisma-app-workspaces
npx degit shahriar-ratul/simple-auth-kit/examples/nestjs-drizzle-app             nestjs-drizzle-app
npx degit shahriar-ratul/simple-auth-kit/examples/nestjs-drizzle-app-workspaces  nestjs-drizzle-app-workspaces
npx degit shahriar-ratul/simple-auth-kit/examples/express-prisma-app            express-prisma-app
npx degit shahriar-ratul/simple-auth-kit/examples/express-prisma-app-workspaces express-prisma-app-workspaces
npx degit shahriar-ratul/simple-auth-kit/examples/express-drizzle-app           express-drizzle-app
npx degit shahriar-ratul/simple-auth-kit/examples/express-drizzle-app-workspaces express-drizzle-app-workspaces

# Admin consoles (apps/)
npx degit shahriar-ratul/simple-auth-kit/apps/admin-nextjs              admin-nextjs
npx degit shahriar-ratul/simple-auth-kit/apps/admin-nextjs-workspaces   admin-nextjs-workspaces
npx degit shahriar-ratul/simple-auth-kit/apps/admin-react               admin-react
npx degit shahriar-ratul/simple-auth-kit/apps/admin-react-workspaces    admin-react-workspaces

# Mobile apps (apps/)
npx degit shahriar-ratul/simple-auth-kit/apps/mobile-expo               mobile-expo
npx degit shahriar-ratul/simple-auth-kit/apps/mobile-expo-workspaces    mobile-expo-workspaces
npx degit shahriar-ratul/simple-auth-kit/apps/mobile-bare-rn            mobile-bare-rn
npx degit shahriar-ratul/simple-auth-kit/apps/mobile-bare-rn-workspaces mobile-bare-rn-workspaces

# Shared client package
npx degit shahriar-ratul/simple-auth-kit/packages/auth-client           auth-client

# The CLI itself — prefer `npx @simple-auth-kit/cli` instead unless you specifically need the
# source; a degit clone of the CLI doesn't have registry/ bundled in (that only happens at
# publish time), so it can't install anything on its own without the monorepo alongside it.
npx degit shahriar-ratul/simple-auth-kit/packages/cli                   cli
```

Every app above depends on the published
[`@simple-auth-kit/auth-client`](https://www.npmjs.com/package/@simple-auth-kit/auth-client) —
a plain `npm install` resolves it, no monorepo/pnpm workspace required.
`apps/dev-portal` is repo-tooling only and has no standalone clone path — see its README.
