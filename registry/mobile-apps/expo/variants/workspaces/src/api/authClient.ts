import { AuthClient } from "@easy-auth/auth-client";
import { asyncStorageTokenStorage } from "../storage/asyncStorageTokenStorage";
import { activeWorkspaceIdResolver } from "../workspace/activeWorkspace";

// Expo's public-env convention: inlined at build time, readable at runtime via
// process.env. Falls back to localhost for local dev when unset. Note that on an
// Android emulator "localhost" refers to the emulator itself, not the host
// machine — use EXPO_PUBLIC_API_BASE_URL=http://10.0.2.2:3005 there, and the
// host machine's LAN IP for a physical device.
const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL ?? "http://localhost:3005";

// This app targets the workspaces backend variant (`easy-auth add <combo> --workspaces`), so it
// configures a workspace resolver. Which calls then carry `X-Workspace-Id` is not decided here
// and not decided per call site: inside AuthClient only `scopedRequest()` can send it, so
// `login`, `signup`, `sessions`, `logout*`, `POST /workspaces` and `GET /workspaces` structurally
// cannot — you cannot already be in the workspace you are about to create or choose.
export const authClient = new AuthClient({
  baseUrl: API_BASE_URL,
  storage: asyncStorageTokenStorage,
  workspaceId: activeWorkspaceIdResolver,
});
