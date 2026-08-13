# API + Admin Console Full Parity — working plan

> Status tracker for an in-progress effort. Update the checkboxes as phases complete so work can
> resume across sessions. Full phase detail below the checklist.

## Status

- [x] Phase 1 — Registry signup-field parity
- [x] Phase 2 — Re-sync 6 stale example apps (+ fixed a pre-existing nestjs-drizzle schema/migration bug found along the way: `dob`/`gender`/`joinedDate` columns were declared in `schema.ts` but never migrated, in both variants — added `drizzle/000X_*.sql` via `drizzle-kit generate`)
- [x] Phase 3 — Design-token unification (all 4 apps now on radix-nova/oklch; admin-nextjs was already the reference)
  - admin-nextjs-workspaces: minimal diff (only `dialog.tsx` actually changed), fixed a pre-existing broken `roles/page.tsx` (missing imports, unrelated to tokens)
  - admin-react-workspaces: converted 8 Dialog call sites to the new Radix-based composition, added deps the fuller ui/ tree pulls in
  - admin-react: reused its existing `Modal` wrapper for old Dialog call sites instead of rewriting composition, added deps, fixed a pre-existing unrelated bug in `EditUserPage.tsx`
  - All 3 builds independently re-verified clean by the orchestrating session, not just self-reported by the agents
- [x] Phase 4 — Session-verification parity. Added `AuthStore.verifySession()` (admin-nextjs-workspaces, admin-react, admin-react-workspaces) — calls `authClient.me()`, which already retries once via token refresh internally on a bare 401, so an `AuthApiError` reaching the guard means that recovery path is exhausted; a network/parse error is treated as "still fine" (backend unreachable, not session-invalid), matching `proxy.ts`'s own philosophy. Wired into each app's route guard on every navigation (`(console)/layout.tsx` pathname-effect for the Next app; `RequireAuth.tsx` location.pathname-effect for both React apps, with a stale-response guard so a slow check can't navigate the user away from a page they've already left). All 3 builds verified clean. Not click-through tested — no browser tooling available this session.
- [x] Phase 5 — Feature-domain porting (5a countries/customers/languages, 5b Users-page gaps, 5c live audit feed; 5d deprioritized)
  - 5a: ported into admin-react, admin-react-workspaces, admin-nextjs-workspaces. The open blocking
    question was resolved by building the backend module rather than skipping: countries/customers/
    languages didn't exist in any combo's `workspaces` variant, only `nestjs-prisma/variants/base`.
    Added a workspace-scoped module (3 repositories threaded with `workspaceId`, migration with
    composite unique constraints, `admin.controller.ts` routes reading `req.authz!.workspaceId`, 9
    RBAC slugs) to `registry/combos/nestjs-prisma/variants/workspaces`, mirroring the existing
    `WorkspaceRepository`/`WorkspaceController` pattern, then re-synced `examples/nestjs-prisma-app-workspaces`.
    `nestjs-drizzle`/`express-prisma`/`express-drizzle` still don't have this feature in any variant —
    out of scope, never had it to begin with.
  - 5b: Breadcrumb, RoleMultiSelect filter, and inline delete (with self-delete guard) wired onto the
    Users list page in all 3 target apps — components already existed, this was wiring-only.
  - 5c: live audit feed (`use-live-audit-feed.ts` + socket.io-client + Live/Connecting/Offline card)
    ported into all 3 target apps' dashboards.
  - All 3 apps typecheck clean; `madge --circular` confirms zero circular dependencies across all 3
    apps, `packages/auth-client`, and every backend combo (the only hits madge flags anywhere are
    pre-existing, type-only `import type` cross-references in `authz.guard.ts`/`rbac.repository.ts`
    and `auth.config.ts`/`permission-cache.ts`, byte-identical to the commit before this session —
    not real runtime cycles).
  - Incidentally fixed: `@nestjs/throttler` was missing from `cli/registry.json`'s `nestjs-prisma`
    peerDependencies and from `examples/nestjs-prisma-app-workspaces/package.json`, even though
    `shared/src/auth.controller.ts` (used by both variants) imports from it — base's example had it
    hand-patched, workspaces' didn't. Fixed in both places.
  - Not click-through tested in a browser — no browser tooling available this session, same
    limitation noted for Phase 4.

## Context

`nestjs-prisma` is documented as the reference backend combo the other 3 combos (`nestjs-drizzle`, `express-prisma`, `express-drizzle`) should mirror; `admin-nextjs` is documented (`docs/admin-console.md`) as the reference admin console the other 3 admin apps (`admin-react`, `admin-nextjs-workspaces`, `admin-react-workspaces`) should be ported from. Live-testing surfaced a login-field mismatch (`identifier` vs `email`) across backends and a UI/feature gap across admin apps. Investigation found the real shape of both gaps:
- **API**: fix a real registry-level signup-field gap, and re-sync 6 example apps that drifted from the registry after it was updated.
- **UI**: full feature parity — design tokens, real session-verification, and the nextjs-only feature domains (countries/customers/languages, Users-page extras, live audit feed) — ported into the other 3 admin apps.

This is a large, multi-phase effort. Phases 1-2 (API) are independent of phases 3-5 (UI) and can run in either order; within each group, order matters (tokens/guard before new pages are built on them).

## Phase 1 — Registry signup-field parity

Bring `nestjs-drizzle`, `express-prisma`, `express-drizzle` signup up to `nestjs-prisma`'s shape (optional `firstName`, `lastName`, `displayName`, `phone`, `username`). DB columns already exist in all 4 combos — pure wiring, no migration.

Per combo, 4 files (not 2 — `auth.service.ts` lives per-variant, not in `shared/`):
1. `shared/src/dto/auth.dto.ts` — extend `SignupDto`, copy field defs from `registry/combos/nestjs-prisma/shared/src/dto/auth.dto.ts:14-27`.
2. `shared/src/auth.controller.ts` (nestjs-drizzle) / `shared/src/auth.router.ts` (express-*) — wire the 5 fields into the signup handler via the existing `optionalString`/similar helper, mirroring `registry/combos/nestjs-prisma/shared/src/auth.controller.ts:56-67`.
3. `variants/base/src/auth.service.ts` **and** `variants/workspaces/src/auth.service.ts` — extend `signup()`'s input type and the `prisma.user.create()` / `db.insert(users).values()` call. Copy pattern from `registry/combos/nestjs-prisma/variants/{base,workspaces}/src/auth.service.ts:87-112`.
4. Express combos only: `shared/src/openapi-spec.ts` — add the 5 fields to `SignupRequest`, copying the block from that combo's own `CreateUserRequest` schema in `variants/{base,workspaces}/src/openapi-admin.ts`.

14 files total (3 combos × 4, + 2 openapi-spec.ts). Verify against each combo's `registry/combos/<combo>/test/` signup tests before moving on — mirror the reference combo's signup test coverage into the other 3 if it doesn't already exist.

## Phase 2 — Re-sync 6 stale example apps

Registry is already correct on `identifier`; only 6 of 8 examples never got re-synced after it changed. Confirmed command: `cd cli && npx tsx easy-auth.ts add <combo> [--workspaces] --into ../examples/<app> --force`.

For each of `nestjs-drizzle-app[-workspaces]`, `express-prisma-app[-workspaces]`, `express-drizzle-app[-workspaces]`:
1. `diff -rq registry/combos/<combo>/{shared,variants/<variant>}/src examples/<app>/src/lib/auth/src` first — confirm no example-specific hand-edits before forcing.
2. Run the re-sync command above.
3. Read the CLI's own `skipped`/`keptModified` output (`cli/easy-auth.ts:162-178`) — anything listed there is a real hand-edit the force-copy preserved; review those manually rather than assuming a clean sync.
4. Rebuild/typecheck each app — the copy only touches `src/lib/auth/`, so app entrypoints referencing old exports won't be caught by the copy step itself.

## Phase 3 — Design-token unification

`admin-nextjs`'s token system wins (it's the documented reference): shadcn `radix-nova`, oklch tokens, Tailwind v4 CSS-first (`@theme` in `globals.css`, no `tailwind.config.js`), `--radius: 0.625rem` with full `sm`–`4xl` scale, `tw-animate-css`. Ported into `admin-nextjs-workspaces`, `admin-react`, `admin-react-workspaces` (currently `new-york`/HSL/`tailwindcss-animate`/`--radius: 0.5rem`).

No shared UI package exists (`packages/` only has `auth-client`) — each app hand-copies its own `src/components/ui/*` tree, so this is a per-app migration, not a shared refactor.

Per target app:
1. Replace the CSS token file (`globals.css` / `index.css`) with `admin-nextjs`'s.
2. React apps: delete `tailwind.config.js`, drop `tailwindcss-animate`, add `tw-animate-css`.
3. Update `components.json` (`style: radix-nova`, `rsc` per framework, `config: ""`, `utils: "@/lib/utils"` — admin-react currently uses `@/lib/cn`, a rename that touches every importing file).
4. Regenerate/port the ~57 `src/components/ui/*` shadcn components to the `radix-nova` variants.
5. Rebuild and re-check every existing screen, not just new ones — this touches every page's styling.

**This is the single largest mechanical phase by file count** (3 apps × ~57 components + CSS/config rewrites + a repo-wide import rename in admin-react). Low judgment risk per edit, high volume.

## Phase 4 — Session-verification parity

Reference: `apps/admin-nextjs/src/proxy.ts` — NextAuth edge middleware, re-checks the access token against `GET /auth/me` on every protected navigation, only force-logs-out on 401-with-no-refresh-token or 403.

None of the other 3 apps can literally copy this (2 are Vite SPAs with no server; `admin-nextjs-workspaces` has no NextAuth at all, only a client-side MobX check on mount). Closest equivalent: call `GET /auth/me` (already exposed as `authClient.me()`) on every route change, not just on mount — same effective guarantee (revoked session caught at next navigation), different trust model (can't force a compromised client to run it, unlike edge middleware).

1. `admin-nextjs-workspaces`: `(console)/layout.tsx` currently trusts existing MobX store state. Add a `useEffect` keyed on `usePathname()` calling `authStore.refreshCurrentUser()`, redirect to `/login` on failure. This layout becomes the real security boundary for this app (no `proxy.ts` equivalent exists).
2. `admin-react` / `admin-react-workspaces`: `RequireAuth.tsx` (+ `RequireWorkspace` in the workspaces variant) currently only reads static store flags. Add the same re-verify-on-navigation pattern keyed on `useLocation().pathname`.
3. **Before writing any of this**, read `packages/auth-client/src/auth-client.ts` in full to confirm what `me()` throws on 401 vs 403 vs network error — the 3 guards need to branch on that the same way `proxy.ts` does (a bare 401 isn't itself a verdict; only 401-with-no-refresh or 403 should force logout), not simplify to "any error → logout" which would cause spurious logouts during legitimate token refresh.

Smallest file count of the UI phases (4-5 files) but the one most likely to introduce a subtle security regression if the 401/403 branching is rushed.

## Phase 5 — Feature-domain porting

Depends on Phase 3 (tokens) and Phase 4 (guard) landing first, so new pages aren't migrated twice.

`packages/auth-client` already has the countries/languages/customers types wired — this phase is UI-only.

**5a. Countries + Customers + Languages CRUD** (3 apps × 3 domains × list/new/detail/edit = up to 36 files). Source: `apps/admin-nextjs/src/app/(console)/{countries,customers,languages}/**`. Port faithfully (same pattern as the existing near-identical Users-page ports between nextjs/react), translating only the routing idiom (Next folder routes → React Router `<Route>`, `[id]` → `:id`) and using Phase 4's guard.
- **Open question to resolve first**: confirm whether countries/customers/languages are workspace-scoped at the API level before porting into `admin-nextjs-workspaces` — check `registry/combos/*/variants/workspaces/src/*` for these modules. If they don't exist in the workspaces-variant backend, this sub-phase is blocked for that app until resolved (add the backend module, out of current scope, or skip and flag back).
- Sequence domain-by-domain, starting with customers (docs call it "the most complete template"), app-by-app — verify build + guard + tokens after each unit.

**5b. Users-page gaps** (into `admin-react`, `admin-nextjs-workspaces`, and `admin-react-workspaces` if it has the same gaps — verify first): port `RoleMultiSelect` filter, delete-user action (wired to `authClient.deleteUser`), and the `Breadcrumb` component (`apps/admin-nextjs/src/components/breadcrumb.tsx`, verbatim port) onto every page, not just Users.

**5c. Live audit feed** (all 3 apps): port `apps/admin-nextjs/src/hooks/use-live-audit-feed.ts` (socket.io-client) near-verbatim — framework-agnostic, no routing translation needed. Add `socket.io-client` to each target app's dependencies if absent. Wire the Live/Connecting/Offline card into each dashboard.

**5d. Change-password modal vs. route** — explicitly deprioritized per user framing; leave the 3 apps' modal pattern as-is.

**Largest phase overall** — most files, most judgment calls, one open blocking question on workspaces-variant backend support.

## Size ranking (largest → smallest)
1. Phase 5 (feature porting)
2. Phase 3 (design tokens)
3. Phase 1 (registry signup fix)
4. Phase 4 (session verification — small but security-sensitive)
5. Phase 2 (example re-sync)

## Verification
- Phase 1-2: re-run the curl signup/login smoke tests against all 8 backends with the new fields; run each combo's test harness.
- Phase 3: visual screenshot diff (playwright script, see below) of all 4 apps' login + dashboard pages before/after.
- Phase 4: manually revoke a session server-side (block/deactivate the test user via admin API) and confirm each of the 3 apps redirects to login on next navigation, not just next full page load.
- Phase 5: click through each newly-ported domain in each app; confirm nav gating matches permission slugs; confirm workspaces-variant apps behave correctly per however the open question above resolves.

## Critical files
- `registry/combos/nestjs-prisma/shared/src/dto/auth.dto.ts` — reference SignupDto shape
- `registry/combos/{nestjs-drizzle,express-prisma,express-drizzle}/variants/{base,workspaces}/src/auth.service.ts` — the real signup-persistence gap
- `registry/combos/{express-prisma,express-drizzle}/shared/src/openapi-spec.ts`
- `cli/easy-auth.ts`, `cli/lib/copy.ts` — re-sync command and force/prune/manifest semantics
- `apps/admin-nextjs/src/proxy.ts` — reference session-verification mechanism
- `docs/admin-console.md` — authoritative parity checklist, porting guidance
- `packages/auth-client/src/auth-client.ts` — read in full before Phase 4 (401/403/network-error semantics)

## Known pre-existing bug (unrelated to this effort, found during Phase 3 verification)

`apps/admin-nextjs-workspaces/src/app/(console)/roles/page.tsx` fails to build — references `PermissionSummary`, `PermissionGroupSelect`, `sameSlugs`, and `Dialog`/`DialogContent`/etc. without importing any of them. Confirmed via `git stash` that this predates Phase 3's changes and is unaffected by them. Not currently tracked elsewhere — needs a fix (likely trivial, just missing imports) independent of this parity effort.

## Session notes

- Playwright is available ad hoc via `npx playwright` even without a project dependency; the
  chromium binary was already cached locally. Screenshot script pattern used this session:
  `NODE_PATH="$(find ~/.npm/_npx -maxdepth 4 -iname playwright -type d | head -1)/.." node script.js`
  with a script that `require('playwright')`, launches chromium, and screenshots each app's
  `/login` (nextjs apps) or `/` (react apps, since they don't SSR-redirect).
- Docker Compose secrets were moved out of `docker-compose.yml` into a gitignored root `.env`
  (tracked `.env.example` template) earlier this session — see git history on `docker-compose.yml`
  if any of the 8 backends fail to boot with an `AUTH_JWT_SECRET`/`AUTH_SECRET` error again.
