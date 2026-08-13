import { AuthClient } from "@easy-auth/auth-client";
import { AUTH_API_URL } from "./env";
import { cookieTokenStorage } from "./token-storage";

// One client for the whole app — cheap to construct, holds no mutable state of its own beyond
// the injected storage adapter, so a module-level singleton is safe across client components.
export const authClient = new AuthClient({
  baseUrl: AUTH_API_URL,
  storage: cookieTokenStorage,
});
