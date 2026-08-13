"use client";

import { makeAutoObservable, runInAction } from "mobx";
import type { WorkspaceSummary } from "@easy-auth/auth-client";
import { getActiveWorkspaceId, setActiveWorkspaceId } from "../active-workspace";
import { authClient } from "../auth-client";
import { AuthStore } from "./auth-store";

/**
 * The workspaces this user belongs to, and which one the console is currently acting in.
 *
 * Roles and permissions live on a *membership*, not on the user, so they are different in every
 * workspace — which is why every switch re-reads `/auth/me`. Without that the console would keep
 * showing the controls you had in the workspace you just left, and the server would answer 403.
 */
export class WorkspaceStore {
  workspaces: WorkspaceSummary[] = [];
  activeWorkspaceId: string | null = null;
  status: "idle" | "loading" | "ready" = "idle";

  constructor(private readonly auth: AuthStore) {
    makeAutoObservable(this, {}, { autoBind: true });
    this.activeWorkspaceId = getActiveWorkspaceId();
  }

  get activeWorkspace(): WorkspaceSummary | null {
    return this.workspaces.find((workspace) => workspace.id === this.activeWorkspaceId) ?? null;
  }

  /** True once we know the answer and it is "none" — the empty state, not a still-loading one. */
  get hasNoWorkspaces(): boolean {
    return this.status === "ready" && this.workspaces.length === 0;
  }

  /** Runs after sign-in: lists the user's workspaces and settles on one to act in. */
  async load(): Promise<void> {
    this.status = "loading";
    try {
      const workspaces = await authClient.listWorkspaces();
      const stillAMember = workspaces.some((workspace) => workspace.id === this.activeWorkspaceId);
      // Falling back to the first one keeps a stale cookie (a workspace you were removed from,
      // or one from another account on this browser) from scoping every call to a 403.
      const nextActive = stillAMember ? this.activeWorkspaceId : (workspaces[0]?.id ?? null);
      setActiveWorkspaceId(nextActive);
      runInAction(() => {
        this.workspaces = workspaces;
        this.activeWorkspaceId = nextActive;
        this.status = "ready";
      });
      if (nextActive !== null) await this.auth.refreshCurrentUser();
    } catch (err) {
      runInAction(() => {
        this.status = "ready";
      });
      throw err;
    }
  }

  /** Switching workspace changes what you may do, so the identity is re-read before anything renders against it. */
  async setActive(workspaceId: string): Promise<void> {
    if (workspaceId === this.activeWorkspaceId) return;
    setActiveWorkspaceId(workspaceId);
    runInAction(() => {
      this.activeWorkspaceId = workspaceId;
    });
    await this.auth.refreshCurrentUser();
  }

  /** The creator is made an administrator of the new workspace by the backend, so we switch straight into it. */
  async create(name: string): Promise<WorkspaceSummary> {
    const workspace = await authClient.createWorkspace(name);
    runInAction(() => {
      this.workspaces = [...this.workspaces, workspace];
      this.activeWorkspaceId = workspace.id;
      this.status = "ready";
    });
    setActiveWorkspaceId(workspace.id);
    await this.auth.refreshCurrentUser();
    return workspace;
  }

  /** On sign-out: the next person to use this browser must not inherit the last one's workspace. */
  reset(): void {
    setActiveWorkspaceId(null);
    this.workspaces = [];
    this.activeWorkspaceId = null;
    this.status = "idle";
  }
}
