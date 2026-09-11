import {
  AuditLogListFilter,
  AuditLogListResult,
  AuthApiError,
  AuthTokens,
  CountryListFilter,
  CountryListResult,
  CountrySummary,
  CreateCountryInput,
  CreateCustomerInput,
  CreateLanguageInput,
  CreateRoleInput,
  CreateUserInput,
  CurrentUser,
  CustomerListFilter,
  CustomerListResult,
  CustomerSummary,
  DefinePermissionInput,
  LanguageListFilter,
  LanguageListResult,
  LanguageSummary,
  MemberRoles,
  PermissionListResult,
  PermissionSummary,
  RoleSummary,
  SelfProfile,
  SessionSummary,
  TokenStorage,
  TwoFactorChallenge,
  UpdateCountryInput,
  UpdateCustomerInput,
  UpdateLanguageInput,
  UpdateRoleInput,
  UpdateUserInput,
  UserListFilter,
  UserListResult,
  UserSummary,
  WorkspaceIdResolver,
  WorkspaceMember,
  WorkspaceScope,
  WorkspaceSummary,
} from "./types.js";

export interface AuthClientOptions {
  baseUrl: string;
  storage: TokenStorage;
  /**
   * The workspace that workspace-scoped calls act in.
   *
   * Leave it out entirely against the plain backend variant (`simple-auth-kit add <combo>`): nothing
   * then ever sends `X-Workspace-Id`, and no call site has to mention workspaces. Against the
   * workspaces variant (`--workspaces`) set it once — a string for a fixed workspace, or a
   * function resolved per request so the app's own store stays the owner of "which workspace am
   * I in", exactly as `TokenStorage` keeps token persistence out of this package.
   */
  workspaceId?: string | WorkspaceIdResolver;
}

/** The header a request uses to name the workspace it acts in. Lowercased — `fetch` header names are case-insensitive. */
export const WORKSPACE_HEADER = "x-workspace-id";

function isTwoFactorChallenge(value: unknown): value is TwoFactorChallenge {
  return typeof value === "object" && value !== null && (value as { twoFactorRequired?: unknown }).twoFactorRequired === true;
}

function queryString(filter: object): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filter)) if (value !== undefined) params.set(key, String(value));
  const query = params.toString();
  return query ? `?${query}` : "";
}

/**
 * One client shared by all 4 apps (admin-nextjs, admin-react, mobile-expo, mobile-bare-rn) —
 * the auth flow and API contract are identical, only `TokenStorage` differs per platform.
 * Mirrors the deps-injection pattern used throughout registry/core: business logic here is
 * storage-agnostic.
 *
 * It also serves both backend variants from one build. Workspaces are an install-time choice of
 * the consuming project, not a runtime mode of this client: the workspace surface below
 * (`createWorkspace`, `listWorkspaces`, `listWorkspaceMembers`, ...) only exists on the
 * `--workspaces` backend, and a consumer on the plain variant simply never calls it and never
 * configures `workspaceId` — in which case `X-Workspace-Id` is never sent on anything.
 *
 * Which calls carry the header is a structural property here, not a per-call decision:
 * `request()` cannot pass a workspace at all, and only `scopedRequest()` can.
 */
export class AuthClient {
  private activeWorkspace: string | WorkspaceIdResolver | null;

  constructor(private readonly opts: AuthClientOptions) {
    this.activeWorkspace = opts.workspaceId ?? null;
  }

  // ---- active workspace (workspaces backend variant only) ----

  /** Replaces the configured active workspace. `null` goes back to sending no workspace at all. */
  setActiveWorkspace(workspaceId: string | WorkspaceIdResolver | null): void {
    this.activeWorkspace = workspaceId;
  }

  /** Resolves the active workspace — awaiting the resolver function if one was configured. */
  async getActiveWorkspace(): Promise<string | null> {
    if (typeof this.activeWorkspace === "function") return (await this.activeWorkspace()) ?? null;
    return this.activeWorkspace;
  }

  // ---- identity ----

  async signup(input: { email: string; password: string }): Promise<AuthTokens> {
    const tokens = await this.anonymousRequest<AuthTokens>("POST", "/auth/signup", input);
    await this.opts.storage.set(tokens);
    return tokens;
  }

  /** `identifier` is matched against email, username, and phone, in that order. Returns tokens directly, or a 2FA challenge to complete via `loginTwoFactor`. */
  async login(input: { identifier: string; password: string }): Promise<AuthTokens | TwoFactorChallenge> {
    const result = await this.anonymousRequest<AuthTokens | TwoFactorChallenge>("POST", "/auth/login", input);
    if (isTwoFactorChallenge(result)) return result;
    await this.opts.storage.set(result);
    return result;
  }

  async loginTwoFactor(input: { challengeToken: string; code: string }): Promise<AuthTokens> {
    const tokens = await this.anonymousRequest<AuthTokens>("POST", "/auth/login/2fa", input);
    await this.opts.storage.set(tokens);
    return tokens;
  }

  /** Rotates the refresh token; callers rarely need this directly — `request()` calls it automatically on a 401. */
  async refresh(): Promise<AuthTokens> {
    const current = await this.opts.storage.get();
    if (!current) throw new AuthApiError("not logged in", 401);

    const rotated = await this.anonymousRequest<{ accessToken: string; refreshToken: string }>("POST", "/auth/refresh", {
      refreshToken: current.refreshToken,
    });
    const merged: AuthTokens = { ...rotated, sessionId: current.sessionId };
    await this.opts.storage.set(merged);
    return merged;
  }

  async logout(): Promise<void> {
    await this.request("POST", "/auth/logout");
    await this.opts.storage.clear();
  }

  async logoutAll(): Promise<void> {
    await this.request("POST", "/auth/logout-all");
    await this.opts.storage.clear();
  }

  async logoutOthers(): Promise<void> {
    await this.request("POST", "/auth/logout-others");
  }

  /** Requires the current password. Every other session is revoked; the one making this call is left alone. */
  async changePassword(input: { currentPassword: string; newPassword: string }): Promise<void> {
    await this.request("POST", "/auth/password/change", input);
  }

  /** Self-service — no admin permission required, updates the caller's own row. Not workspace-scoped: a profile isn't a workspace concept. */
  async updateProfile(input: UpdateUserInput): Promise<SelfProfile> {
    return this.request("PATCH", "/auth/me", input);
  }

  /**
   * The one identity endpoint that answers differently per workspace: it reports the roles and
   * permissions that apply to *this* request, so it carries the active workspace when there is
   * one. On the workspaces variant it is the only way to learn your permissions in a workspace,
   * which is what the client-side UI gating reads. Pass `{ workspaceId: null }` for the
   * workspace-free identity, which answers with empty roles and permissions.
   */
  async me(scope?: WorkspaceScope): Promise<CurrentUser> {
    return this.scopedRequest("GET", "/auth/me", undefined, scope);
  }

  async sessions(): Promise<SessionSummary[]> {
    return this.request("GET", "/auth/sessions");
  }

  async isAuthenticated(): Promise<boolean> {
    return (await this.opts.storage.get()) !== null;
  }

  async enrollTwoFactor(): Promise<{ secret: string; provisioningUri: string }> {
    return this.request("POST", "/auth/2fa/enroll");
  }

  async confirmTwoFactor(code: string): Promise<{ backupCodes: string[] }> {
    return this.request("POST", "/auth/2fa/confirm", { code });
  }

  async disableTwoFactor(code: string): Promise<void> {
    await this.request("POST", "/auth/2fa/disable", { code });
  }

  async requestPasswordReset(input: { email: string }): Promise<void> {
    await this.anonymousRequest("POST", "/auth/password/forgot", input);
  }

  async resetPassword(input: { token: string; newPassword: string }): Promise<void> {
    await this.anonymousRequest("POST", "/auth/password/reset", input);
  }

  /** Returns the provider URL to send the browser/webview to; the backend handles the round-trip and callback. */
  async oauthStart(provider: string): Promise<{ url: string }> {
    return this.anonymousRequest("GET", `/auth/oauth/${encodeURIComponent(provider)}/start`);
  }

  // ---- workspaces (workspaces backend variant only) ----

  /**
   * Not workspace-scoped — you cannot already be in the workspace you are creating, so this
   * deliberately sends no `X-Workspace-Id`. The creator becomes an `["admin","member"]` member.
   */
  async createWorkspace(name: string): Promise<WorkspaceSummary> {
    return this.request("POST", "/workspaces", { name });
  }

  /** Not workspace-scoped: any authenticated user, answering with the workspaces they belong to and their roles in each. */
  async listWorkspaces(): Promise<WorkspaceSummary[]> {
    return this.request("GET", "/workspaces");
  }

  /** Any member of the workspace may list it. */
  async listWorkspaceMembers(scope?: WorkspaceScope): Promise<WorkspaceMember[]> {
    return this.scopedRequest("GET", "/workspaces/members", undefined, scope);
  }

  /** [admin] Adds an existing user by email. `roles` defaults to `["member"]` on the backend. */
  async addWorkspaceMember(input: { email: string; roles?: string[] }, scope?: WorkspaceScope): Promise<WorkspaceMember> {
    return this.scopedRequest("POST", "/workspaces/members", input, scope);
  }

  /** [admin] Replaces a member's whole role set. The backend refuses (403) when the member is you. */
  async setWorkspaceMemberRoles(memberId: string, roles: string[], scope?: WorkspaceScope): Promise<MemberRoles> {
    return this.scopedRequest("PUT", `/workspaces/members/${encodeURIComponent(memberId)}/roles`, { roles }, scope);
  }

  /** [admin] Removes a member, and their direct permission grants with them. The backend refuses (403) when the member is you. */
  async removeWorkspaceMember(memberId: string, scope?: WorkspaceScope): Promise<void> {
    await this.scopedRequest("DELETE", `/workspaces/members/${encodeURIComponent(memberId)}`, undefined, scope);
  }

  // ---- administration ----
  //
  // Every call below is workspace-scoped: on the workspaces variant these routes administer one
  // workspace and require the header; on the plain variant they administer the deployment and
  // the header is never configured, so never sent.

  async blockUser(userId: string, scope?: WorkspaceScope): Promise<void> {
    await this.scopedRequest("POST", `/auth/admin/users/${encodeURIComponent(userId)}/block`, undefined, scope);
  }

  async unblockUser(userId: string, scope?: WorkspaceScope): Promise<void> {
    await this.scopedRequest("POST", `/auth/admin/users/${encodeURIComponent(userId)}/unblock`, undefined, scope);
  }

  /** A routine administrative on/off toggle — distinct from block/unblock, a security/moderation action. Both independently deny login. */
  async deactivateUser(userId: string, scope?: WorkspaceScope): Promise<void> {
    await this.scopedRequest("POST", `/auth/admin/users/${encodeURIComponent(userId)}/deactivate`, undefined, scope);
  }

  async activateUser(userId: string, scope?: WorkspaceScope): Promise<void> {
    await this.scopedRequest("POST", `/auth/admin/users/${encodeURIComponent(userId)}/activate`, undefined, scope);
  }

  async listUsers(filter: UserListFilter = {}, scope?: WorkspaceScope): Promise<UserListResult> {
    return this.scopedRequest<UserListResult>("GET", `/auth/admin/users${queryString(filter)}`, undefined, scope);
  }

  /** No invitation email — the account is usable immediately with the password given here. */
  async createUser(input: CreateUserInput, scope?: WorkspaceScope): Promise<UserSummary> {
    return this.scopedRequest("POST", "/auth/admin/users", input, scope);
  }

  async getUser(userId: string, scope?: WorkspaceScope): Promise<UserSummary> {
    return this.scopedRequest("GET", `/auth/admin/users/${encodeURIComponent(userId)}`, undefined, scope);
  }

  /** Profile fields only — email is the login identifier and is not editable here. */
  async updateUser(userId: string, input: UpdateUserInput, scope?: WorkspaceScope): Promise<UserSummary> {
    return this.scopedRequest("PATCH", `/auth/admin/users/${encodeURIComponent(userId)}`, input, scope);
  }

  /** Soft-delete: the account stops appearing in listings and can no longer authenticate. The backend refuses (403) when the target is you. */
  async deleteUser(userId: string, reason?: string, scope?: WorkspaceScope): Promise<void> {
    await this.scopedRequest("DELETE", `/auth/admin/users/${encodeURIComponent(userId)}`, reason ? { reason } : undefined, scope);
  }

  /** `activeOnly` is what a role picker (Add user, Assign role) should pass — omit it for the Roles management page, which wants everything. */
  async listRoles(filter: { activeOnly?: boolean } = {}, scope?: WorkspaceScope): Promise<RoleSummary[]> {
    const result = await this.scopedRequest<{ roles: RoleSummary[] }>("GET", `/auth/admin/roles${queryString(filter)}`, undefined, scope);
    return result.roles;
  }

  async createRole(input: CreateRoleInput, scope?: WorkspaceScope): Promise<RoleSummary> {
    return this.scopedRequest("POST", "/auth/admin/roles", input, scope);
  }

  async updateRole(roleId: string, input: UpdateRoleInput, scope?: WorkspaceScope): Promise<RoleSummary> {
    return this.scopedRequest("PATCH", `/auth/admin/roles/${encodeURIComponent(roleId)}`, input, scope);
  }

  /** Soft-delete: existing assignments are left in place, and the role simply stops being resolved. */
  async deleteRole(roleId: string, reason?: string, scope?: WorkspaceScope): Promise<void> {
    await this.scopedRequest("DELETE", `/auth/admin/roles/${encodeURIComponent(roleId)}`, reason ? { reason } : undefined, scope);
  }

  async attachPermissionToRole(roleId: string, permission: string, scope?: WorkspaceScope): Promise<void> {
    await this.scopedRequest("POST", `/auth/admin/roles/${encodeURIComponent(roleId)}/permissions`, { permission }, scope);
  }

  async detachPermissionFromRole(roleId: string, permissionSlug: string, scope?: WorkspaceScope): Promise<void> {
    await this.scopedRequest("POST", `/auth/admin/roles/${encodeURIComponent(roleId)}/permissions/${encodeURIComponent(permissionSlug)}/revoke`, undefined, scope);
  }

  /**
   * The catalog itself is global on both variants; what is workspace-scoped is which roles/
   * memberships point at each row. Still sent through `scopedRequest`: on the workspaces variant
   * every `/auth/admin/*` route sits behind the same guard that requires `X-Workspace-Id`, even
   * this one. `activeOnly` is what a permission picker (Create/Edit Role) should pass — omit it
   * for the Permissions management page, which wants everything.
   */
  async listPermissions(filter: { activeOnly?: boolean } = {}, scope?: WorkspaceScope): Promise<PermissionSummary[]> {
    const result = await this.scopedRequest<PermissionListResult>("GET", `/auth/admin/permissions${queryString(filter)}`, undefined, scope);
    return result.permissions;
  }

  /** Upserted on `slug` — creates a new capability, or edits/deactivates an existing one. */
  async definePermission(input: DefinePermissionInput, scope?: WorkspaceScope): Promise<PermissionSummary> {
    return this.scopedRequest("POST", "/auth/admin/permissions", input, scope);
  }

  async assignRole(userId: string, role: string, scope?: WorkspaceScope): Promise<void> {
    await this.scopedRequest("POST", `/auth/admin/users/${encodeURIComponent(userId)}/roles`, { role }, scope);
  }

  async revokeRole(userId: string, roleName: string, scope?: WorkspaceScope): Promise<void> {
    await this.scopedRequest("POST", `/auth/admin/users/${encodeURIComponent(userId)}/roles/${encodeURIComponent(roleName)}/revoke`, undefined, scope);
  }

  async grantPermission(userId: string, permission: string, scope?: WorkspaceScope): Promise<void> {
    await this.scopedRequest("POST", `/auth/admin/users/${encodeURIComponent(userId)}/permissions`, { permission }, scope);
  }

  async revokePermission(userId: string, permissionKey: string, scope?: WorkspaceScope): Promise<void> {
    await this.scopedRequest(
      "POST",
      `/auth/admin/users/${encodeURIComponent(userId)}/permissions/${encodeURIComponent(permissionKey)}/revoke`,
      undefined,
      scope,
    );
  }

  async listAuditLog(filter: AuditLogListFilter = {}, scope?: WorkspaceScope): Promise<AuditLogListResult> {
    return this.scopedRequest<AuditLogListResult>("GET", `/auth/admin/audit-log${queryString(filter)}`, undefined, scope);
  }

  // ---- countries (base backend variant only) ----

  /** `activeOnly` is what a country picker/dropdown should pass — omit it for the Countries management page, which wants everything. */
  async listCountries(filter: CountryListFilter = {}, scope?: WorkspaceScope): Promise<CountryListResult> {
    return this.scopedRequest<CountryListResult>("GET", `/auth/admin/countries${queryString(filter)}`, undefined, scope);
  }

  async createCountry(input: CreateCountryInput, scope?: WorkspaceScope): Promise<CountrySummary> {
    return this.scopedRequest("POST", "/auth/admin/countries", input, scope);
  }

  async getCountry(countryId: string, scope?: WorkspaceScope): Promise<CountrySummary> {
    return this.scopedRequest("GET", `/auth/admin/countries/${encodeURIComponent(countryId)}`, undefined, scope);
  }

  async updateCountry(countryId: string, input: UpdateCountryInput, scope?: WorkspaceScope): Promise<CountrySummary> {
    return this.scopedRequest("PATCH", `/auth/admin/countries/${encodeURIComponent(countryId)}`, input, scope);
  }

  /** Soft-delete: the row stops appearing in listings but survives for audit purposes. */
  async deleteCountry(countryId: string, reason?: string, scope?: WorkspaceScope): Promise<void> {
    await this.scopedRequest("DELETE", `/auth/admin/countries/${encodeURIComponent(countryId)}`, reason ? { reason } : undefined, scope);
  }

  async activateCountry(countryId: string, scope?: WorkspaceScope): Promise<void> {
    await this.scopedRequest("POST", `/auth/admin/countries/${encodeURIComponent(countryId)}/activate`, undefined, scope);
  }

  async deactivateCountry(countryId: string, scope?: WorkspaceScope): Promise<void> {
    await this.scopedRequest("POST", `/auth/admin/countries/${encodeURIComponent(countryId)}/deactivate`, undefined, scope);
  }

  // ---- languages (base backend variant only) ----

  /** `activeOnly` is what a language picker/dropdown should pass — omit it for the Languages management page, which wants everything. */
  async listLanguages(filter: LanguageListFilter = {}, scope?: WorkspaceScope): Promise<LanguageListResult> {
    return this.scopedRequest<LanguageListResult>("GET", `/auth/admin/languages${queryString(filter)}`, undefined, scope);
  }

  async createLanguage(input: CreateLanguageInput, scope?: WorkspaceScope): Promise<LanguageSummary> {
    return this.scopedRequest("POST", "/auth/admin/languages", input, scope);
  }

  async getLanguage(languageId: string, scope?: WorkspaceScope): Promise<LanguageSummary> {
    return this.scopedRequest("GET", `/auth/admin/languages/${encodeURIComponent(languageId)}`, undefined, scope);
  }

  async updateLanguage(languageId: string, input: UpdateLanguageInput, scope?: WorkspaceScope): Promise<LanguageSummary> {
    return this.scopedRequest("PATCH", `/auth/admin/languages/${encodeURIComponent(languageId)}`, input, scope);
  }

  /** Soft-delete: the row stops appearing in listings but survives for audit purposes. */
  async deleteLanguage(languageId: string, reason?: string, scope?: WorkspaceScope): Promise<void> {
    await this.scopedRequest("DELETE", `/auth/admin/languages/${encodeURIComponent(languageId)}`, reason ? { reason } : undefined, scope);
  }

  async activateLanguage(languageId: string, scope?: WorkspaceScope): Promise<void> {
    await this.scopedRequest("POST", `/auth/admin/languages/${encodeURIComponent(languageId)}/activate`, undefined, scope);
  }

  async deactivateLanguage(languageId: string, scope?: WorkspaceScope): Promise<void> {
    await this.scopedRequest("POST", `/auth/admin/languages/${encodeURIComponent(languageId)}/deactivate`, undefined, scope);
  }

  // ---- customers (base backend variant only) ----
  // End-users managed by admins — no login capability, and not related to the admin UserSummary above.

  /** `activeOnly` is what a customer picker/dropdown should pass — omit it for the Customers management page, which wants everything. */
  async listCustomers(filter: CustomerListFilter = {}, scope?: WorkspaceScope): Promise<CustomerListResult> {
    return this.scopedRequest<CustomerListResult>("GET", `/auth/admin/customers${queryString(filter)}`, undefined, scope);
  }

  async createCustomer(input: CreateCustomerInput, scope?: WorkspaceScope): Promise<CustomerSummary> {
    return this.scopedRequest("POST", "/auth/admin/customers", input, scope);
  }

  async getCustomer(customerId: string, scope?: WorkspaceScope): Promise<CustomerSummary> {
    return this.scopedRequest("GET", `/auth/admin/customers/${encodeURIComponent(customerId)}`, undefined, scope);
  }

  async updateCustomer(customerId: string, input: UpdateCustomerInput, scope?: WorkspaceScope): Promise<CustomerSummary> {
    return this.scopedRequest("PATCH", `/auth/admin/customers/${encodeURIComponent(customerId)}`, input, scope);
  }

  /** Soft-delete: the row stops appearing in listings but survives for audit purposes. */
  async deleteCustomer(customerId: string, reason?: string, scope?: WorkspaceScope): Promise<void> {
    await this.scopedRequest("DELETE", `/auth/admin/customers/${encodeURIComponent(customerId)}`, reason ? { reason } : undefined, scope);
  }

  async activateCustomer(customerId: string, scope?: WorkspaceScope): Promise<void> {
    await this.scopedRequest("POST", `/auth/admin/customers/${encodeURIComponent(customerId)}/activate`, undefined, scope);
  }

  async deactivateCustomer(customerId: string, scope?: WorkspaceScope): Promise<void> {
    await this.scopedRequest("POST", `/auth/admin/customers/${encodeURIComponent(customerId)}/deactivate`, undefined, scope);
  }

  // ---- transport ----

  /** Unauthenticated call — no Authorization header, no refresh-on-401 retry (there's no session to refresh yet). */
  private async anonymousRequest<T>(method: string, path: string, body?: unknown): Promise<T> {
    return this.rawFetch<T>(method, path, body);
  }

  /** Authenticated and never workspace-scoped: it has no parameter with which to name a workspace. */
  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    return this.authedRequest<T>(method, path, body, undefined);
  }

  /** Authenticated and workspace-scoped: sends `X-Workspace-Id` when the call or the client names one. */
  private async scopedRequest<T>(method: string, path: string, body: unknown, scope: WorkspaceScope | undefined): Promise<T> {
    return this.authedRequest<T>(method, path, body, await this.resolveWorkspaceId(scope));
  }

  /** `undefined` from here means "send no header" — the plain variant's permanent answer. */
  private async resolveWorkspaceId(scope?: WorkspaceScope): Promise<string | undefined> {
    if (scope && scope.workspaceId !== undefined) return scope.workspaceId ?? undefined;
    return (await this.getActiveWorkspace()) ?? undefined;
  }

  /**
   * Attaches the stored access token, and on a 401 makes exactly one `refresh()` attempt before
   * retrying once — if refresh itself fails, clears storage and surfaces the original error so
   * the app can route to its login screen. The retry reuses the workspace already resolved for
   * the first attempt, so a resolver function cannot answer differently mid-call.
   */
  private async authedRequest<T>(method: string, path: string, body: unknown, workspaceId: string | undefined, isRetry = false): Promise<T> {
    const tokens = await this.opts.storage.get();
    if (!tokens) throw new AuthApiError("not logged in", 401);

    try {
      return await this.rawFetch<T>(method, path, body, tokens.accessToken, workspaceId);
    } catch (err) {
      if (err instanceof AuthApiError && err.status === 401 && !isRetry) {
        try {
          await this.refresh();
        } catch (refreshErr) {
          await this.opts.storage.clear();
          throw refreshErr;
        }
        return this.authedRequest<T>(method, path, body, workspaceId, true);
      }
      throw err;
    }
  }

  private async rawFetch<T>(method: string, path: string, body?: unknown, bearerToken?: string, workspaceId?: string): Promise<T> {
    const response = await fetch(`${this.opts.baseUrl}${path}`, {
      method,
      headers: {
        "content-type": "application/json",
        ...(bearerToken ? { authorization: `Bearer ${bearerToken}` } : {}),
        ...(workspaceId ? { [WORKSPACE_HEADER]: workspaceId } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    const envelope: unknown = await response.json().catch(() => undefined);
    if (!response.ok) {
      const errorBody = envelope && typeof envelope === "object" ? (envelope as Record<string, unknown>) : {};
      const message = typeof errorBody.message === "string" ? errorBody.message : response.statusText;
      const code = typeof errorBody.code === "string" ? errorBody.code : undefined;
      throw new AuthApiError(message, response.status, code);
    }
    // Every successful response is `{success, statusCode, message, data}` — unwrapped here, once,
    // so every method above returns the payload directly and never has to know the envelope exists.
    const payload = envelope && typeof envelope === "object" && "data" in envelope ? (envelope as { data: unknown }).data : envelope;
    return payload as T;
  }
}
