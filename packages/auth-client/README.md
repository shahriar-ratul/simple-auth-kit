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

`baseUrl` and `storage` are **required** — this package has no default backend URL and no
built-in storage. You provide both, from your own app's config:

- `baseUrl`: a plain string — this package doesn't read any env var itself, so how you produce
  that string is entirely up to your own setup. The only real question is how *your* build tool
  gets an env value into browser-run JS in the first place:

  | Your setup | How to expose the value |
  |---|---|
  | Node.js backend (SSR, BFF, server-only code) | `process.env.AUTH_API_URL` directly — no build step needed |
  | Next.js | prefix it `NEXT_PUBLIC_*` — only those are inlined into the browser bundle |
  | Vite | prefix it `VITE_*`, read via `import.meta.env.VITE_AUTH_API_URL` |
  | CRA / plain webpack | `REACT_APP_*` (CRA) or whatever your `DefinePlugin` rule exposes |
  | Expo | prefix it `EXPO_PUBLIC_*` |
  | Bare React Native | no built-in env support — use `react-native-config` (native build step) or `react-native-dotenv` (Babel plugin) |
  | Plain `<script>`, no bundler | can't inline env vars at all — hardcode it, have your server inject it (e.g. `<script>window.__ENV__={API_URL:"..."}</script>`), or `fetch('/config.json')` at runtime |

  Whichever string you end up with, that's the entire integration — pass it as `baseUrl` below.
  `process.env.AUTH_API_URL` in the snippet is illustrative, not a name this package looks for.
- `storage`: a small object implementing `{ get, set, clear }` (see `TokenStorage` in
  `types.ts`) — e.g. cookies on web, `AsyncStorage` on mobile. This package ships no
  implementation; you write the one that fits your platform.

```ts
import { AuthClient } from "@simple-auth-kit/auth-client";

const auth = new AuthClient({
  baseUrl: process.env.AUTH_API_URL!, // wherever *your* backend is deployed — read via your own framework's env convention
  storage: myTokenStorageAdapter, // your own TokenStorage implementation — platform-specific (cookies, AsyncStorage, ...)
});
```

Pair it with any simple-auth-kit backend combo (`nestjs-prisma`, `nestjs-drizzle`,
`express-prisma`, `express-drizzle`) — the API contract is the same across all four.

`baseUrl` is read once, at construction, and kept on the instance — no method takes it as an
argument. Construct one `AuthClient` at app startup (a module-level singleton, as every app in
this repo does) and import that same instance everywhere else:

```ts
// lib/auth-client.ts — built once, when this module first loads
export const authClient = new AuthClient({ baseUrl: AUTH_API_URL, storage: cookieTokenStorage });

// every other call site — just import and use; baseUrl is never mentioned again
await authClient.login({ identifier, password });
await authClient.me();
```

## Development

```bash
npm install
npm run build       # tsc -> dist/
npm run typecheck
npm run test         # vitest
```

## Source

Full source and every consuming app: [simple-auth-kit](https://github.com/shahriar-ratul/simple-auth-kit).
