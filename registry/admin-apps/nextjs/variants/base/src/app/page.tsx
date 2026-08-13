"use client";

import { observer } from "mobx-react-lite";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuthStore } from "@/lib/stores/store-context";

/**
 * The console's front door. Dashboard is always a safe landing spot — its cards are individually
 * permission-gated, so a low-privilege user sees fewer of them rather than hitting a wall.
 */
export default observer(function RootPage() {
  const store = useAuthStore();
  const router = useRouter();

  useEffect(() => {
    if (store.status !== "ready") return;
    router.replace(store.isAuthenticated ? "/dashboard" : "/login");
  }, [store.status, store.isAuthenticated, router]);

  return <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">Loading…</div>;
});
