"use client";

import { observer } from "mobx-react-lite";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuthStore, useWorkspaceStore } from "@/lib/stores/store-context";

/**
 * The console's front door. It sends you to the first screen you can actually open: creating a
 * workspace if you have none, then the dashboard otherwise — its cards are individually
 * permission-gated, so a low-privilege member sees fewer of them rather than hitting a wall.
 */
export default observer(function RootPage() {
  const store = useAuthStore();
  const workspaces = useWorkspaceStore();
  const router = useRouter();

  useEffect(() => {
    if (store.status !== "ready") return;
    if (!store.isAuthenticated) {
      router.replace("/login");
      return;
    }
    if (workspaces.status !== "ready") return;
    if (workspaces.hasNoWorkspaces) {
      router.replace("/workspaces/new");
      return;
    }
    router.replace("/dashboard");
  }, [store.status, store.isAuthenticated, workspaces.status, workspaces.hasNoWorkspaces, router]);

  return <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">Loading…</div>;
});
