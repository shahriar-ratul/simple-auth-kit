"use client";

import { makeAutoObservable, runInAction } from "mobx";
import type { CurrentUser, SessionSummary } from "@easy-auth/auth-client";
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
      // End the NextAuth session too — otherwise proxy.ts still sees a live session cookie and
      // only notices the missing tokens one navigation later.
      const { signOut } = await import("next-auth/react");
      await signOut({ redirect: false });
      runInAction(() => {
        this.currentUser = null;
      });
    }
  }

  async logoutAll(): Promise<void> {
    try {
      await authClient.logoutAll();
    } finally {
      const { signOut } = await import("next-auth/react");
      await signOut({ redirect: false });
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
