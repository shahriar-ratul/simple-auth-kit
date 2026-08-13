import { createContext, type ReactNode, useContext } from "react";
import { authClient } from "@/lib/auth-client";
import { AuthStore } from "./auth-store";

export const authStore = new AuthStore(authClient);

const StoreContext = createContext<AuthStore>(authStore);

export function StoreProvider({ children }: { children: ReactNode }) {
  return <StoreContext.Provider value={authStore}>{children}</StoreContext.Provider>;
}

export function useAuthStore(): AuthStore {
  return useContext(StoreContext);
}
