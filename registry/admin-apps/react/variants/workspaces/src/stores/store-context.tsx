import { createContext, type ReactNode, useContext } from "react";
import { authClient, bindActiveWorkspace } from "@/lib/auth-client";
import { AuthStore } from "./auth-store";
import { WorkspaceStore } from "./workspace-store";

export const workspaceStore = new WorkspaceStore(authClient);

/**
 * The one place the two stores are joined, and the only place that knows the order they depend
 * on each other in:
 *
 *   • a session isn't usable until the workspace list has loaded, because `/auth/me` reports the
 *     caller's roles and permissions *in the active workspace* and answers empty without one;
 *   • switching workspaces invalidates those permissions, so it re-reads the session.
 */
export const authStore = new AuthStore(authClient, {
  onSessionEstablished: () => workspaceStore.load(),
  onSessionEnded: () => workspaceStore.reset(),
});

workspaceStore.bindOnActiveChanged(() => authStore.refreshCurrentUser());

// From here on every workspace-scoped call carries whichever workspace the store says is active.
bindActiveWorkspace(() => workspaceStore.activeWorkspaceId);

interface Stores {
  auth: AuthStore;
  workspaces: WorkspaceStore;
}

const StoreContext = createContext<Stores>({ auth: authStore, workspaces: workspaceStore });

export function StoreProvider({ children }: { children: ReactNode }) {
  return <StoreContext.Provider value={{ auth: authStore, workspaces: workspaceStore }}>{children}</StoreContext.Provider>;
}

export function useAuthStore(): AuthStore {
  return useContext(StoreContext).auth;
}

export function useWorkspaceStore(): WorkspaceStore {
  return useContext(StoreContext).workspaces;
}
