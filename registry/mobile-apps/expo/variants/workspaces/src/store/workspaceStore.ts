import { create } from "zustand";
import { AuthApiError, type WorkspaceSummary } from "@easy-auth/auth-client";
import { authClient } from "../api/authClient";
import { setActiveWorkspaceId, useActiveWorkspaceId } from "../workspace/activeWorkspace";

/**
 * The workspaces the signed-in user belongs to, and the operations that change which one is
 * active. The *id* of the active workspace lives one layer down in
 * `src/workspace/activeWorkspace.ts` so that `authClient` can read it without importing this
 * store (which imports `authClient`).
 *
 * Deliberately does not touch `authStore`: selecting a workspace changes the roles and
 * permissions `/auth/me` answers with, and the screen that selects is the one that re-fetches
 * them. That keeps the two stores acyclic and the refresh visible at the call site.
 */
interface WorkspaceState {
  workspaces: WorkspaceSummary[];
  /** True while the list is being (re)fetched. */
  isLoading: boolean;
  /** True while creating a workspace. */
  isSubmitting: boolean;
  error: string | null;

  /** Fetches `GET /workspaces` — not workspace-scoped, so it works before any workspace is chosen. */
  load: () => Promise<WorkspaceSummary[]>;
  /** Makes `workspaceId` the workspace every scoped call acts in, and persists that choice. */
  select: (workspaceId: string) => Promise<void>;
  /** Creates a workspace (the creator becomes its admin) and makes it active. */
  create: (name: string) => Promise<WorkspaceSummary>;
  /** Wipes list and active workspace — used on logout so the next user starts clean. */
  reset: () => Promise<void>;
  clearError: () => void;
}

function messageFor(err: unknown): string {
  if (err instanceof AuthApiError) return err.message;
  if (err instanceof Error) return err.message;
  return "Something went wrong. Please try again.";
}

export const useWorkspaceStore = create<WorkspaceState>((set) => ({
  workspaces: [],
  isLoading: false,
  isSubmitting: false,
  error: null,

  load: async () => {
    set({ isLoading: true, error: null });
    try {
      const workspaces = await authClient.listWorkspaces();
      set({ workspaces, isLoading: false });
      return workspaces;
    } catch (err) {
      set({ isLoading: false, error: messageFor(err) });
      throw err;
    }
  },

  select: async (workspaceId) => {
    await setActiveWorkspaceId(workspaceId);
    set({ error: null });
  },

  create: async (name) => {
    set({ isSubmitting: true, error: null });
    try {
      const workspace = await authClient.createWorkspace(name);
      await setActiveWorkspaceId(workspace.id);
      set((state) => ({ workspaces: [...state.workspaces, workspace], isSubmitting: false }));
      return workspace;
    } catch (err) {
      set({ isSubmitting: false, error: messageFor(err) });
      throw err;
    }
  },

  reset: async () => {
    await setActiveWorkspaceId(null);
    set({ workspaces: [], isLoading: false, isSubmitting: false, error: null });
  },

  clearError: () => set({ error: null }),
}));

/** The active workspace as a full summary, or `null` while none is chosen (or not yet listed). */
export const useActiveWorkspace = (): WorkspaceSummary | null => {
  const activeWorkspaceId = useActiveWorkspaceId();
  const workspaces = useWorkspaceStore((state) => state.workspaces);
  return workspaces.find((workspace) => workspace.id === activeWorkspaceId) ?? null;
};
