// The backend base URL is public by design — the browser talks to it directly with a Bearer
// token, there's no server-side secret in this app to protect (see plan/README.md decision log:
// frontend-managed cookies, not backend-issued httpOnly ones).
export const AUTH_API_URL = process.env.NEXT_PUBLIC_AUTH_API_URL ?? "http://localhost:3005";
