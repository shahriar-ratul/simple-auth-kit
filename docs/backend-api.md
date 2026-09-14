# Backend API reference

The surface `examples/nestjs-prisma-app` (the reference backend) serves on port 3001. All 4
combos expose the same auth/RBAC/admin surface; the deltas are:

- **Content domains** (countries/languages/customers): `nestjs-prisma` only, both variants
  (workspace-scoped in the workspaces variant).
- **Realtime audit feed** (socket.io) and **HTTP throttling** (`@nestjs/throttler`):
  `nestjs-prisma` base only.
- **Workspaces variants** additionally serve the `/api/v1/workspaces` routes, require
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

`@simple-auth-kit/auth-client` unwraps the envelope once in its transport layer — client code only
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

## Versioning

Every route lives under `/v1` in its own controller/router (`@Controller("v1/auth")`,
`createAuthRouter` mounted at `"/v1/auth"`, etc.) — that part of the path is intrinsic to the
route and never changes underneath a consumer. `/api` is a separate, deployment-level concern:
the NestJS combos set it once in `main.ts` (`app.setGlobalPrefix("api", { exclude: ["/", "health"] })`,
excluding the app's own root/health routes and leaving `/docs`/`/reference` untouched since those
are raw middleware, not Nest-routed controllers); the Express combos bake it directly into
`createAuthApp()`'s own router mounts, so a consumer never touches `main.ts` for it at all. Either
way, the full path a client calls is `/api/v1/<route>`.

## Identity & session — `/api/v1/auth/*`

| Method + path                                                                            | Tier   | Notes                                                                                                                                      |
| ---------------------------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| POST `/api/v1/auth/signup`                                                               | public | `{email, password}` + optional `firstName/lastName/displayName/phone/username` → token pair; new users get the `member` role               |
| POST `/api/v1/auth/login`                                                                | public | `{identifier, password}` — identifier matches email, username, or phone. Returns tokens **or** `{twoFactorRequired: true, challengeToken}` |
| POST `/api/v1/auth/login/2fa`                                                            | public | `{challengeToken, code}` → token pair                                                                                                      |
| POST `/api/v1/auth/refresh`                                                              | public | `{refreshToken}` → rotated pair (old refresh JTI is dead immediately)                                                                      |
| POST `/api/v1/auth/logout` / `/api/v1/auth/logout-all` / `/api/v1/auth/logout-others`    | authed | revoke this / every / every-other session                                                                                                  |
| GET `/api/v1/auth/me`                                                                    | authed | identity + roles + resolved permission slugs (what the console's UI gating reads). Skips throttling                                        |
| PATCH `/api/v1/auth/me`                                                                  | authed | self-service profile update                                                                                                                |
| GET `/api/v1/auth/sessions`                                                              | authed | the caller's sessions (ip, userAgent, expiry)                                                                                              |
| POST `/api/v1/auth/password/change`                                                      | authed | `{currentPassword, newPassword}`; revokes every other session                                                                              |
| POST `/api/v1/auth/password/forgot` / `/api/v1/auth/password/reset`                      | public | email token flow (`sendPasswordResetEmail` is injected by the consumer)                                                                    |
| POST `/api/v1/auth/2fa/enroll` → `/api/v1/auth/2fa/confirm` → `/api/v1/auth/2fa/disable` | authed | TOTP + backup codes                                                                                                                        |
| GET `/api/v1/auth/oauth/:provider/start`                                                 | public | returns the provider URL; backend handles the callback                                                                                     |

## Workspaces — `/api/v1/workspaces/*` (workspaces variant only)

| Method + path                                                                    | Tier                          | Notes                                                                                                                                                                                                                                  |
| -------------------------------------------------------------------------------- | ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| POST `/api/v1/workspaces`                                                        | authed (deliberately ungated) | Create a workspace; the creator becomes its first `admin`+`member`. Acts outside any workspace — no `X-Workspace-Id`. Default roles are provisioned inside the same transaction, so a workspace never exists without an administrator. |
| GET `/api/v1/workspaces`                                                         | authed (deliberately ungated) | The caller's own memberships.                                                                                                                                                                                                          |
| GET `/api/v1/workspaces/members`                                                 | membership-gated              | Who's in the active workspace.                                                                                                                                                                                                         |
| POST `/api/v1/workspaces/members`, DELETE `/api/v1/workspaces/members/:memberId` | `members:manage`              | Admit / remove a member.                                                                                                                                                                                                               |
| PUT `/api/v1/workspaces/members/:memberId/roles`                                 | `roles:assign`                | Same capability as the admin roles route, same slug on purpose.                                                                                                                                                                        |

Every admin route below, on a workspaces backend, additionally requires the `X-Workspace-Id`
header — permissions are resolved from the caller's membership in **that** workspace, which is
what scopes every admin query without a second check. A role held in workspace A grants
nothing in workspace B (prove-cycle asserts this).

## Admin surface — `/api/v1/admin`, `/api/v1/roles`, `/api/v1/permissions`, `/api/v1/audit-log`

All `@CheckAbility(...)`, slug named per route. Each of these is its own module now
(`modules/admin/`, `modules/roles/`, `modules/permissions/`, `modules/audit-log/`) — split out of
what used to be one `AdminController`/`admin.router.ts` mounted entirely under `/auth/admin/*`.
`modules/auth/` itself only keeps identity/session routes (`/api/v1/auth/...`) plus, on the
workspaces variant, workspace membership.

### Users (staff — the RBAC identity) — `/api/v1/admin`

| Route                                                                                              | Slug                |
| -------------------------------------------------------------------------------------------------- | ------------------- |
| GET `/api/v1/admin/users` (`search/page/limit`), GET `/api/v1/admin/users/:id`                     | `users:read`        |
| POST `/api/v1/admin/users` (direct create, immediately usable), PATCH `/:id`, DELETE `/:id` (soft) | `users:manage`      |
| POST `/:id/block` `/unblock` `/deactivate` `/activate`                                             | `users:block`       |
| POST `/:id/roles`, POST `/:id/roles/:roleSlug/revoke`                                              | `roles:assign`      |
| POST `/:id/permissions`, POST `/:id/permissions/:slug/revoke` (direct grants)                      | `permissions:grant` |

### Roles & permissions — `/api/v1/roles`, `/api/v1/permissions`

| Route                                                                                           | Slug                 |
| ----------------------------------------------------------------------------------------------- | -------------------- |
| GET `/api/v1/roles` (`?activeOnly=`)                                                            | `roles:manage`       |
| POST `/api/v1/roles`, PATCH `/api/v1/roles/:roleId`, DELETE `/api/v1/roles/:roleId` (soft)      | `roles:manage`       |
| POST `/api/v1/roles/:roleId/permissions`, POST `/api/v1/roles/:roleId/permissions/:slug/revoke` | `roles:manage`       |
| GET `/api/v1/permissions` (`?activeOnly=`)                                                      | `permissions:read`   |
| POST `/api/v1/permissions` (upsert on slug — create/edit/deactivate)                            | `permissions:define` |

### Audit log — `/api/v1/audit-log`

| Route                                            | Slug             |
| ------------------------------------------------ | ---------------- |
| GET `/api/v1/audit-log` (`page/limit` + filters) | `audit-log:read` |

### Content domains — countries, languages, customers (nestjs-prisma only) — `/api/v1/admin`

Identical shape per domain (shown for countries; substitute `languages` / `customers`):

| Route                                                                                   | Slug               |
| --------------------------------------------------------------------------------------- | ------------------ |
| GET `/api/v1/admin/countries` (`search/page/limit/activeOnly`), GET `/:id`              | `countries:read`   |
| POST `/api/v1/admin/countries`, PATCH `/:id`, DELETE `/:id` (soft, optional `{reason}`) | `countries:manage` |
| POST `/:id/activate`, POST `/:id/deactivate`                                            | `countries:status` |

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
slugs at runtime (`POST /api/v1/permissions` accepts any string), but those can't gate a
route this library ships.

## Realtime — socket.io `/audit-logs` namespace (nestjs-prisma base only)

- Connect with the access token via `auth.token`, an `Authorization` header, or `?token=` —
  unauthenticated/forged sockets are disconnected on connect. Token verification reuses the
  exact same path as the HTTP guard (including the denylist check).
- Every audit-log append is broadcast as **`audit-log:created`** with the same wire shape as
  the REST list endpoint. The consoles' dashboard _Live activity_ card is a client of this —
  against any other backend it shows Offline, which is correct.

## Rate limiting

Two layers:

- **Auth-flow limits** (all combos, both variants): `registry/core/rate-limit.ts` +
  each combo's `shared/src/rate-limit.store.ts`, applied to login and password-reset attempts.
- **HTTP throttling** (nestjs-prisma base only): `@nestjs/throttler` as a global guard, three
  buckets — **100/1s, 200/10s, 400/60s**. `GET /auth/me` skips all buckets. This now lives in the
  consumer's own `app.module.ts` (`ThrottlerModule.forRoot([...])` + `{ provide: APP_GUARD, useClass:
ThrottlerGuard }`, see `examples/nestjs-prisma-app/src/app.module.ts`) rather than behind
  `AuthModule.forRoot()` — the module split moved every global concern (throttler, the exception
  filter, the response-envelope interceptor) out of `AuthModule` into ordinary application wiring.
  `@SkipThrottle(...)` on `AuthController` names the buckets by the same names the consumer's
  `ThrottlerModule.forRoot([...])` call declares, so keep those names in sync if you change them.

## cURL cheat sheet

```bash
# login → token
TOKEN=$(curl -s -X POST localhost:3001/api/v1/auth/login -H 'content-type: application/json' \
  -d '{"identifier":"admin@example.com","password":"Admin12345!"}' | jq -r .data.accessToken)

curl -s localhost:3001/api/v1/auth/me -H "Authorization: Bearer $TOKEN" | jq .data
curl -s "localhost:3001/api/v1/admin/countries?activeOnly=true" -H "Authorization: Bearer $TOKEN" | jq .data

# workspaces variant: admin routes need the acting workspace
curl -s localhost:3005/api/v1/admin/users -H "Authorization: Bearer $TOKEN" -H "X-Workspace-Id: 1" | jq .data
```
