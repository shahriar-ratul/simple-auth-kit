import { create } from "zustand";
import { AuthApiError, type SessionSummary } from "@simple-auth-kit/auth-client";
import { authClient } from "../api/authClient";

/**
 * The signed-in user's active sessions, listed on the Sessions screen. Owned here rather than
 * in the screen's own `useState` so that data-fetching state lives outside `useEffect`, the same
 * way `workspaceStore` owns the workspace list — not because the sessions list is shared with
 * any other screen.
 */
interface SessionsState {
  sessions: SessionSummary[];
  /** True until the first fetch settles. */
  isLoading: boolean;
  error: string | null;

  /** Fetches the current user's sessions. */
  load: () => Promise<void>;
}

export const useSessionsStore = create<SessionsState>((set) => ({
  sessions: [],
  isLoading: true,
  error: null,

  load: async () => {
    set({ error: null });
    try {
      const sessions = await authClient.sessions();
      set({ sessions, isLoading: false });
    } catch (err) {
      set({ isLoading: false, error: err instanceof AuthApiError ? err.message : "Failed to load sessions." });
    }
  },
}));
