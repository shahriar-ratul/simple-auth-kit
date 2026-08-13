import { AuthClient } from "@easy-auth/auth-client";
import { cookieTokenStorage } from "./token-storage";

const baseUrl = import.meta.env["VITE_AUTH_API_URL"] ?? "http://localhost:3001";

export const authClient = new AuthClient({
  baseUrl,
  storage: cookieTokenStorage,
});
