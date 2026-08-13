import { create } from "zustand";
import { AuthApiError, type CurrentUser } from "@easy-auth/auth-client";
import { authClient } from "../api/authClient";

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

  /** Call once on app start: if tokens are already stored, hydrate `currentUser` from `me()`. */
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
      const hasTokens = await authClient.isAuthenticated();
      if (!hasTokens) {
        set({ currentUser: null, isBootstrapping: false });
        return;
      }
      const currentUser = await authClient.me();
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
      const currentUser = await authClient.me();
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
      const currentUser = await authClient.me();
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
      const currentUser = await authClient.me();
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
      set({ currentUser: null, isSubmitting: false, pendingChallengeToken: null });
    }
  },

  clearError: () => set({ error: null }),
}));

/** Derived selector — prefer this over reading `currentUser` directly for gating navigation. */
export const useIsAuthenticated = (): boolean => useAuthStore((state) => state.currentUser !== null);
