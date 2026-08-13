import { makeAutoObservable, runInAction } from "mobx";
import type { AuthClient, WorkspaceSummary } from "@easy-auth/auth-client";

const ACTIVE_WORKSPACE_KEY = "easy-auth-active-workspace";

/**
 * Owns "which workspace am I in". `AuthClient` is configured with a resolver pointing at
 * `activeWorkspaceId` (see `src/lib/auth-client.ts`), so this store is the single source of the
 * `X-Workspace-Id` header on every scoped call — nothing else passes a workspace per call.
 *
 * The active workspace also decides what the caller may do: roles and permissions are per
 * membership, so `/auth/me` answers differently in each workspace. Switching therefore has to
 * re-read the session, which is what `bindOnActiveChanged` is for — the app wires it to
 * `AuthStore.refreshCurrentUser` once, rather than every switch site remembering to.
 */
export class WorkspaceStore {
  workspaces: WorkspaceSummary[] = [];
  activeWorkspaceId: string | null = null;
  /** True while the workspace list is being (re)loaded — distinct from "loaded and empty". */
  loading = false;
  loaded = false;

  #client: AuthClient;
  #onActiveChanged: () => Promise<void> = async () => {};

  constructor(client: AuthClient) {
    this.#client = client;
    this.activeWorkspaceId = readStoredWorkspaceId();
    makeAutoObservable(this, {}, { autoBind: true });
  }

  bindOnActiveChanged(handler: () => Promise<void>): void {
    this.#onActiveChanged = handler;
  }

  get activeWorkspace(): WorkspaceSummary | null {
    return this.workspaces.find((workspace) => workspace.id === this.activeWorkspaceId) ?? null;
  }

  get hasWorkspace(): boolean {
    return this.activeWorkspace !== null;
  }

  /**
   * Loads the caller's workspaces and settles the active one: the workspace they were last in if
   * they are still a member of it, otherwise their first. Called on every session start, so a
   * membership removed while they were away can't leave a dead id in the header.
   */
  async load(): Promise<void> {
    runInAction(() => {
      this.loading = true;
    });
    try {
      const workspaces = await this.#client.listWorkspaces();
      runInAction(() => {
        this.workspaces = workspaces;
        const stillAMember = workspaces.some((workspace) => workspace.id === this.activeWorkspaceId);
        this.activeWorkspaceId = stillAMember ? this.activeWorkspaceId : (workspaces[0]?.id ?? null);
        storeWorkspaceId(this.activeWorkspaceId);
      });
    } finally {
      runInAction(() => {
        this.loading = false;
        this.loaded = true;
      });
    }
  }

  /** Switches workspaces and re-reads the session, because permissions are per membership. */
  async setActive(workspaceId: string): Promise<void> {
    if (workspaceId === this.activeWorkspaceId) return;
    runInAction(() => {
      this.activeWorkspaceId = workspaceId;
      storeWorkspaceId(workspaceId);
    });
    await this.#onActiveChanged();
  }

  /** Creates a workspace and switches to it. The backend makes the creator its administrator in the same transaction. */
  async create(name: string): Promise<WorkspaceSummary> {
    const workspace = await this.#client.createWorkspace(name);
    runInAction(() => {
      this.workspaces = [...this.workspaces, workspace];
      this.activeWorkspaceId = workspace.id;
      storeWorkspaceId(workspace.id);
    });
    await this.#onActiveChanged();
    return workspace;
  }

  /** Re-reads the workspace list without changing which one is active (roles may have changed). */
  async reload(): Promise<void> {
    await this.load();
  }

  reset(): void {
    this.workspaces = [];
    this.activeWorkspaceId = null;
    this.loaded = false;
    storeWorkspaceId(null);
  }
}

function readStoredWorkspaceId(): string | null {
  try {
    return window.localStorage.getItem(ACTIVE_WORKSPACE_KEY);
  } catch {
    return null;
  }
}

function storeWorkspaceId(workspaceId: string | null): void {
  try {
    if (workspaceId === null) window.localStorage.removeItem(ACTIVE_WORKSPACE_KEY);
    else window.localStorage.setItem(ACTIVE_WORKSPACE_KEY, workspaceId);
  } catch {
    // A private-mode browser with storage disabled just loses the remembered workspace between
    // page loads; `load()` falls back to the first one.
  }
}
