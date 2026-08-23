# Backend API reference

The surface `examples/nestjs-prisma-app` (the reference backend) serves on port 3001. All 4
combos expose the same auth/RBAC/admin surface; the deltas are:

- **Content domains** (countries/languages/customers): `nestjs-prisma` only, both variants
  (workspace-scoped in the workspaces variant).
- **Realtime audit feed** (socket.io) and **HTTP throttling** (`@nestjs/throttler`):
  `nestjs-prisma` base only.
- **Workspaces variants** additionally serve the `/workspaces` routes, require
  `X-Workspace-Id` on admin routes, and add the `members:manage` slug.
- Profile fields `dob`/`gender`/`joinedDate` on `User`: NestJS combos only.

Interactive docs: `/docs` (Swagger, every backend) and `/reference` (Scalar, reference backend
only) — open in dev, Basic-Auth-gated (`DOCS_USERNAME`/`DOCS_PASSWORD`) when
`NODE_ENV=production`.

## Response envelope

Every success:

```json
{ "success": true, "statusCode": 200, "message": "OK", "data": <payload> }
```

Every error:

```json
{ "success": false, "statusCode": 403, "message": "...", "error": "Forbidden" }
```

`@easy-auth/auth-client` unwraps the envelope once in its transport layer — client code only
ever sees `data`.

## Pagination

List endpoints take `?search=&page=&limit=` (page is 1-indexed, limit defaults 25, capped 100)
and answer:

```json
{ "items": [...], "meta": { "page": 1, "limit": 25, "total": 42, "pageCount": 2,
                            "hasPreviousPage": false, "hasNextPage": true } }
```

Lists that back pickers/dropdowns also take `?activeOnly=true` (roles, permissions, countries,
languages, customers) — omit it on management pages, which want inactive rows too. There are
**no** separate `/common/all-*` endpoints; `activeOnly` on the normal list is the convention.

## Route tiers

Every route is exactly one of: `@Public()` (no auth), authenticated-only (any valid Bearer
token), or `@CheckAbility("<slug>")` (admin surface). A route with none of these **fails at
boot**. Send the access token as `Authorization: Bearer <token>`.

## Identity & session — `/auth/*`

| Method + path | Tier | Notes |
|---|---|---|
| POST `/auth/signup` | public | `{email, password}` + optional `firstName/lastName/displayName/phone/username` → token pair; new users get the `member` role |
| POST `/auth/login` | public | `{identifier, password}` — identifier matches email, username, or phone. Returns tokens **or** `{twoFactorRequired: true, challengeToken}` |
| POST `/auth/login/2fa` | public | `{challengeToken, code}` → token pair |
| POST `/auth/refresh` | public | `{refreshToken}` → rotated pair (old refresh JTI is dead immediately) |
| POST `/auth/logout` / `/auth/logout-all` / `/auth/logout-others` | authed | revoke this / every / every-other session |
| GET `/auth/me` | authed | identity + roles + resolved permission slugs (what the console's UI gating reads). Skips throttling |
| PATCH `/auth/me` | authed | self-service profile update |
| GET `/auth/sessions` | authed | the caller's sessions (ip, userAgent, expiry) |
| POST `/auth/password/change` | authed | `{currentPassword, newPassword}`; revokes every other session |
| POST `/auth/password/forgot` / `/auth/password/reset` | public | email token flow (`sendPasswordResetEmail` is injected by the consumer) |
| POST `/auth/2fa/enroll` → `/auth/2fa/confirm` → `/auth/2fa/disable` | authed | TOTP + backup codes |
| GET `/auth/oauth/:provider/start` | public | returns the provider URL; backend handles the callback |

## Workspaces — `/workspaces/*` (workspaces variant only)

| Method + path | Tier | Notes |
|---|---|---|
| POST `/workspaces` | authed (deliberately ungated) | Create a workspace; the creator becomes its first `admin`+`member`. Acts outside any workspace — no `X-Workspace-Id`. Default roles are provisioned inside the same transaction, so a workspace never exists without an administrator. |
| GET `/workspaces` | authed (deliberately ungated) | The caller's own memberships. |
| GET `/workspaces/members` | membership-gated | Who's in the active workspace. |
| POST `/workspaces/members`, DELETE `/workspaces/members/:memberId` | `members:manage` | Admit / remove a member. |
| PUT `/workspaces/members/:memberId/roles` | `roles:assign` | Same capability as the admin roles route, same slug on purpose. |

Every admin route below, on a workspaces backend, additionally requires the `X-Workspace-Id`
header — permissions are resolved from the caller's membership in **that** workspace, which is
what scopes every admin query without a second check. A role held in workspace A grants
nothing in workspace B (prove-cycle asserts this).

## Admin surface — `/auth/admin/*`

All `@CheckAbility(...)`, slug named per route.

### Users (staff — the RBAC identity)

| Route | Slug |
|---|---|
| GET `/auth/admin/users` (`search/page/limit`), GET `/auth/admin/users/:id` | `users:read` |
| POST `/auth/admin/users` (direct create, immediately usable), PATCH `/:id`, DELETE `/:id` (soft) | `users:manage` |
| POST `/:id/block` `/unblock` `/deactivate` `/activate` | `users:block` |
| POST `/:id/roles`, POST `/:id/roles/:roleSlug/revoke` | `roles:assign` |
| POST `/:id/permissions`, POST `/:id/permissions/:slug/revoke` (direct grants) | `permissions:grant` |

### Roles & permissions

| Route | Slug |
|---|---|
| GET `/auth/admin/roles` (`?activeOnly=`) | `roles:manage` |
| POST `/auth/admin/roles`, PATCH `/:roleId`, DELETE `/:roleId` (soft) | `roles:manage` |
| POST `/:roleId/permissions`, POST `/:roleId/permissions/:slug/revoke` | `roles:manage` |
| GET `/auth/admin/permissions` (`?activeOnly=`) | `permissions:read` |
| POST `/auth/admin/permissions` (upsert on slug — create/edit/deactivate) | `permissions:define` |

### Audit log

| Route | Slug |
|---|---|
| GET `/auth/admin/audit-log` (`page/limit` + filters) | `audit-log:read` |

### Content domains — countries, languages, customers (nestjs-prisma only)

Identical shape per domain (shown for countries; substitute `languages` / `customers`):

| Route | Slug |
|---|---|
| GET `/auth/admin/countries` (`search/page/limit/activeOnly`), GET `/:id` | `countries:read` |
| POST `/auth/admin/countries`, PATCH `/:id`, DELETE `/:id` (soft, optional `{reason}`) | `countries:manage` |
| POST `/:id/activate`, POST `/:id/deactivate` | `countries:status` |

Fields (full row is always returned — every safe column, never a hand-picked subset):

- **Country**: `code, name, emoji, phoneCode, currency, currencyName, isoCode, flag` (image as
  data-URL/URL string — no multipart), `isActive` + id/uuid/audit columns.
- **Language**: `code, name, nativeName, direction ("ltr"|"rtl"), isDefault, isActive` + audit
  columns. Deliberately no `countryId` FK.
- **Customer**: end-users managed by admins — `firstName, lastName, username, email, phone,
  dob, gender, joinedDate, photo, isEmailVerified, isPhoneVerified, isActive` + audit columns.
  **No login capability, no roles** — not related to the RBAC `User`.

## Permission slug catalog

18 slugs in the reference combo's base catalog:

`users:read` `users:block` `users:manage` · `roles:manage` `roles:assign` ·
`permissions:read` `permissions:define` `permissions:grant` · `audit-log:read` ·
`countries:read` `countries:manage` `countries:status` ·
`languages:read` `languages:manage` `languages:status` ·
`customers:read` `customers:manage` `customers:status`

The workspaces variant adds `members:manage` (19). The other 3 combos carry the 9 non-content
slugs (10 with `members:manage`) — their catalogs, like their route tables, have no content
domains. The seeder maps the whole catalog to the
`admin` role; `member` gets none. Slugs are defined in
`variants/<variant>/src/rbac.defaults.ts` — `@CheckAbility` takes `PermissionSlug`
(`keyof typeof PERMISSION_CATALOG`), so a route demanding an uncatalogued slug is a compile
error, and adding one there is what makes the seeder provision it. Deployments may mint new
slugs at runtime (`POST /auth/admin/permissions` accepts any string), but those can't gate a
route this library ships.

## Realtime — socket.io `/audit-logs` namespace (nestjs-prisma base only)

- Connect with the access token via `auth.token`, an `Authorization` header, or `?token=` —
  unauthenticated/forged sockets are disconnected on connect. Token verification reuses the
  exact same path as the HTTP guard (including the denylist check).
- Every audit-log append is broadcast as **`audit-log:created`** with the same wire shape as
  the REST list endpoint. The consoles' dashboard *Live activity* card is a client of this —
  against any other backend it shows Offline, which is correct.

## Rate limiting

Two layers:

- **Auth-flow limits** (all combos, both variants): `registry/core/rate-limit.ts` +
  each combo's `shared/src/rate-limit.store.ts`, applied to login and password-reset attempts.
- **HTTP throttling** (nestjs-prisma base only): `@nestjs/throttler` as a global guard, three
  buckets — **100/1s, 200/10s, 400/60s**. `GET /auth/me` skips all buckets. Configurable per
  consumer via `AuthModule.forRoot({ throttle: [...] })` or disabled with `throttle: false`
  (prove-cycle passes one generous bucket so the guard stays wired without 429-ing the proof).

## cURL cheat sheet

```bash
# login → token
TOKEN=$(curl -s -X POST localhost:3001/auth/login -H 'content-type: application/json' \
  -d '{"identifier":"admin@example.com","password":"Admin12345!"}' | jq -r .data.accessToken)

curl -s localhost:3001/auth/me -H "Authorization: Bearer $TOKEN" | jq .data
curl -s "localhost:3001/auth/admin/countries?activeOnly=true" -H "Authorization: Bearer $TOKEN" | jq .data

# workspaces variant: admin routes need the acting workspace
curl -s localhost:3005/auth/admin/users -H "Authorization: Bearer $TOKEN" -H "X-Workspace-Id: 1" | jq .data
```
