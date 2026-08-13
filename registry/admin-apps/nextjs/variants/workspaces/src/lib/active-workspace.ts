"use client";

import { deleteCookie, getCookie, setCookie } from "cookies-next/client";

/**
 * Where "which workspace am I in" actually lives.
 *
 * `AuthClient` deliberately does not own this: it takes a resolver function and calls it per
 * request, exactly as it takes a `TokenStorage` rather than deciding where tokens are kept. So
 * this module is the app's answer, and `WorkspaceStore` is the observable view of it — the store
 * writes here, and the client reads here, which is why switching workspaces takes effect on the
 * very next call without anything having to re-wire the client.
 *
 * A cookie rather than component state, so a reload lands you back in the workspace you were in.
 */
const COOKIE_NAME = "easy_auth_workspace";
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

/** Read once, then kept in memory: the resolver runs on every scoped request. */
let cached: string | null | undefined;

export function getActiveWorkspaceId(): string | null {
  // Client components are rendered on the server for the first paint, where there is no
  // document to read. No workspace then, which is correct — nothing fetches during that render.
  if (typeof document === "undefined") return null;
  if (cached === undefined) {
    const raw = getCookie(COOKIE_NAME);
    cached = typeof raw === "string" && raw.length > 0 ? raw : null;
  }
  return cached;
}

export function setActiveWorkspaceId(workspaceId: string | null): void {
  cached = workspaceId;
  if (typeof document === "undefined") return;
  if (workspaceId) setCookie(COOKIE_NAME, workspaceId, { maxAge: COOKIE_MAX_AGE_SECONDS, sameSite: "lax", path: "/" });
  else deleteCookie(COOKIE_NAME, { path: "/" });
}
