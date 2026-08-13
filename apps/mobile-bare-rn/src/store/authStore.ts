import { create } from 'zustand';
import {
  AuthApiError,
  type AuthTokens,
  type CurrentUser,
  type TwoFactorChallenge,
} from '@easy-auth/auth-client';
import { authClient } from '../api/authClient';

export interface Credentials {
  email: string;
  password: string;
}

export interface LoginCredentials {
  identifier: string;
  password: string;
}

interface AuthState {
  /** null until `hydrate()` has checked storage for an existing session at least once. */
  isHydrated: boolean;
  /** True while a login/signup/2fa/logout request is in flight. */
  isLoading: boolean;
  /** Message from the most recently failed action, cleared on the next attempt. */
  error: string | null;
  currentUser: CurrentUser | null;

  /** Call once on app start: checks for a persisted session and loads `me()` if one exists. */
  hydrate: () => Promise<void>;
  signup: (input: Credentials) => Promise<AuthTokens>;
  login: (input: LoginCredentials) => Promise<AuthTokens | TwoFactorChallenge>;
  loginTwoFactor: (input: { challengeToken: string; code: string }) => Promise<AuthTokens>;
  logout: () => Promise<void>;
  logoutAll: () => Promise<void>;
  refreshCurrentUser: () => Promise<void>;
}

function messageFor(err: unknown): string {
  if (err instanceof AuthApiError) return err.message;
  if (err instanceof Error) return err.message;
  return 'Something went wrong. Please try again.';
}

export const useAuthStore = create<AuthState>((set) => ({
  isHydrated: false,
  isLoading: false,
  error: null,
  currentUser: null,

  hydrate: async () => {
    try {
      if (await authClient.isAuthenticated()) {
        const currentUser = await authClient.me();
        set({ currentUser });
      }
    } catch {
      // Stored tokens exist but are no longer valid (refresh failed, server reset, etc).
      // authClient already clears storage on that path — just stay logged out.
      set({ currentUser: null });
    } finally {
      set({ isHydrated: true });
    }
  },

  signup: async (input) => {
    set({ isLoading: true, error: null });
    try {
      const tokens = await authClient.signup(input);
      const currentUser = await authClient.me();
      set({ currentUser });
      return tokens;
    } catch (err) {
      set({ error: messageFor(err) });
      throw err;
    } finally {
      set({ isLoading: false });
    }
  },

  login: async (input) => {
    set({ isLoading: true, error: null });
    try {
      const result = await authClient.login(input);
      if ('twoFactorRequired' in result) return result;
      const currentUser = await authClient.me();
      set({ currentUser });
      return result;
    } catch (err) {
      set({ error: messageFor(err) });
      throw err;
    } finally {
      set({ isLoading: false });
    }
  },

  loginTwoFactor: async (input) => {
    set({ isLoading: true, error: null });
    try {
      const tokens = await authClient.loginTwoFactor(input);
      const currentUser = await authClient.me();
      set({ currentUser });
      return tokens;
    } catch (err) {
      set({ error: messageFor(err) });
      throw err;
    } finally {
      set({ isLoading: false });
    }
  },

  logout: async () => {
    set({ isLoading: true, error: null });
    try {
      await authClient.logout();
    } catch (err) {
      // Even if the network call fails, storage is only cleared by authClient on success —
      // surface the error but don't strand the user on a broken session screen.
      set({ error: messageFor(err) });
    } finally {
      set({ currentUser: null, isLoading: false });
    }
  },

  logoutAll: async () => {
    set({ isLoading: true, error: null });
    try {
      await authClient.logoutAll();
    } catch (err) {
      set({ error: messageFor(err) });
    } finally {
      set({ currentUser: null, isLoading: false });
    }
  },

  refreshCurrentUser: async () => {
    const currentUser = await authClient.me();
    set({ currentUser });
  },
}));

/** Derived convenience selector, mirroring the admin apps' MobX `isAuthenticated` getter. */
export const selectIsAuthenticated = (state: AuthState): boolean => state.currentUser !== null;
