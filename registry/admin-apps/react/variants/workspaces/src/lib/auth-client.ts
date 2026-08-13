import { AuthClient, type WorkspaceIdResolver } from "@easy-auth/auth-client";
import { cookieTokenStorage } from "./token-storage";

const baseUrl = import.meta.env["VITE_AUTH_API_URL"] ?? "http://localhost:3005";

/**
 * Where "which workspace am I in" lives is the app's business, not the client's, so the client
 * is configured with a resolver and the store binds itself to it once at startup
 * (`src/stores/store-context.tsx`). Every workspace-scoped call then reads the store's current
 * answer at request time — a switch takes effect on the next call with no client re-creation
 * and no stale copy of the id anywhere.
 *
 * The default until that binding happens is "no workspace", so a call made before the store has
 * loaded sends no `X-Workspace-Id` and is rejected by the backend rather than acting in an
 * arbitrary workspace.
 */
let resolveActiveWorkspace: WorkspaceIdResolver = () => null;

export function bindActiveWorkspace(resolver: WorkspaceIdResolver): void {
  resolveActiveWorkspace = resolver;
}

export const authClient = new AuthClient({
  baseUrl,
  storage: cookieTokenStorage,
  workspaceId: () => resolveActiveWorkspace(),
});
