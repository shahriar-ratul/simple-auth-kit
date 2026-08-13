"use client";

import { observer } from "mobx-react-lite";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { AppSidebar } from "@/components/app-sidebar";
import { ThemeToggle } from "@/components/theme-toggle";
import { UserMenu } from "@/components/user-menu";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { WorkspaceSwitcher } from "@/components/workspace-switcher";
import { useAuthStore, useWorkspaceStore } from "@/lib/stores/store-context";

/** The one console screen that works without a workspace — it is how you get your first one. */
const CREATE_WORKSPACE_PATH = "/workspaces/new";

/**
 * Route-group guard: every screen under `(console)` requires an authenticated session, and every
 * screen but "My account" and "New workspace" also requires a workspace to act in. Redirects to
 * `/login` once we've finished the one-time `initialize()` check and there's still no user.
 */
export default observer(function ConsoleLayout({ children }: { children: ReactNode }) {
  const store = useAuthStore();
  const workspaces = useWorkspaceStore();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (store.status === "ready" && !store.isAuthenticated) {
      router.replace("/login");
    }
  }, [store.status, store.isAuthenticated, router]);

  // This app has no server-side middleware equivalent to the base admin-nextjs app's `proxy.ts`
  // (no NextAuth here), so this layout is the only thing standing between a revoked/blocked
  // session and every screen under (console) — re-verify on every navigation, not just on mount,
  // so a logout-all/block/deactivate takes effect at the next click rather than at next page load.
  useEffect(() => {
    if (store.status !== "ready" || !store.isAuthenticated) return;
    void store.verifySession().then((stillValid) => {
      if (!stillValid) router.replace("/login");
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  if (store.status !== "ready" || !store.isAuthenticated || workspaces.status !== "ready") {
    return <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">Loading…</div>;
  }

  // A first-time user has an account but no workspace. That is an ordinary starting point, not a
  // broken console — so the shell stays, and the page invites them to make one.
  const showEmptyState = workspaces.hasNoWorkspaces && pathname !== CREATE_WORKSPACE_PATH && pathname !== "/account";

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <header className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-border px-4">
          <div className="flex items-center gap-2">
            <SidebarTrigger />
            <Separator orientation="vertical" className="mr-2 h-4" />
            <span className="text-sm font-medium text-muted-foreground">easy-auth admin</span>
          </div>
          <div className="flex items-center gap-2">
            <WorkspaceSwitcher />
            <ThemeToggle />
            <UserMenu />
          </div>
        </header>
        <main className="flex-1 px-4 py-6 md:px-6">
          {showEmptyState ? (
            <Card className="mx-auto max-w-lg">
              <CardHeader>
                <CardTitle>Create your first workspace</CardTitle>
                <CardDescription>
                  Users, roles and the audit log all belong to a workspace, so there&apos;s nothing to show until you have one. Create a
                  workspace and you&apos;ll be its administrator straight away.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button asChild>
                  <Link href={CREATE_WORKSPACE_PATH}>Create a workspace</Link>
                </Button>
              </CardContent>
            </Card>
          ) : (
            children
          )}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
});
