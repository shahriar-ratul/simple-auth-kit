import { create } from "zustand";
import { AuthApiError, type CurrentUser } from "@easy-auth/auth-client";
import { authClient } from "../api/authClient";
import { useWorkspaceStore } from "./workspaceStore";
import { getActiveWorkspaceId, hydrateActiveWorkspace, setActiveWorkspaceId } from "../workspace/activeWorkspace";

/**
 * Everything that follows a successful authentication, in the order the workspaces variant
 * requires it:
 *
 *  1. list the workspaces this user belongs to — `GET /workspaces` is not workspace-scoped, so
 *     it is the one call that works before any workspace is chosen;
 *  2. drop a persisted active workspace the user is no longer a member of. Without this,
 *     `GET /auth/me` would carry a stale `X-Workspace-Id` and the backend would answer 403
 *     (deliberately indistinguishable from "no such workspace"), which bootstrap would read as
 *     a dead session and sign a perfectly good user out;
 *  3. only then ask who we are — `me()` carries the active workspace, so its `roles` and
 *     `permissions` are the ones that apply *inside* it.
 *
 * No workspace is auto-selected when several are available: choosing is the user's, and
 * `RootNavigator` routes to the picker while none is active.
 */
async function loadIdentityForActiveWorkspace(): Promise<CurrentUser> {
  const workspaces = await useWorkspaceStore.getState().load();
  const activeWorkspaceId = getActiveWorkspaceId();
  if (activeWorkspaceId && !workspaces.some((workspace) => workspace.id === activeWorkspaceId)) {
    await setActiveWorkspaceId(null);
  }
  return authClient.me();
}

export interface LoginResult {
  twoFactorRequired: boolean;
}

interface AuthState {
  /** Populated from `me()` after any successful auth flow completes. */
  currentUser: CurrentUser | null;
  /** True while `bootstrap()` is checking for an already-stored session on app start. */
  isBootstrapping: boolean;
  /** True while a login/signup/2fa/logout request is in flight. */
  isSubmitting: boolean;
  /** Last error message from an auth action, if any — screens can render/clear this. */
  error: string | null;
  /** Set when `login()` returns a 2FA challenge instead of tokens. */
  pendingChallengeToken: string | null;

  /** Call once on app start: hydrate the persisted active workspace, then `currentUser` from `me()` if tokens are stored. */
  bootstrap: () => Promise<void>;
  /** Re-fetch `me()` for an already-authenticated user (e.g. pull-to-refresh on Home). */
  refreshCurrentUser: () => Promise<void>;
  signup: (input: { email: string; password: string }) => Promise<void>;
  login: (input: { identifier: string; password: string }) => Promise<LoginResult>;
  loginTwoFactor: (code: string) => Promise<void>;
  logout: () => Promise<void>;
  logoutAll: () => Promise<void>;
  clearError: () => void;
}

function messageFor(err: unknown): string {
  if (err instanceof AuthApiError) return err.message;
  if (err instanceof Error) return err.message;
  return "Something went wrong. Please try again.";
}

export const useAuthStore = create<AuthState>((set, get) => ({
  currentUser: null,
  isBootstrapping: true,
  isSubmitting: false,
  error: null,
  pendingChallengeToken: null,

  bootstrap: async () => {
    set({ isBootstrapping: true });
    try {
      // Before any scoped request, so the first `me()` already names the right workspace.
      await hydrateActiveWorkspace();
      const hasTokens = await authClient.isAuthenticated();
      if (!hasTokens) {
        await useWorkspaceStore.getState().reset();
        set({ currentUser: null, isBootstrapping: false });
        return;
      }
      const currentUser = await loadIdentityForActiveWorkspace();
      set({ currentUser, isBootstrapping: false });
    } catch {
      // Stored tokens were invalid/expired and unrefreshable — fall back to logged-out.
      set({ currentUser: null, isBootstrapping: false });
    }
  },

  refreshCurrentUser: async () => {
    try {
      const currentUser = await authClient.me();
      set({ currentUser });
    } catch (err) {
      set({ error: messageFor(err) });
      throw err;
    }
  },

  signup: async (input) => {
    set({ isSubmitting: true, error: null });
    try {
      await authClient.signup(input);
      // A brand-new user belongs to no workspace yet — the picker offers creating the first one.
      const currentUser = await loadIdentityForActiveWorkspace();
      set({ currentUser, isSubmitting: false });
    } catch (err) {
      set({ isSubmitting: false, error: messageFor(err) });
      throw err;
    }
  },

  login: async (input) => {
    set({ isSubmitting: true, error: null });
    try {
      const result = await authClient.login(input);
      if ("twoFactorRequired" in result && result.twoFactorRequired) {
        set({ isSubmitting: false, pendingChallengeToken: result.challengeToken });
        return { twoFactorRequired: true };
      }
      const currentUser = await loadIdentityForActiveWorkspace();
      set({ currentUser, isSubmitting: false, pendingChallengeToken: null });
      return { twoFactorRequired: false };
    } catch (err) {
      set({ isSubmitting: false, error: messageFor(err) });
      throw err;
    }
  },

  loginTwoFactor: async (code) => {
    const challengeToken = get().pendingChallengeToken;
    if (!challengeToken) {
      const err = new Error("No pending 2FA challenge — start over from login.");
      set({ error: err.message });
      throw err;
    }
    set({ isSubmitting: true, error: null });
    try {
      await authClient.loginTwoFactor({ challengeToken, code });
      const currentUser = await loadIdentityForActiveWorkspace();
      set({ currentUser, isSubmitting: false, pendingChallengeToken: null });
    } catch (err) {
      set({ isSubmitting: false, error: messageFor(err) });
      throw err;
    }
  },

  logout: async () => {
    set({ isSubmitting: true, error: null });
    try {
      await authClient.logout();
    } catch {
      // Even if the network call fails, storage is cleared by the client — proceed
      // to a logged-out UI state rather than trapping the user.
    } finally {
      await useWorkspaceStore.getState().reset();
      set({ currentUser: null, isSubmitting: false, pendingChallengeToken: null });
    }
  },

  logoutAll: async () => {
    set({ isSubmitting: true, error: null });
    try {
      await authClient.logoutAll();
    } catch {
      // Same rationale as logout() above.
    } finally {
      await useWorkspaceStore.getState().reset();
      set({ currentUser: null, isSubmitting: false, pendingChallengeToken: null });
    }
  },

  clearError: () => set({ error: null }),
}));

/** Derived selector — prefer this over reading `currentUser` directly for gating navigation. */
export const useIsAuthenticated = (): boolean => useAuthStore((state) => state.currentUser !== null);
