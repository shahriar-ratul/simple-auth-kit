import { useEffect, useRef, useState } from "react";
import { observer } from "mobx-react-lite";
import { Link, Navigate, Outlet, useLocation, useNavigate } from "react-router-dom";
import { canAny, useAbility } from "@/lib/ability";
import { useAuthStore, useWorkspaceStore } from "@/stores/store-context";
import { Button } from "@/components/ui/button";
import { CreateWorkspaceDialog } from "./CreateWorkspaceDialog";

/** Route guard: redirects to /login (preserving the intended destination) when there's no session. */
export const RequireAuth = observer(function RequireAuth() {
  const store = useAuthStore();
  const location = useLocation();
  const navigate = useNavigate();

  // A Vite SPA has no server to run middleware on, so there's no equivalent to the base
  // admin-nextjs app's `proxy.ts`. Re-verify against the backend on every navigation instead of
  // only trusting in-memory state, so a logout-all/block/deactivate takes effect at the next
  // click rather than staying invisible until some unrelated API call happens to 401.
  const pathnameRef = useRef(location.pathname);
  pathnameRef.current = location.pathname;
  useEffect(() => {
    if (store.initializing || !store.isAuthenticated) return;
    const pathnameAtCheckStart = pathnameRef.current;
    void store.verifySession().then((stillValid) => {
      if (!stillValid && pathnameRef.current === pathnameAtCheckStart) {
        navigate("/login", { replace: true, state: { from: location } });
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  if (store.initializing) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">Loading…</div>
    );
  }

  if (!store.isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <Outlet />;
});

/**
 * Gate for the pages that act inside a workspace. A brand-new account belongs to none — there is
 * no implicit first workspace and no invitation flow in the library — so the honest empty state
 * is an offer to create one, not a console full of failed requests.
 */
export const RequireWorkspace = observer(function RequireWorkspace() {
  const workspaces = useWorkspaceStore();
  const [creating, setCreating] = useState(false);

  if (workspaces.loading || !workspaces.loaded) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  if (!workspaces.hasWorkspace) {
    return (
      <div className="rounded-lg border border-border bg-card p-6">
        <p className="text-sm font-medium">You're not in a workspace yet</p>
        <p className="mt-1 max-w-prose text-sm text-muted-foreground">
          Users, roles and the audit log all belong to a workspace. Create one to get started — you'll be its administrator — or ask an
          administrator of an existing workspace to add you by email.
        </p>
        <Button className="mt-4" onClick={() => setCreating(true)}>
          Create workspace
        </Button>
        <CreateWorkspaceDialog open={creating} onClose={() => setCreating(false)} />
      </div>
    );
  }

  return <Outlet />;
});

/**
 * Gate for a page whose routes the backend requires a permission for. `anyOf` is satisfied by
 * holding any one of the listed permissions, which is how a page made of several independently
 * gated cards (Roles & permissions) opens for someone who can use only part of it.
 *
 * The backend's `PermissionGuard` is the real boundary — this exists so a page that would answer
 * 403 isn't offered in the first place, and it reads the same permission keys the guard does.
 * Permissions are per workspace, so this answers differently after a switch.
 */
export const RequirePermission = observer(function RequirePermission({ anyOf }: { anyOf: readonly string[] }) {
  const ability = useAbility();
  const workspaces = useWorkspaceStore();

  if (!canAny(ability, anyOf)) {
    return (
      <div className="rounded-lg border border-border bg-card p-6">
        <p className="text-sm font-medium">You don't have access to this page</p>
        <p className="mt-1 text-sm text-muted-foreground">
          It needs the {anyOf.map((permission) => `"${permission}"`).join(" or ")} permission in{" "}
          {workspaces.activeWorkspace ? `"${workspaces.activeWorkspace.name}"` : "this workspace"}. Ask an administrator of that workspace to grant
          it, or switch to a workspace where you have it.
        </p>
        <Link to="/account" className="mt-4 inline-block text-sm font-medium underline underline-offset-4">
          Go to my account
        </Link>
      </div>
    );
  }

  return <Outlet />;
});
