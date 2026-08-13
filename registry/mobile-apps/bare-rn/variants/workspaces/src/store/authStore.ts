import { create } from 'zustand';
import {
  AuthApiError,
  type AuthTokens,
  type CurrentUser,
  type TwoFactorChallenge,
} from '@easy-auth/auth-client';
import { authClient } from '../api/authClient';
import { useWorkspaceStore } from './workspaceStore';
import { getActiveWorkspaceId, hydrateActiveWorkspace, setActiveWorkspaceId } from '../workspace/activeWorkspace';

/**
 * Everything that follows a successful authentication, in the order the workspaces variant
 * requires it:
 *
 *  1. list the workspaces this user belongs to — `GET /workspaces` is not workspace-scoped, so
 *     it is the one call that works before any workspace is chosen;
 *  2. drop a persisted active workspace the user is no longer a member of. Without this,
 *     `GET /auth/me` would carry a stale `X-Workspace-Id` and the backend would answer 403
 *     (deliberately indistinguishable from "no such workspace"), which hydrate would read as a
 *     dead session and sign a perfectly good user out;
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
      // Before any scoped request, so the first `me()` already names the right workspace.
      await hydrateActiveWorkspace();
      if (await authClient.isAuthenticated()) {
        const currentUser = await loadIdentityForActiveWorkspace();
        set({ currentUser });
      } else {
        await useWorkspaceStore.getState().reset();
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
      // A brand-new user belongs to no workspace yet — the picker offers creating the first one.
      const currentUser = await loadIdentityForActiveWorkspace();
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
      const currentUser = await loadIdentityForActiveWorkspace();
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
      const currentUser = await loadIdentityForActiveWorkspace();
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
      await useWorkspaceStore.getState().reset();
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
      await useWorkspaceStore.getState().reset();
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
