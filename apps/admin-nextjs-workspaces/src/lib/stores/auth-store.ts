"use client";

import { makeAutoObservable, runInAction } from "mobx";
import { AuthApiError, type CurrentUser, type SessionSummary } from "@easy-auth/auth-client";
import { authClient } from "../auth-client";

export type LoginOutcome = { status: "success" } | { status: "twoFactorRequired"; challengeToken: string };

export class AuthStore {
  currentUser: CurrentUser | null = null;
  status: "idle" | "initializing" | "ready" = "idle";

  constructor() {
    makeAutoObservable(this, {}, { autoBind: true });
  }

  get isAuthenticated(): boolean {
    return this.currentUser !== null;
  }

  /** Runs once on app mount: if a cached token pair exists, hydrate `currentUser` from it. */
  async initialize(): Promise<void> {
    if (this.status !== "idle") return;
    this.status = "initializing";
    const hasTokens = await authClient.isAuthenticated();
    if (!hasTokens) {
      runInAction(() => {
        this.status = "ready";
      });
      return;
    }
    try {
      const me = await authClient.me();
      runInAction(() => {
        this.currentUser = me;
        this.status = "ready";
      });
    } catch {
      runInAction(() => {
        this.currentUser = null;
        this.status = "ready";
      });
    }
  }

  /** Re-fetches `/auth/me` — used after anything that can change roles/permissions/2FA status. */
  async refreshCurrentUser(): Promise<void> {
    const me = await authClient.me();
    runInAction(() => {
      this.currentUser = me;
    });
  }

  /**
   * Re-verifies the session is still live server-side — `authClient.me()` already retries once
   * via a token refresh on a bare 401 internally, so an `AuthApiError` reaching here means that
   * recovery path is exhausted (a stale/revoked/blocked session), not a transient hiccup. A
   * network/parse error instead means the backend is unreachable, not that the session is
   * invalid — same distinction `proxy.ts` makes in the base admin-nextjs app — so it's treated as
   * "still fine" rather than forcing a logout.
   *
   * Returns false only when the session is confirmed dead, so callers know to redirect.
   */
  async verifySession(): Promise<boolean> {
    try {
      const me = await authClient.me();
      runInAction(() => {
        this.currentUser = me;
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
    await authClient.signup(input);
    await this.refreshCurrentUser();
  }

  async login(input: { identifier: string; password: string }): Promise<LoginOutcome> {
    const result = await authClient.login(input);
    if ("twoFactorRequired" in result) {
      return { status: "twoFactorRequired", challengeToken: result.challengeToken };
    }
    await this.refreshCurrentUser();
    return { status: "success" };
  }

  async loginTwoFactor(input: { challengeToken: string; code: string }): Promise<void> {
    await authClient.loginTwoFactor(input);
    await this.refreshCurrentUser();
  }

  async logout(): Promise<void> {
    try {
      await authClient.logout();
    } finally {
      runInAction(() => {
        this.currentUser = null;
      });
    }
  }

  async logoutAll(): Promise<void> {
    try {
      await authClient.logoutAll();
    } finally {
      runInAction(() => {
        this.currentUser = null;
      });
    }
  }

  async listSessions(): Promise<SessionSummary[]> {
    return authClient.sessions();
  }

  async enrollTwoFactor(): Promise<{ secret: string; provisioningUri: string }> {
    return authClient.enrollTwoFactor();
  }

  async confirmTwoFactor(code: string): Promise<{ backupCodes: string[] }> {
    const result = await authClient.confirmTwoFactor(code);
    await this.refreshCurrentUser(); // picks up the now-true `twoFactorEnabled` flag
    return result;
  }

  async disableTwoFactor(code: string): Promise<void> {
    await authClient.disableTwoFactor(code);
    await this.refreshCurrentUser(); // picks up the now-false `twoFactorEnabled` flag
  }
}
