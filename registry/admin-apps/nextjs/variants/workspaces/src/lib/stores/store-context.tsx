"use client";

import { AbilityProvider } from "@casl/react";
import { observer } from "mobx-react-lite";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { buildAbility } from "../ability";
import { AuthStore } from "./auth-store";
import { WorkspaceStore } from "./workspace-store";

interface Stores {
  auth: AuthStore;
  workspace: WorkspaceStore;
}

const StoresContext = createContext<Stores | null>(null);

function useStores(): Stores {
  const stores = useContext(StoresContext);
  if (!stores) throw new Error("useAuthStore/useWorkspaceStore must be used within <AppProviders>");
  return stores;
}

export function useAuthStore(): AuthStore {
  return useStores().auth;
}

export function useWorkspaceStore(): WorkspaceStore {
  return useStores().workspace;
}

/**
 * Owns the app's stores and re-derives the CASL ability from `auth.currentUser` on every change.
 *
 * The two stores are ordered, not independent: `/auth/me` answers with the roles and permissions
 * of *the workspace the request named*, so the workspace list has to be settled before the
 * identity means anything. Signing in therefore runs `auth.initialize()`, then
 * `workspace.load()`, which picks an active workspace and re-reads the identity inside it.
 * Wrapped in `observer` so the `AbilityProvider` value follows `currentUser` as that happens.
 */
export const AppProviders = observer(function AppProviders({ children }: { children: ReactNode }) {
  const [stores] = useState<Stores>(() => {
    const auth = new AuthStore();
    return { auth, workspace: new WorkspaceStore(auth) };
  });

  useEffect(() => {
    void stores.auth.initialize();
  }, [stores]);

  useEffect(() => {
    if (stores.auth.status !== "ready") return;
    if (stores.auth.isAuthenticated) {
      if (stores.workspace.status === "idle") void stores.workspace.load();
    } else if (stores.workspace.status !== "idle") {
      stores.workspace.reset();
    }
  }, [stores, stores.auth.status, stores.auth.isAuthenticated, stores.workspace.status]);

  const ability = buildAbility(stores.auth.currentUser);

  return (
    <StoresContext.Provider value={stores}>
      <AbilityProvider value={ability}>{children}</AbilityProvider>
    </StoresContext.Provider>
  );
});
