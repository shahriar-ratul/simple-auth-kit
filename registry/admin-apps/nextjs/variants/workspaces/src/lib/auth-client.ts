import { AuthClient } from "@easy-auth/auth-client";
import { getActiveWorkspaceId } from "./active-workspace";
import { AUTH_API_URL } from "./env";
import { cookieTokenStorage } from "./token-storage";

// One client for the whole app — cheap to construct, holds no mutable state of its own beyond
// the injected storage adapter, so a module-level singleton is safe across client components.
//
// `workspaceId` is a resolver, not a fixed string: it is read fresh on every workspace-scoped
// call, so changing the active workspace in the switcher changes what the next request is scoped
// to with nothing to re-wire. Which calls carry `X-Workspace-Id` is not decided here and cannot
// be — inside the client only `scopedRequest()` can send it, and `request()` has no way to.
export const authClient = new AuthClient({
  baseUrl: AUTH_API_URL,
  storage: cookieTokenStorage,
  workspaceId: getActiveWorkspaceId,
});
