"use client";

import { AbilityProvider } from "@casl/react";
import { observer } from "mobx-react-lite";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { buildAbility } from "../ability";
import { AuthStore } from "./auth-store";

/**
 * One bag rather than one context per store: a second store is then a field here and a `useX()`
 * export below, not a new provider wrapped around the tree. `admin-nextjs-workspaces` is the
 * same file with a `workspace` field added, which is exactly the shape this is here to keep.
 */
interface Stores {
  auth: AuthStore;
}

const StoresContext = createContext<Stores | null>(null);

function useStores(): Stores {
  const stores = useContext(StoresContext);
  if (!stores) throw new Error("useAuthStore must be used within <AppProviders>");
  return stores;
}

export function useAuthStore(): AuthStore {
  return useStores().auth;
}

/**
 * Owns the app's stores and re-derives the CASL ability from `auth.currentUser` on every change
 * (login, logout, 2FA, a permission granted to you elsewhere). Wrapped in `observer` so this
 * component itself re-renders when the MobX-observable `currentUser` changes, which is what
 * keeps the `AbilityProvider` value in sync.
 */
export const AppProviders = observer(function AppProviders({ children }: { children: ReactNode }) {
  const [stores] = useState<Stores>(() => ({ auth: new AuthStore() }));

  useEffect(() => {
    void stores.auth.initialize();
  }, [stores]);

  const ability = buildAbility(stores.auth.currentUser);

  return (
    <StoresContext.Provider value={stores}>
      <AbilityProvider value={ability}>{children}</AbilityProvider>
    </StoresContext.Provider>
  );
});
