export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  /** Only present right after signup/login/2fa-complete — refresh() doesn't get a new one, so it's carried forward from storage. */
  sessionId?: string;
}

export interface TwoFactorChallenge {
  twoFactorRequired: true;
  challengeToken: string;
}

/**
 * `GET /auth/me`. Verified against a running backend: the server answers exactly these five
 * fields, on both variants.
 *
 * The access token is workspace-agnostic — it identifies only the user and the session — so
 * `roles`/`permissions` are whatever applies to *this request*: on the plain backend variant
 * they are global to the deployment, and on the workspaces variant they are the caller's roles
 * and permissions inside the workspace the request named, or empty when it named none.
 *
 * A `rules` field is coming: the caller's CASL abilities, serialized with `packRules` from
 * `@casl/ability/extra`, for the workspace this request names. It belongs *here*, as one more
 * optional property of this interface, and nowhere else — the client neither unpacks it nor
 * depends on `@casl/ability`; each consuming app builds its own `Ability` from it, so server
 * enforcement and UI hiding cannot drift. Nothing in this package has to change for the field to
 * arrive safely: responses are handed back whole, never rebuilt from a known-field list, so an
 * unrecognised field already reaches the caller untouched (see the `/auth/me` passthrough test).
 */
export interface CurrentUser {
  sub: string;
  sessionId: string;
  roles: string[];
  permissions: string[];
  twoFactorEnabled: boolean;
  email: string;
  firstName: string | null;
  lastName: string | null;
  displayName: string | null;
  phone: string | null;
  username: string | null;
  photo: string | null;
}

export interface SessionSummary {
  id: string;
  createdAt: string;
  userAgent?: string;
  ip?: string;
}

export interface AuditLogEntry {
  id: string;
  /** Workspaces variant only; null for events that happened outside any workspace. Absent on the plain variant. */
  workspaceId?: string | null;
  userId: string | null;
  /** Human-readable label for `action`, e.g. "Role assigned". */
  name: string;
  /** The AuditEvent discriminant, e.g. "role_assigned". */
  action: string;
  /** The rest of the AuditEvent's fields. */
  info: unknown;
  /** Free-text note; null unless the backend set one. */
  remarks: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PageMeta {
  /** 1-indexed. */
  page: number;
  limit: number;
  total: number;
  pageCount: number;
  hasPreviousPage: boolean;
  hasNextPage: boolean;
}

export interface AuditLogListFilter {
  userId?: string;
  action?: string;
  since?: string;
  until?: string;
  /** 1-indexed. Defaults to 1. */
  page?: number;
  /** Defaults to 25, capped at 100. */
  limit?: number;
}

export interface AuditLogListResult {
  items: AuditLogEntry[];
  meta: PageMeta;
}

export interface RoleSummary {
  id: string;
  slug: string;
  /** Unique across the deployment, alongside slug/displayName. */
  name: string;
  displayName: string;
  /** Given to every newly signed-up user (or, on the workspaces variant, every new membership). */
  isDefault: boolean;
  isActive: boolean;
  /** Permission slugs currently attached to this role — see attachPermissionToRole/detachPermissionFromRole. */
  permissions: string[];
}

export interface CreateRoleInput {
  /** Stable identifier. Grants and assignments are keyed on it. */
  slug: string;
  name?: string;
  /** Human label for the console. Defaults to the slug. */
  displayName?: string;
  description?: string | null;
  /** Given to every newly signed-up user. Defaults to false. */
  isDefault?: boolean;
  /** Defaults to true. */
  isActive?: boolean;
}

export interface UpdateRoleInput {
  name?: string;
  displayName?: string;
  description?: string | null;
  /** Given to every newly signed-up user. */
  isDefault?: boolean;
  /** `false` suspends the role without deleting it — it stops granting immediately. */
  isActive?: boolean;
}

export interface PermissionSummary {
  id: string;
  /** The ability itself: `@CheckAbility(slug)` on the server, `ability.can(slug, ABILITY_SUBJECT)` in a client. */
  slug: string;
  /** Unique across the deployment, alongside slug/displayName. */
  name: string;
  displayName: string;
  description: string | null;
  /** Console grouping — a permission matrix renders one section per group. */
  group: string;
  groupOrder: number;
  order: number;
  /** `false` takes the permission out of every ability that would otherwise carry it, without unpicking a single grant. */
  isActive: boolean;
}

export interface DefinePermissionInput {
  slug: string;
  name?: string;
  /** Defaults to the slug when creating. */
  displayName?: string;
  description?: string | null;
  /** Defaults to `"Custom"` when creating. */
  group?: string;
  groupOrder?: number;
  order?: number;
  isActive?: boolean;
}

export interface PermissionListResult {
  permissions: PermissionSummary[];
}

/** Profile fields a `PATCH /auth/admin/users/:userId` accepts. Email is the login identifier and is not editable here. */
export interface UpdateUserInput {
  firstName?: string | null;
  lastName?: string | null;
  displayName?: string | null;
  phone?: string | null;
  username?: string | null;
  photo?: string | null;
  /** ISO date (yyyy-mm-dd). */
  dob?: string | null;
  gender?: string | null;
  /** ISO date (yyyy-mm-dd). Not nullable — omit to leave unchanged. */
  joinedDate?: string;
}

/** `PATCH /auth/me`'s response — the same shape whether or not the combo has workspaces, since a profile isn't a workspace concept. */
export interface SelfProfile {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  displayName: string | null;
  phone: string | null;
  username: string | null;
  photo: string | null;
  createdAt: string;
}

/** `POST /auth/admin/users` — no invitation email, the account is usable immediately. */
export interface CreateUserInput {
  email: string;
  password: string;
  firstName?: string;
  lastName?: string;
  displayName?: string;
  phone?: string;
  username?: string;
  photo?: string;
  /** ISO date (yyyy-mm-dd). */
  dob?: string;
  gender?: string;
  /** ISO date (yyyy-mm-dd). Defaults to today. */
  joinedDate?: string;
  /** Defaults to true — false creates the account already deactivated. */
  isActive?: boolean;
  /** Defaults to whichever roles are flagged `isDefault`, same as a self-signup. */
  roles?: string[];
}

/**
 * Every column the `User` table has, except the two secrets (`passwordHash`, `twoFactorSecret` —
 * never leave the server). Deliberately not a hand-picked subset — a curated field list means
 * every field a future screen wants is another round-trip through the backend, the client, and
 * the UI; forwarding the whole safe row once means that never has to happen again.
 */
export interface DeploymentUserSummary {
  id: string;
  uuid: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  displayName: string | null;
  phone: string | null;
  username: string | null;
  photo: string | null;
  /** Date of birth, ISO 8601. */
  dob: string | null;
  gender: string | null;
  /** ISO 8601. Defaults to the account's creation day. */
  joinedDate: string;
  /** ISO 8601. Set on every successful signup/login/OAuth callback, never on a token refresh. */
  lastLogin: string | null;
  /** Security/moderation block (see `blockUser`/`unblockUser`) — distinct from `isActive`. Both independently deny login. */
  blocked: boolean;
  /** Routine administrative on/off toggle (see `activateUser`/`deactivateUser`) — distinct from `blocked`. Both independently deny login. */
  isActive: boolean;
  twoFactorEnabled: boolean;
  roles: string[];
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

/** `GET /auth/admin/users` on the workspaces variant: the principal is a membership of one workspace. Same "every safe column" policy as `DeploymentUserSummary`. */
export interface WorkspaceUserSummary {
  /** WorkspaceMember id — the handle for member-scoped operations on /workspaces/members/*. */
  memberId: string;
  userId: string;
  uuid: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  displayName: string | null;
  phone: string | null;
  username: string | null;
  photo: string | null;
  /** Date of birth, ISO 8601. */
  dob: string | null;
  gender: string | null;
  /** ISO 8601. Defaults to the account's creation day. */
  joinedDate: string;
  lastLogin: string | null;
  blocked: boolean;
  isActive: boolean;
  twoFactorEnabled: boolean;
  roles: string[];
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * The two backend variants name the listed principal differently, and a consumer compiled
 * against one of them narrows to that arm. `userIdOf()` covers the common case — the id the
 * `/auth/admin/users/:userId/*` routes take, which is the User id on both variants.
 */
export type UserSummary = DeploymentUserSummary | WorkspaceUserSummary;

export function userIdOf(user: UserSummary): string {
  return "userId" in user ? user.userId : user.id;
}

export interface UserListFilter {
  search?: string;
  /** 1-indexed. Defaults to 1. */
  page?: number;
  /** Defaults to 25, capped at 100. */
  limit?: number;
}

export interface UserListResult {
  items: UserSummary[];
  meta: PageMeta;
}

// ---- workspaces variant only ----

export interface WorkspaceSummary {
  id: string;
  name: string;
  createdAt: string;
  /** The calling user's roles in this workspace. */
  roles: string[];
}

export interface WorkspaceMember {
  memberId: string;
  userId: string;
  email: string;
  roles: string[];
  createdAt: string;
}

export interface MemberRoles {
  memberId: string;
  roles: string[];
}

/**
 * Per-call workspace override for the calls that are workspace-scoped.
 *
 * Omitted (or `workspaceId: undefined`) uses the client's active workspace, which is the normal
 * case — a consumer sets it once. A string acts in that workspace for this one call. `null`
 * suppresses the header entirely, which is how you ask `/auth/me` for the workspace-free
 * identity while a workspace is active.
 */
export interface WorkspaceScope {
  workspaceId?: string | null;
}

/**
 * The active workspace, resolved per request. A function keeps ownership of *where the active
 * workspace lives* with the app — a Zustand store, a route param, AsyncStorage — the same way
 * `TokenStorage` keeps token persistence out of this package.
 */
export type WorkspaceIdResolver = () => string | null | undefined | Promise<string | null | undefined>;

/** Injected per platform — the only thing that differs between the 4 apps. */
export interface TokenStorage {
  get(): Promise<AuthTokens | null>;
  set(tokens: AuthTokens): Promise<void>;
  clear(): Promise<void>;
}

// ---- countries (base backend variant only) ----

/** Every column the `Country` table has — there is no secret to withhold, unlike `UserSummary`. */
export interface CountrySummary {
  id: string;
  uuid: string;
  code: string;
  name: string;
  emoji: string;
  phoneCode: string;
  currency: string;
  currencyName: string;
  isoCode: string;
  /** A data URI or an externally-hosted URL — stored as-is, never processed server-side. */
  flag: string | null;
  isActive: boolean;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCountryInput {
  code: string;
  name: string;
  emoji: string;
  phoneCode: string;
  currency: string;
  currencyName: string;
  isoCode: string;
  flag?: string | null;
  isActive?: boolean;
}

export interface UpdateCountryInput {
  code?: string;
  name?: string;
  emoji?: string;
  phoneCode?: string;
  currency?: string;
  currencyName?: string;
  isoCode?: string;
  flag?: string | null;
  isActive?: boolean;
}

export interface CountryListFilter {
  search?: string;
  /** 1-indexed. Defaults to 1. */
  page?: number;
  /** Defaults to 25, capped at 100. */
  limit?: number;
  /** Pass true for a picker/dropdown — omitted returns everything, active or not. */
  activeOnly?: boolean;
}

export interface CountryListResult {
  items: CountrySummary[];
  meta: PageMeta;
}

// ---- languages (base backend variant only) ----

/** Every column the `Language` table has — there is no secret to withhold, unlike `UserSummary`. */
export interface LanguageSummary {
  id: string;
  uuid: string;
  code: string;
  name: string;
  nativeName: string;
  direction: "ltr" | "rtl" | (string & {});
  /** Given to a new deployment's default locale. */
  isDefault: boolean;
  isActive: boolean;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateLanguageInput {
  code: string;
  name: string;
  nativeName: string;
  /** Defaults to "ltr" when creating. */
  direction?: "ltr" | "rtl";
  isDefault?: boolean;
  isActive?: boolean;
}

export interface UpdateLanguageInput {
  code?: string;
  name?: string;
  nativeName?: string;
  direction?: "ltr" | "rtl";
  isDefault?: boolean;
  isActive?: boolean;
}

export interface LanguageListFilter {
  search?: string;
  /** 1-indexed. Defaults to 1. */
  page?: number;
  /** Defaults to 25, capped at 100. */
  limit?: number;
  /** Pass true for a picker/dropdown — omitted returns everything, active or not. */
  activeOnly?: boolean;
}

export interface LanguageListResult {
  items: LanguageSummary[];
  meta: PageMeta;
}

// ---- customers (base backend variant only) ----

/**
 * End-users managed by admins — no login capability, and not related to the RBAC `UserSummary`
 * above. Every column the `Customer` table has — there is no login credential to withhold.
 */
export interface CustomerSummary {
  id: string;
  uuid: string;
  firstName: string | null;
  lastName: string | null;
  /** Unique across the deployment. */
  username: string | null;
  email: string;
  /** Unique across the deployment. */
  phone: string | null;
  dob: string | null;
  gender: string | null;
  joinedDate: string;
  /** A data URI or an externally-hosted URL — stored as-is, never processed server-side. */
  photo: string | null;
  isEmailVerified: boolean;
  isPhoneVerified: boolean;
  isActive: boolean;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCustomerInput {
  email: string;
  firstName?: string;
  lastName?: string;
  username?: string;
  phone?: string;
  dob?: string;
  gender?: string;
  /** Defaults to today when creating. */
  joinedDate?: string;
  photo?: string;
  isEmailVerified?: boolean;
  isPhoneVerified?: boolean;
  isActive?: boolean;
}

export interface UpdateCustomerInput {
  email?: string;
  firstName?: string | null;
  lastName?: string | null;
  username?: string | null;
  phone?: string | null;
  dob?: string | null;
  gender?: string | null;
  joinedDate?: string;
  photo?: string | null;
  isEmailVerified?: boolean;
  isPhoneVerified?: boolean;
  isActive?: boolean;
}

export interface CustomerListFilter {
  search?: string;
  /** 1-indexed. Defaults to 1. */
  page?: number;
  /** Defaults to 25, capped at 100. */
  limit?: number;
  /** Pass true for a picker/dropdown — omitted returns everything, active or not. */
  activeOnly?: boolean;
}

export interface CustomerListResult {
  items: CustomerSummary[];
  meta: PageMeta;
}

export class AuthApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
  ) {
    super(message);
    this.name = "AuthApiError";
  }
}
