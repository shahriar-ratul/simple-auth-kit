import { makeAutoObservable, runInAction } from "mobx";
import type { AuthClient, CurrentUser, SessionSummary, TwoFactorChallenge } from "@easy-auth/auth-client";
import { AuthApiError } from "@easy-auth/auth-client";

/**
 * Session lifecycle hooks. On this variant a session is not complete until the workspace list
 * has loaded and an active workspace is settled — `/auth/me` answers with the roles and
 * permissions of *one workspace*, so asking it before then would report an empty set and hide
 * the whole console. Injecting the step rather than importing the workspace store keeps this
 * file unaware of workspaces; `store-context.tsx` is where the two are joined.
 */
export interface SessionHooks {
  /** Runs after tokens exist and before `/auth/me` — the workspace store loads here. */
  onSessionEstablished?: () => Promise<void>;
  /** Runs after the session ends, whether by logging out or by a refresh that failed. */
  onSessionEnded?: () => void;
}

/**
 * Wraps the shared, framework-agnostic AuthClient with MobX-observable session state.
 * Every screen that needs to know "who is logged in" (route guard, nav, My account) reads
 * `currentUser`/`isAuthenticated` off this store instead of re-fetching `me()` itself.
 */
export class AuthStore {
  currentUser: CurrentUser | null = null;
  /** True while the store is restoring a session from stored tokens on app boot. */
  initializing = true;
  sessions: SessionSummary[] = [];

  // An ECMAScript-private field (not a TS `private` parameter property) so it falls outside
  // `keyof this` entirely — makeAutoObservable's proxy-based auto-inference already skips it,
  // with no annotation-map override needed.
  #client: AuthClient;
  #hooks: SessionHooks;

  constructor(client: AuthClient, hooks: SessionHooks = {}) {
    this.#client = client;
    this.#hooks = hooks;
    makeAutoObservable(this, {}, { autoBind: true });
  }

  get isAuthenticated(): boolean {
    return this.currentUser !== null;
  }

  /** Called once on app boot: if a token is already stored, restore the session; otherwise land on /login. */
  async initialize(): Promise<void> {
    try {
      const isAuthenticated = await this.#client.isAuthenticated();
      if (isAuthenticated) await this.establishSession();
    } catch {
      runInAction(() => {
        this.currentUser = null;
      });
      this.#hooks.onSessionEnded?.();
    } finally {
      runInAction(() => {
        this.initializing = false;
      });
    }
  }

  /** Loads the active workspace first, then the identity that workspace gives the caller. */
  private async establishSession(): Promise<void> {
    await this.#hooks.onSessionEstablished?.();
    await this.refreshCurrentUser();
  }

  async refreshCurrentUser(): Promise<void> {
    const user = await this.#client.me();
    runInAction(() => {
      this.currentUser = user;
    });
  }

  /**
   * Re-verifies the session is still live server-side — `AuthClient.me()` already retries once
   * via a token refresh on a bare 401 internally, so an `AuthApiError` reaching here means that
   * recovery path is exhausted (a stale/revoked/blocked session), not a transient hiccup. A
   * network/parse error instead means the backend is unreachable, not that the session is
   * invalid — same distinction the base admin-nextjs app's `proxy.ts` makes — so it's treated as
   * "still fine" rather than forcing a logout.
   *
   * Returns false only when the session is confirmed dead, so callers know to redirect.
   */
  async verifySession(): Promise<boolean> {
    try {
      const user = await this.#client.me();
      runInAction(() => {
        this.currentUser = user;
      });
      return true;
    } catch (err) {
      if (err instanceof AuthApiError) {
        runInAction(() => {
          this.currentUser = null;
        });
        return false;
      }
      return true;
    }
  }

  async signup(input: { email: string; password: string }): Promise<void> {
    await this.#client.signup(input);
    await this.establishSession();
  }

  /** Returns `{ twoFactorRequired: true, challengeToken }` when the account has 2FA enabled — caller shows the code-entry step. */
  async login(input: { identifier: string; password: string }): Promise<TwoFactorChallenge | null> {
    const result = await this.#client.login(input);
    if ("twoFactorRequired" in result) return result;
    await this.establishSession();
    return null;
  }

  async loginTwoFactor(input: { challengeToken: string; code: string }): Promise<void> {
    await this.#client.loginTwoFactor(input);
    await this.establishSession();
  }

  async logout(): Promise<void> {
    try {
      await this.#client.logout();
    } finally {
      runInAction(() => {
        this.currentUser = null;
        this.sessions = [];
      });
      this.#hooks.onSessionEnded?.();
    }
  }

  async logoutAll(): Promise<void> {
    try {
      await this.#client.logoutAll();
    } finally {
      runInAction(() => {
        this.currentUser = null;
        this.sessions = [];
      });
      this.#hooks.onSessionEnded?.();
    }
  }

  async loadSessions(): Promise<void> {
    const sessions = await this.#client.sessions();
    runInAction(() => {
      this.sessions = sessions;
    });
  }

  async enrollTwoFactor(): Promise<{ secret: string; provisioningUri: string }> {
    return this.#client.enrollTwoFactor();
  }

  async confirmTwoFactor(code: string): Promise<{ backupCodes: string[] }> {
    const result = await this.#client.confirmTwoFactor(code);
    await this.refreshCurrentUser();
    return result;
  }

  async disableTwoFactor(code: string): Promise<void> {
    await this.#client.disableTwoFactor(code);
    await this.refreshCurrentUser();
  }
}

export { AuthApiError };
