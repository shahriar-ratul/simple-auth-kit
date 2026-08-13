import { AuthClient } from "@easy-auth/auth-client";
import { asyncStorageTokenStorage } from "../storage/asyncStorageTokenStorage";

// Expo's public-env convention: inlined at build time, readable at runtime via
// process.env. Falls back to localhost for local dev when unset. Note that on an
// Android emulator "localhost" refers to the emulator itself, not the host
// machine — use EXPO_PUBLIC_API_BASE_URL=http://10.0.2.2:3001 there, and the
// host machine's LAN IP for a physical device.
const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL ?? "http://localhost:3001";

// No `workspaceId` — this app targets the plain backend variant (`easy-auth add <combo>`),
// which has no workspace concept, so nothing here ever sends `X-Workspace-Id`. The
// workspace-aware counterpart lives in apps/mobile-expo-workspaces.
export const authClient = new AuthClient({
  baseUrl: API_BASE_URL,
  storage: asyncStorageTokenStorage,
});
