# Admin console — `apps/admin-nextjs`

Next.js 16 (App Router) console for the base-variant backend. It is a deliberate replica of an
external reference admin panel (see `plan/brief.md` decisions 24–27) — pages, interaction
patterns, and auth library all match the reference; it diverges only where the library's own
settled decisions require it.

## Stack

Next.js 16 · React 19 · **NextAuth v5** (credentials) · shadcn/ui (57 components in
`src/components/ui/`) on Tailwind v4 · MobX (`src/lib/stores/`) + CASL (`src/lib/ability.ts`)
· react-hook-form + zod · TanStack Table · `@easy-auth/auth-client` as the **only** HTTP layer
(no axios) · socket.io-client for the live feed · Bricolage Grotesque via `next/font`.

## Auth flow — the part worth understanding first

Three cooperating pieces:

**1. `src/auth.ts` — NextAuth v5, Credentials provider.** `authorize()` calls the backend's
real login through `auth-client` (server-side instance using `src/lib/server-token-storage.ts`),
which writes the access/refresh token pair into the **same cookie the browser client uses**
(`easy_auth_tokens`, JSON pair). NextAuth's own session JWT rides on top carrying `expired_at`;
the `jwt` callback returns `null` past expiry, forcing sign-out. 2FA is preserved: a 2FA-enabled
account makes `authorize()` throw a `CredentialsSignin` whose `code` is
`2fa_required:<challengeToken>`; the login page catches that code and re-submits with
`{challengeToken, code}`.

So there are **two cookies**: NextAuth's session cookie (is someone logged in, for the edge
guard) and `easy_auth_tokens` (the actual Bearer tokens every API call attaches). The backend
contract is untouched — NextAuth is orchestration, not a token owner.

**2. `src/proxy.ts` — the edge route guard** (Next 16's rename of `middleware.ts`), wrapping
NextAuth's `auth()`. Route table lives in `src/routes.ts` (`publicRoutes` is empty — everything
except `/login`/`/signup` is protected). Behavior:

- Unauthenticated → `/login?callbackUrl=<original>`; login lands you back where you were going.
- Authenticated hitting `/login` → `/dashboard`.
- On every protected navigation it **re-verifies the access token server-side** against
  `GET /auth/me` — a live NextAuth session doesn't prove the backend session behind it wasn't
  revoked. A plain 401 is *not* an instant logout (the client may just need its refresh
  rotation); a 401 with no refresh token, or a 403 (blocked/deactivated), clears cookies and
  redirects.

**3. `(console)/layout.tsx` client guard** — kept only as anti-flash UX; `proxy.ts` is the
security boundary.

Server-side calls use `AUTH_API_INTERNAL_URL` (falls back to `NEXT_PUBLIC_AUTH_API_URL`) —
inside docker compose the backend is `http://nestjs-prisma-app:3001`, not `localhost`.
`AUTH_SECRET` is required (see getting-started.md). `trustHost: true` is set because this is a
self-hosted app with no fixed public URL.

## Permission gating

`GET /auth/me` returns the caller's resolved permission slugs; the MobX auth store holds them
and builds a CASL ability (`src/lib/ability.ts`, flat slugs, empty subject). Every page checks
its slugs (`PermissionRequired` / `hasPermission`), and the sidebar nav config filters itself
by the same ability — a user without `countries:read` never sees the Countries entry. The
backend enforces independently; UI gating is convenience, not security.

## Page inventory

| Route | Backing slugs | What's there |
|---|---|---|
| `/login`, `/signup` | public | RHF+Zod credentials form → NextAuth `signIn`; 2FA step; `callbackUrl` honored |
| `/dashboard` | per-card | Stat cards (users/roles/permissions), recent audit feed, quick actions, **Live activity** card (socket.io, connection badge: Live/Connecting/Offline) |
| `/users`, `/users/new`, `/users/[id]`, `/users/[id]/edit` | `users:*`, `roles:assign` | Full table treatment (below), role multi-select filter + assignment (diff-based), photo dropzone, block/unblock + activate/deactivate in a danger zone |
| `/customers` (+ new/[id]/edit) | `customers:*` | Same shape, no roles; DOB/gender/joined-date pickers, verified-flag badges |
| `/countries` (+ new/[id]/edit) | `countries:*` | Flag thumbnail (emoji fallback), code badge, currency/ISO fields, dropzone flag upload |
| `/languages` (+ new/[id]/edit) | `languages:*` | LTR/RTL combobox, isDefault checkbox, no image |
| `/roles` | `roles:manage` | Permission matrix grouped in cards, sorted by group/order; saves are diff-based attach/detach |
| `/permissions` | `permissions:read/define` | Sortable columns; group combobox derives groupOrder/order |
| `/audit-log` | `audit-log:read` | Paginated audit entries |
| `/account` | authed | Profile view↔edit toggle, sessions, 2FA enrollment (QR), change-password dialog (show/hide toggles, cross-field confirm) |

## UI patterns (the recipes every page follows)

- **Tables**: TanStack Table via `src/components/ui/data-table.tsx` — server-side pagination +
  debounced search, status filter combobox, column-visibility dropdown, clickable status badge
  → confirm modal → activate/deactivate, tooltip-wrapped view/edit/delete icon actions,
  column-shaped skeleton loaders, empty state, Clear filters. Caveat: list filters are
  server-side only where the API supports them (`activeOnly`); "Inactive" filters the fetched
  page client-side.
- **Forms**: react-hook-form + zod via `src/components/ui/form.tsx`; a Zod schema module per
  domain (e.g. `customers/customer-schema.ts`). On submit error: destructive Alert block above
  the form (`src/components/form-error-alert.tsx`, handles string and string[] messages) **and**
  a Sonner toast with a close button.
- **Uploads**: `src/components/photo-upload.tsx` — react-dropzone, 1 file, image/*, 2MB,
  preview + per-file rejected list. Images are sent as data-URL strings (no multipart).
- **Breadcrumbs**: `src/components/breadcrumb.tsx` — fixed "Dashboard" root, last crumb
  non-clickable, on every console page.
- **Live feed**: `src/hooks/use-live-audit-feed.ts` — connects to the backend's `/audit-logs`
  socket.io namespace with the access token, listens for `audit-log:created`, caps the list.

To add a new domain's pages, copy the closest existing group (customers is the most complete
template) — list + schema + new + `[id]` + `[id]/edit` — and add the sidebar entry gated on the
new `:read`/`:manage` slugs. See development.md for the backend half.

## The other three consoles

`admin-nextjs-workspaces` (same console, workspace-scoped: active-workspace picker,
`X-Workspace-Id` on admin calls), `admin-react` / `admin-react-workspaces` (Vite + React Router
equivalents). They share `auth-client` and the feature set through the earlier build phases but
have **not** received the NextAuth/proxy auth flow or the countries/languages/customers pages —
`admin-nextjs` is the reference implementation to port from.
