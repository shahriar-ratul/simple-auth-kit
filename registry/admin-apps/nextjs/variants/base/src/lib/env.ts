// The backend base URL is public by design — the browser talks to it directly with a Bearer
// token, there's no server-side secret in this app to protect (see plan/README.md decision log:
// frontend-managed cookies, not backend-issued httpOnly ones).
export const AUTH_API_URL = process.env.NEXT_PUBLIC_AUTH_API_URL ?? "http://localhost:3001";

// Server-side calls (NextAuth authorize(), proxy.ts token verify) run inside the app's own
// process, where the browser-facing URL may not resolve — in docker compose, "localhost:3001"
// is the console container itself, not the backend service. This override names the backend as
// the server sees it (e.g. http://nestjs-prisma-app:3001); outside compose the two are the same.
export const AUTH_API_INTERNAL_URL = process.env.AUTH_API_INTERNAL_URL ?? AUTH_API_URL;
