import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import type { WorkspaceIdResolver } from "@easy-auth/auth-client";

/**
 * The single source of truth for "which workspace am I acting in", and the app side of
 * `AuthClient`'s `WorkspaceIdResolver` seam — the same injected-dependency shape as
 * `TokenStorage`. The client never owns this; it asks.
 *
 * Deliberately dependency-free: `src/api/authClient.ts` imports this module, so this module
 * must never import the client back. Anything that needs both (listing workspaces, creating
 * one) lives in `src/store/workspaceStore.ts`, one layer up.
 *
 * Persisted to AsyncStorage so a relaunch lands back in the workspace you were last in.
 * Unencrypted, for the same reason the tokens are — see `asyncStorageTokenStorage`.
 */
const STORAGE_KEY = "easy-auth/active-workspace";

interface ActiveWorkspaceState {
  workspaceId: string | null;
  /** False until `hydrateActiveWorkspace()` has read AsyncStorage — read before trusting `workspaceId === null`. */
  isHydrated: boolean;
}

export const useActiveWorkspaceStore = create<ActiveWorkspaceState>(() => ({
  workspaceId: null,
  isHydrated: false,
}));

/** Call once, before the first workspace-scoped request, so it can carry the persisted workspace. */
export async function hydrateActiveWorkspace(): Promise<string | null> {
  const stored = await AsyncStorage.getItem(STORAGE_KEY);
  const workspaceId = stored && stored.length > 0 ? stored : null;
  useActiveWorkspaceStore.setState({ workspaceId, isHydrated: true });
  return workspaceId;
}

/** `null` goes back to sending no `X-Workspace-Id` at all — which is what logging out does. */
export async function setActiveWorkspaceId(workspaceId: string | null): Promise<void> {
  useActiveWorkspaceStore.setState({ workspaceId, isHydrated: true });
  if (workspaceId === null) await AsyncStorage.removeItem(STORAGE_KEY);
  else await AsyncStorage.setItem(STORAGE_KEY, workspaceId);
}

export function getActiveWorkspaceId(): string | null {
  return useActiveWorkspaceStore.getState().workspaceId;
}

/**
 * Handed to `new AuthClient({ workspaceId })`. Resolved per request, so a workspace switch
 * takes effect on the very next scoped call without rebuilding the client.
 */
export const activeWorkspaceIdResolver: WorkspaceIdResolver = () => getActiveWorkspaceId();

export const useActiveWorkspaceId = (): string | null => useActiveWorkspaceStore((state) => state.workspaceId);
