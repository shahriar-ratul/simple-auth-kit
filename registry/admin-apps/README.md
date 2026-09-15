# `registry/admin-apps/` — admin console templates

Two products, each with the same `shared/` + `variants/{base,workspaces}` composition
`registry/README.md` describes for backend combos — same byte-identical-hoisting rule, same "a
file must not branch on which variant it's in" discipline — but a different `installMode`.

| Product | `kind` in `packages/cli/registry.json` | Extracted from |
|---|---|---|
| `admin-react` | `admin` | `apps/admin-react` + `apps/admin-react-workspaces` |
| `admin-nextjs` | `admin` | `apps/admin-nextjs` + `apps/admin-nextjs-workspaces` |

## `installMode: "scaffold"`, not `"merge"`

Backend combos merge a source fragment into an *existing* project's `src/lib/auth`. An admin
console isn't a fragment — it's a whole standalone app. `simple-auth-kit add admin-react --into <dir>`
writes `shared/` then `variants/<variant>/` **directly into `<dir>`**: `package.json`, `src/App.tsx`,
everything. `packages/cli/lib/copy.ts`'s `SCAFFOLD_NEVER_COPY` (vs. the api-combo `NEVER_COPY`) reflects
this: `package.json`/`tsconfig.json` are real, consumer-facing content here, not the registry's own
dev wiring.

`package.json`'s `name`/`description` are templated from `--name` (falling back to the target
directory's basename) after the copy — see `installScaffold` in `packages/cli/simple-auth-kit.ts`.
Without an explicit `--into`, `scaffoldInstallRoot` in that same file nests the install one level
below cwd (a new `./admin-react/`-style folder, not the bare current directory) — `--into` is only
trusted as the literal destination when the caller actually passes it.

## `admin-react`: the clean case

The two source apps decompose almost entirely into shared+variant deltas: ~75% of files are
byte-identical, the rest (App.tsx, ability.ts, auth-client.ts, the stores, and the
countries/customers/languages/users pages) carry small, mechanical workspace-scoping diffs —
`observer()` wrapping, `activeWorkspaceId` folded into query keys, an `X-Workspace-Id`-aware
`authClient` resolver. `workspace-switcher.tsx`, `CreateWorkspaceDialog.tsx`, `workspace-store.ts`,
and `MembersPage.tsx` are workspaces-only additions; `AddRolePage.tsx`/`EditRolePage.tsx`/
`EditUserPage.tsx` are base-only (workspaces folds editing into dialogs instead of separate
routes). Dependencies are otherwise identical between the two source apps' `package.json`.

## `admin-nextjs`: a deliberate trust-model split, not an oversight

This one doesn't decompose as cleanly, and that's kept rather than forced. Only about half the
shared-path pages are safely shareable; the rest (roles, permissions, users, dashboard, audit-log,
account, login) are independently-implemented pages with real behavioral differences, not just
superficial variant deltas — written to both `variants/base` and `variants/workspaces` unmodified,
per the byte-identical-or-nothing rule.

The one worth calling out explicitly: **`base` and `workspaces` use different route-guarding trust
models**, and that's a deliberate, permanent difference, not something a future pass should
"fix" by unifying them:

- `variants/base` ships `src/proxy.ts` + `src/auth.ts` + `src/app/api/auth/[...nextauth]/route.ts`
  — NextAuth v5 edge middleware, re-checking the access token against `GET /auth/me` on every
  protected navigation, server-side, before the page ever renders.
- `variants/workspaces` has no NextAuth at all. It re-checks the session client-side
  (`AuthStore.verifySession()`, called on every route change) — a real but different guarantee:
  a revoked session is caught at the *next* navigation, same as `base`, but the check itself runs
  in the browser, not at the edge, since this variant never adopted NextAuth's server-side model.

Neither is a bug. `base`'s model is stronger (a compromised client can't be made to skip the
check); `workspaces`' is what was actually built and ships a real, tested guarantee of its own.
Don't try to backport NextAuth into `variants/workspaces` to "match" `base`, and don't strip it out
of `variants/base` to "simplify" — that would be changing the security model of a generated app as
a side effect of a registry refactor, which is exactly the kind of false unification the
byte-identical rule exists to prevent.

`variants/base` also ships 36 shadcn UI primitives `variants/workspaces` doesn't (a larger kit was
generated for it and never pruned) — harmless, just asymmetric file counts between the two
variants; not evidence of drift to reconcile.

## `@simple-auth-kit/auth-client`

Both products' `package.json` declare `"@simple-auth-kit/auth-client": "^1.0.2"`, resolved from
the published package on npm: https://www.npmjs.com/package/@simple-auth-kit/auth-client. A
`scaffold`-mode generated app stands alone with a plain `npm install` — no monorepo/pnpm
workspace required.
