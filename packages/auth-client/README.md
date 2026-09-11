# @simple-auth-kit/auth-client

Shared, framework-agnostic auth API client for [simple-auth-kit](https://github.com/shahriar-ratul/simple-auth-kit)
backends. Used by every client app in the repo (`admin-nextjs`, `admin-react`, `mobile-expo`,
`mobile-bare-rn`) — the auth flow and API contract are identical across them; only the
injected `TokenStorage` adapter differs per platform (`cookies-next` on web, `AsyncStorage`
on mobile).

## Install

```bash
npm install @simple-auth-kit/auth-client
```

Package: https://www.npmjs.com/package/@simple-auth-kit/auth-client

## Clone the source

This is a **standalone copy**, published from the monorepo. To pull just this package's
source without cloning the whole repo:

```bash
npx degit shahriar-ratul/simple-auth-kit/packages/auth-client auth-client
```

## Usage

```ts
import { createAuthClient } from "@simple-auth-kit/auth-client";

const auth = createAuthClient({
  baseUrl: "http://localhost:3001",
  tokenStorage: myTokenStorageAdapter, // platform-specific (cookies-next, AsyncStorage, ...)
});
```

Pair it with any simple-auth-kit backend combo (`nestjs-prisma`, `nestjs-drizzle`,
`express-prisma`, `express-drizzle`) — the API contract is the same across all four.

## Development

```bash
npm install
npm run build       # tsc -> dist/
npm run typecheck
npm run test         # vitest
```

## Source

Full source and every consuming app: [simple-auth-kit](https://github.com/shahriar-ratul/simple-auth-kit).
