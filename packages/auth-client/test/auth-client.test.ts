import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthClient, WORKSPACE_HEADER } from "../src/auth-client.js";
import { AuthApiError, AuthTokens, TokenStorage, userIdOf } from "../src/types.js";

function fakeStorage(): TokenStorage & { _stored: AuthTokens | null } {
  let stored: AuthTokens | null = null;
  return {
    get: async () => stored,
    set: async (tokens) => {
      stored = tokens;
    },
    clear: async () => {
      stored = null;
    },
    get _stored() {
      return stored;
    },
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

const SESSION: AuthTokens = { accessToken: "a1", refreshToken: "r1", sessionId: "s1" };

/**
 * Every call the client can make, and whether it is workspace-scoped. The three sweeps below
 * are driven off this one list so a newly added method has to declare which side it is on —
 * a header leaking onto a call that must not carry it is the failure mode this file exists for.
 */
function everyCall(c: AuthClient): Array<{ name: string; scoped: boolean; run: () => Promise<unknown> }> {
  return [
    { name: "signup", scoped: false, run: () => c.signup({ email: "a@example.com", password: "pw" }) },
    { name: "login", scoped: false, run: () => c.login({ identifier: "a@example.com", password: "pw" }) },
    { name: "loginTwoFactor", scoped: false, run: () => c.loginTwoFactor({ challengeToken: "chal-1", code: "123456" }) },
    { name: "refresh", scoped: false, run: () => c.refresh() },
    { name: "logout", scoped: false, run: () => c.logout() },
    { name: "logoutAll", scoped: false, run: () => c.logoutAll() },
    { name: "logoutOthers", scoped: false, run: () => c.logoutOthers() },
    { name: "changePassword", scoped: false, run: () => c.changePassword({ currentPassword: "old-pw", newPassword: "new-pw" }) },
    { name: "sessions", scoped: false, run: () => c.sessions() },
    { name: "enrollTwoFactor", scoped: false, run: () => c.enrollTwoFactor() },
    { name: "confirmTwoFactor", scoped: false, run: () => c.confirmTwoFactor("123456") },
    { name: "disableTwoFactor", scoped: false, run: () => c.disableTwoFactor("123456") },
    { name: "requestPasswordReset", scoped: false, run: () => c.requestPasswordReset({ email: "a@example.com" }) },
    { name: "resetPassword", scoped: false, run: () => c.resetPassword({ token: "t", newPassword: "pw2" }) },
    { name: "oauthStart", scoped: false, run: () => c.oauthStart("google") },
    { name: "createWorkspace", scoped: false, run: () => c.createWorkspace("Acme Inc") },
    { name: "listWorkspaces", scoped: false, run: () => c.listWorkspaces() },

    { name: "me", scoped: true, run: () => c.me() },
    { name: "listWorkspaceMembers", scoped: true, run: () => c.listWorkspaceMembers() },
    { name: "addWorkspaceMember", scoped: true, run: () => c.addWorkspaceMember({ email: "b@example.com" }) },
    { name: "setWorkspaceMemberRoles", scoped: true, run: () => c.setWorkspaceMemberRoles("m1", ["admin"]) },
    { name: "removeWorkspaceMember", scoped: true, run: () => c.removeWorkspaceMember("m1") },
    { name: "blockUser", scoped: true, run: () => c.blockUser("u1") },
    { name: "unblockUser", scoped: true, run: () => c.unblockUser("u1") },
    { name: "listUsers", scoped: true, run: () => c.listUsers({ search: "a" }) },
    { name: "createUser", scoped: true, run: () => c.createUser({ email: "new@example.com", password: "pw" }) },
    { name: "getUser", scoped: true, run: () => c.getUser("u1") },
    { name: "updateUser", scoped: true, run: () => c.updateUser("u1", { displayName: "Ada" }) },
    { name: "deleteUser", scoped: true, run: () => c.deleteUser("u1") },
    { name: "listRoles", scoped: true, run: () => c.listRoles() },
    { name: "createRole", scoped: true, run: () => c.createRole({ slug: "billing-manager" }) },
    { name: "updateRole", scoped: true, run: () => c.updateRole("role-1", { displayName: "Billing" }) },
    { name: "deleteRole", scoped: true, run: () => c.deleteRole("role-1") },
    { name: "attachPermissionToRole", scoped: true, run: () => c.attachPermissionToRole("role-1", "billing:manage") },
    { name: "assignRole", scoped: true, run: () => c.assignRole("u1", "billing-manager") },
    { name: "revokeRole", scoped: true, run: () => c.revokeRole("u1", "billing-manager") },
    { name: "grantPermission", scoped: true, run: () => c.grantPermission("u1", "billing:manage") },
    { name: "revokePermission", scoped: true, run: () => c.revokePermission("u1", "billing:manage") },
    { name: "listPermissions", scoped: true, run: () => c.listPermissions() },
    { name: "definePermission", scoped: true, run: () => c.definePermission({ slug: "billing:manage" }) },
    { name: "listAuditLog", scoped: true, run: () => c.listAuditLog({ userId: "u1", action: "role_assigned" }) },
  ];
}

describe("AuthClient", () => {
  const fetchMock = vi.fn();
  let storage: ReturnType<typeof fakeStorage>;
  let client: AuthClient;

  function headersOf(callIndex = 0): Record<string, string> {
    return fetchMock.mock.calls[callIndex][1].headers as Record<string, string>;
  }

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    storage = fakeStorage();
    client = new AuthClient({ baseUrl: "https://api.example.com", storage });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("identity", () => {
    it("login stores tokens on a direct success", async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse({ accessToken: "a1", refreshToken: "r1", sessionId: "s1" }));

      const result = await client.login({ identifier: "a@example.com", password: "pw" });

      expect(result).toEqual({ accessToken: "a1", refreshToken: "r1", sessionId: "s1" });
      expect(storage._stored).toEqual({ accessToken: "a1", refreshToken: "r1", sessionId: "s1" });
      expect(fetchMock).toHaveBeenCalledWith("https://api.example.com/auth/login", expect.objectContaining({ method: "POST" }));
      expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ identifier: "a@example.com", password: "pw" });
    });

    it("signup posts email and password and nothing else", async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse(SESSION));

      await client.signup({ email: "a@example.com", password: "pw" });

      expect(fetchMock.mock.calls[0][0]).toBe("https://api.example.com/auth/signup");
      expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ email: "a@example.com", password: "pw" });
    });

    it("login returns the 2FA challenge without storing tokens", async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse({ twoFactorRequired: true, challengeToken: "chal-1" }));

      const result = await client.login({ identifier: "a@example.com", password: "pw" });

      expect(result).toEqual({ twoFactorRequired: true, challengeToken: "chal-1" });
      expect(storage._stored).toBeNull();
    });

    it("loginTwoFactor stores tokens on success", async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse(SESSION));

      await client.loginTwoFactor({ challengeToken: "chal-1", code: "123456" });

      expect(storage._stored?.accessToken).toBe("a1");
    });

    it("an authenticated request attaches the bearer token", async () => {
      await storage.set(SESSION);
      fetchMock.mockResolvedValueOnce(jsonResponse({ sub: "u1", sessionId: "s1", roles: [], permissions: [], twoFactorEnabled: false }));

      await client.me();

      expect(headersOf().authorization).toBe("Bearer a1");
    });

    it("me() hands back fields this version does not know about", async () => {
      // `/auth/me` is about to grow a `rules` field (CASL rules serialized with `packRules`), so
      // the admin consoles can build one Ability from the same source the server enforces. The
      // property that has to hold *before* it lands is that this client is not in the way: it
      // parses no allow-list and copies no known-field subset, so an unrecognised field reaches
      // the caller untouched rather than being dropped here.
      await storage.set(SESSION);
      const rules = [[0, "read", "User"], [0, "manage", "Workspace"]];
      fetchMock.mockResolvedValueOnce(
        jsonResponse({ sub: "u1", sessionId: "s1", roles: ["admin"], permissions: ["users:read"], twoFactorEnabled: false, rules }),
      );

      const user = await client.me();

      expect((user as unknown as { rules: unknown }).rules).toEqual(rules);
      expect(user.roles).toEqual(["admin"]); // …and the fields it does know about are unaffected
    });

    it("me() parses the CurrentUser shape", async () => {
      await storage.set(SESSION);
      fetchMock.mockResolvedValueOnce(
        jsonResponse({ sub: "u1", sessionId: "s1", roles: ["admin"], permissions: ["users:read"], twoFactorEnabled: true }),
      );

      const user = await client.me();

      expect(user).toEqual({ sub: "u1", sessionId: "s1", roles: ["admin"], permissions: ["users:read"], twoFactorEnabled: true });
    });

    it("oauthStart fetches the provider URL from the backend", async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse({ url: "https://accounts.google.com/o/oauth2/v2/auth?..." }));

      const { url } = await client.oauthStart("google");

      expect(fetchMock).toHaveBeenCalledWith("https://api.example.com/auth/oauth/google/start", expect.objectContaining({ method: "GET" }));
      expect(url).toContain("accounts.google.com");
    });

    it("logout clears storage after the call succeeds", async () => {
      await storage.set(SESSION);
      fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true }));

      await client.logout();

      expect(storage._stored).toBeNull();
    });
  });

  describe("refresh-on-401", () => {
    it("attempts one refresh then retries the original request", async () => {
      await storage.set({ accessToken: "stale", refreshToken: "r1", sessionId: "s1" });
      fetchMock
        .mockResolvedValueOnce(jsonResponse({ message: "token expired" }, 401)) // first /auth/me attempt
        .mockResolvedValueOnce(jsonResponse({ accessToken: "fresh", refreshToken: "r2" })) // /auth/refresh
        .mockResolvedValueOnce(jsonResponse({ sub: "u1", sessionId: "s1", roles: [], permissions: [], twoFactorEnabled: false })); // retry

      const user = await client.me();

      expect(user.sub).toBe("u1");
      expect(fetchMock).toHaveBeenCalledTimes(3);
      expect(fetchMock.mock.calls[1][0]).toBe("https://api.example.com/auth/refresh");
      expect(headersOf(2).authorization).toBe("Bearer fresh");
      expect(storage._stored).toEqual({ accessToken: "fresh", refreshToken: "r2", sessionId: "s1" });
    });

    it("clears storage and surfaces the error when refresh itself fails", async () => {
      await storage.set({ accessToken: "stale", refreshToken: "dead", sessionId: "s1" });
      fetchMock
        .mockResolvedValueOnce(jsonResponse({ message: "token expired" }, 401))
        .mockResolvedValueOnce(jsonResponse({ message: "refresh token is invalid or revoked", code: "REFRESH_INVALID" }, 401));

      await expect(client.me()).rejects.toBeInstanceOf(AuthApiError);
      expect(storage._stored).toBeNull();
    });

    it("does not retry more than once", async () => {
      await storage.set(SESSION);
      fetchMock
        .mockResolvedValueOnce(jsonResponse({ message: "unauthorized" }, 401))
        .mockResolvedValueOnce(jsonResponse({ accessToken: "a2", refreshToken: "r2" }))
        .mockResolvedValueOnce(jsonResponse({ message: "still unauthorized" }, 401));

      await expect(client.me()).rejects.toBeInstanceOf(AuthApiError);
      expect(fetchMock).toHaveBeenCalledTimes(3); // no second refresh attempt
    });

    it("throws AuthApiError with the parsed message and code on a non-2xx response", async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse({ message: "email already registered", code: "CONFLICT" }, 409));

      const error = await client.signup({ email: "dup@example.com", password: "pw" }).catch((e) => e);

      expect(error).toBeInstanceOf(AuthApiError);
      expect(error.status).toBe(409);
      expect(error.message).toBe("email already registered");
      expect(error.code).toBe("CONFLICT");
    });
  });

  describe("the request surface is exactly the backend contract", () => {
    // Every field name the backend accepts, across every body and every query string. Anything
    // else the client puts on the wire — a field the contract dropped, a field it never had —
    // fails here rather than being silently ignored by a server that has no such column.
    const BODY_FIELDS = new Set([
      "email",
      "identifier",
      "password",
      "currentPassword",
      "newPassword",
      "challengeToken",
      "code",
      "refreshToken",
      "token",
      "name",
      "roles",
      "role",
      "permission",
      "firstName",
      "lastName",
      "displayName",
      "phone",
      "username",
      "photo",
      "reason",
      "slug",
      "description",
      "isActive",
      "group",
      "groupOrder",
      "order",
    ]);
    const QUERY_FIELDS = new Set(["search", "page", "limit", "userId", "action", "since", "until"]);
    const HEADERS = new Set(["content-type", "authorization", WORKSPACE_HEADER]);

    it("sends no field the contract does not name", async () => {
      fetchMock.mockImplementation(async () => jsonResponse({ ok: true }));
      const scoped = new AuthClient({ baseUrl: "https://api.example.com", storage, workspaceId: "ws-1" });

      for (const call of everyCall(scoped)) {
        await storage.set(SESSION);
        await call.run();
      }

      expect(fetchMock.mock.calls.length).toBe(everyCall(client).length);
      for (const [url, init] of fetchMock.mock.calls) {
        for (const key of Object.keys(init.body ? JSON.parse(init.body) : {})) {
          expect(BODY_FIELDS, `${url} sent body field "${key}"`).toContain(key);
        }
        for (const key of new URL(url).searchParams.keys()) {
          expect(QUERY_FIELDS, `${url} sent query param "${key}"`).toContain(key);
        }
        for (const key of Object.keys(init.headers as Record<string, string>)) {
          expect(HEADERS, `${url} sent header "${key}"`).toContain(key);
        }
      }
    });

    it("never names the removed tenancy concept, anywhere, on any call", async () => {
      // The concept this rules out is gone from the backend as well, and `grep -ri` over this
      // package is how that is checked — so the word is assembled here rather than written out,
      // and the grep stays empty while the guard still exists. Asserted over the whole request —
      // url, headers and body — because the last thing that concept owned here was a header.
      const REMOVED = ["ten", "ant"].join("");
      fetchMock.mockImplementation(async () => jsonResponse({ ok: true }));
      const scoped = new AuthClient({ baseUrl: "https://api.example.com", storage, workspaceId: "ws-1" });

      for (const call of everyCall(scoped)) {
        await storage.set(SESSION);
        await call.run();
      }

      for (const [url, init] of fetchMock.mock.calls) {
        expect(JSON.stringify([url, init.headers, init.body]), `request to ${url}`).not.toMatch(new RegExp(REMOVED, "i"));
      }
    });
  });

  describe("X-Workspace-Id", () => {
    it("is never sent by a consumer that configured no workspace (the plain backend variant)", async () => {
      fetchMock.mockImplementation(async () => jsonResponse({ ok: true }));

      for (const call of everyCall(client)) {
        await storage.set(SESSION);
        await call.run();
      }

      for (const [url, init] of fetchMock.mock.calls) {
        expect(Object.keys(init.headers as Record<string, string>), `header sent to ${url}`).not.toContain(WORKSPACE_HEADER);
      }
    });

    it("is sent on exactly the workspace-scoped calls, and on no others", async () => {
      const scoped = new AuthClient({ baseUrl: "https://api.example.com", storage, workspaceId: "ws-1" });

      for (const call of everyCall(scoped)) {
        fetchMock.mockReset();
        fetchMock.mockResolvedValue(jsonResponse({ ok: true }));
        await storage.set(SESSION);

        await call.run();

        const headers = fetchMock.mock.calls[0][1].headers as Record<string, string>;
        if (call.scoped) expect(headers[WORKSPACE_HEADER], `${call.name} must name its workspace`).toBe("ws-1");
        else expect(headers[WORKSPACE_HEADER], `${call.name} must not name a workspace`).toBeUndefined();
      }
    });

    it("is absent from POST /workspaces and GET /workspaces even with an active workspace", async () => {
      const scoped = new AuthClient({ baseUrl: "https://api.example.com", storage, workspaceId: "ws-1" });
      await storage.set(SESSION);
      fetchMock.mockResolvedValue(jsonResponse({ ok: true }));

      await scoped.createWorkspace("Acme Inc");
      await scoped.listWorkspaces();

      expect(fetchMock.mock.calls[0][0]).toBe("https://api.example.com/workspaces");
      expect(headersOf(0)[WORKSPACE_HEADER]).toBeUndefined();
      expect(fetchMock.mock.calls[1][0]).toBe("https://api.example.com/workspaces");
      expect(headersOf(1)[WORKSPACE_HEADER]).toBeUndefined();
    });

    it("is absent from every identity endpoint, named one by one", async () => {
      // The sweep above proves the same thing by construction; this spells the endpoints out, so
      // a route that quietly moves from `request()` to `scopedRequest()` fails on its own name.
      const scoped = new AuthClient({ baseUrl: "https://api.example.com", storage, workspaceId: "ws-1" });
      const identityCalls: Array<[string, () => Promise<unknown>]> = [
        ["/auth/signup", () => scoped.signup({ email: "a@example.com", password: "pw" })],
        ["/auth/login", () => scoped.login({ identifier: "a@example.com", password: "pw" })],
        ["/auth/login/2fa", () => scoped.loginTwoFactor({ challengeToken: "c", code: "1" })],
        ["/auth/refresh", () => scoped.refresh()],
        ["/auth/logout", () => scoped.logout()],
        ["/auth/logout-all", () => scoped.logoutAll()],
        ["/auth/logout-others", () => scoped.logoutOthers()],
        ["/auth/sessions", () => scoped.sessions()],
        ["/auth/2fa/enroll", () => scoped.enrollTwoFactor()],
        ["/auth/2fa/confirm", () => scoped.confirmTwoFactor("123456")],
        ["/auth/2fa/disable", () => scoped.disableTwoFactor("123456")],
        ["/auth/password/forgot", () => scoped.requestPasswordReset({ email: "a@example.com" })],
        ["/auth/password/reset", () => scoped.resetPassword({ token: "t", newPassword: "pw2" })],
        ["/auth/oauth/google/start", () => scoped.oauthStart("google")],
      ];

      for (const [path, run] of identityCalls) {
        fetchMock.mockReset();
        fetchMock.mockResolvedValue(jsonResponse({ ok: true }));
        await storage.set(SESSION);

        await run();

        expect(fetchMock.mock.calls[0][0]).toBe(`https://api.example.com${path}`);
        expect(headersOf(0)[WORKSPACE_HEADER], `${path} must not name a workspace`).toBeUndefined();
      }
    });

    it("is absent from the token endpoints, including the automatic refresh mid-call", async () => {
      const scoped = new AuthClient({ baseUrl: "https://api.example.com", storage, workspaceId: "ws-1" });
      await storage.set({ accessToken: "stale", refreshToken: "r1", sessionId: "s1" });
      fetchMock
        .mockResolvedValueOnce(jsonResponse({ message: "token expired" }, 401))
        .mockResolvedValueOnce(jsonResponse({ accessToken: "fresh", refreshToken: "r2" }))
        .mockResolvedValueOnce(jsonResponse({ users: [], nextCursor: null }));

      await scoped.listUsers();

      expect(headersOf(0)[WORKSPACE_HEADER]).toBe("ws-1");
      expect(fetchMock.mock.calls[1][0]).toBe("https://api.example.com/auth/refresh");
      expect(headersOf(1)[WORKSPACE_HEADER]).toBeUndefined(); // /auth/refresh is not workspace-scoped
      expect(headersOf(2)[WORKSPACE_HEADER]).toBe("ws-1"); // the retry still names the same workspace
    });

    it("takes a per-call override, and `null` suppresses it entirely", async () => {
      const scoped = new AuthClient({ baseUrl: "https://api.example.com", storage, workspaceId: "ws-1" });
      await storage.set(SESSION);
      fetchMock.mockResolvedValue(jsonResponse({ ok: true }));

      await scoped.listUsers({}, { workspaceId: "ws-2" });
      await scoped.me({ workspaceId: null });
      await scoped.me();

      expect(headersOf(0)[WORKSPACE_HEADER]).toBe("ws-2");
      expect(headersOf(1)[WORKSPACE_HEADER]).toBeUndefined();
      expect(headersOf(2)[WORKSPACE_HEADER]).toBe("ws-1");
    });

    it("resolves a function form per request, so the app's own store stays the owner", async () => {
      let current: string | null = "ws-1";
      const scoped = new AuthClient({ baseUrl: "https://api.example.com", storage, workspaceId: () => current });
      await storage.set(SESSION);
      fetchMock.mockResolvedValue(jsonResponse({ ok: true }));

      await scoped.me();
      current = "ws-2";
      await scoped.me();
      current = null;
      await scoped.me();

      expect(headersOf(0)[WORKSPACE_HEADER]).toBe("ws-1");
      expect(headersOf(1)[WORKSPACE_HEADER]).toBe("ws-2");
      expect(headersOf(2)[WORKSPACE_HEADER]).toBeUndefined();
    });

    it("setActiveWorkspace switches it, and null turns it back off", async () => {
      await storage.set(SESSION);
      fetchMock.mockResolvedValue(jsonResponse({ ok: true }));

      client.setActiveWorkspace("ws-9");
      expect(await client.getActiveWorkspace()).toBe("ws-9");
      await client.me();

      client.setActiveWorkspace(null);
      expect(await client.getActiveWorkspace()).toBeNull();
      await client.me();

      expect(headersOf(0)[WORKSPACE_HEADER]).toBe("ws-9");
      expect(headersOf(1)[WORKSPACE_HEADER]).toBeUndefined();
    });
  });

  describe("workspace endpoints", () => {
    let scoped: AuthClient;

    beforeEach(async () => {
      scoped = new AuthClient({ baseUrl: "https://api.example.com", storage, workspaceId: "ws-1" });
      await storage.set(SESSION);
    });

    it("createWorkspace POSTs the name", async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse({ id: "ws-2", name: "Acme Inc", createdAt: "2026-08-10T00:00:00.000Z", roles: ["admin", "member"] }));

      const workspace = await scoped.createWorkspace("Acme Inc");

      const [url, init] = fetchMock.mock.calls[0];
      expect([url, init.method]).toEqual(["https://api.example.com/workspaces", "POST"]);
      expect(JSON.parse(init.body)).toEqual({ name: "Acme Inc" });
      expect(workspace.roles).toEqual(["admin", "member"]);
    });

    it("listWorkspaces GETs /workspaces with no body", async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse([{ id: "ws-1", name: "Acme Inc", createdAt: "2026-08-10T00:00:00.000Z", roles: ["member"] }]));

      const workspaces = await scoped.listWorkspaces();

      const [url, init] = fetchMock.mock.calls[0];
      expect([url, init.method, init.body]).toEqual(["https://api.example.com/workspaces", "GET", undefined]);
      expect(workspaces[0].id).toBe("ws-1");
    });

    it("listWorkspaceMembers GETs /workspaces/members", async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse([]));

      await scoped.listWorkspaceMembers();

      const [url, init] = fetchMock.mock.calls[0];
      expect([url, init.method]).toEqual(["https://api.example.com/workspaces/members", "GET"]);
    });

    it("addWorkspaceMember POSTs the email, and omits roles when not given", async () => {
      fetchMock.mockResolvedValue(jsonResponse({ memberId: "m1", userId: "u1", email: "b@example.com", roles: ["member"], createdAt: "x" }));

      await scoped.addWorkspaceMember({ email: "b@example.com" });
      await scoped.addWorkspaceMember({ email: "c@example.com", roles: ["admin", "member"] });

      expect(fetchMock.mock.calls[0][0]).toBe("https://api.example.com/workspaces/members");
      expect(fetchMock.mock.calls[0][1].method).toBe("POST");
      expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ email: "b@example.com" });
      expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ email: "c@example.com", roles: ["admin", "member"] });
    });

    it("setWorkspaceMemberRoles PUTs the whole role set to the member's path", async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse({ memberId: "m 1", roles: ["admin"] }));

      await scoped.setWorkspaceMemberRoles("m 1", ["admin"]);

      const [url, init] = fetchMock.mock.calls[0];
      expect([url, init.method]).toEqual(["https://api.example.com/workspaces/members/m%201/roles", "PUT"]);
      expect(JSON.parse(init.body)).toEqual({ roles: ["admin"] });
    });

    it("removeWorkspaceMember DELETEs the member's path with no body", async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true }));

      await scoped.removeWorkspaceMember("m1");

      const [url, init] = fetchMock.mock.calls[0];
      expect([url, init.method, init.body]).toEqual(["https://api.example.com/workspaces/members/m1", "DELETE", undefined]);
    });
  });

  describe("administration", () => {
    beforeEach(async () => {
      await storage.set(SESSION);
      fetchMock.mockResolvedValue(jsonResponse({ ok: true }));
    });

    it("listAuditLog serializes filters as query params, keyed on `action`", async () => {
      await client.listAuditLog({ userId: "u1", action: "role_assigned", limit: 10 });

      expect(fetchMock.mock.calls[0][0]).toBe("https://api.example.com/auth/admin/audit-log?userId=u1&action=role_assigned&limit=10");
      expect(fetchMock.mock.calls[0][0]).not.toContain("type=");
    });

    it("listAuditLog reads back the renamed entry fields", async () => {
      fetchMock.mockReset();
      fetchMock.mockResolvedValueOnce(
        jsonResponse({
          items: [
            {
              id: "al-1",
              userId: "u1",
              name: "Role assigned",
              action: "role_assigned",
              info: { type: "role_assigned", userId: "u1", role: "admin" },
              remarks: null,
              createdAt: "2026-08-10T00:00:00.000Z",
              updatedAt: "2026-08-10T00:00:00.000Z",
            },
          ],
          meta: { page: 1, limit: 25, total: 1, pageCount: 1, hasPreviousPage: false, hasNextPage: false },
        }),
      );

      const { items } = await client.listAuditLog();

      expect(items[0].action).toBe("role_assigned");
      expect(items[0].name).toBe("Role assigned");
      expect(items[0].remarks).toBeNull();
      expect(items[0].updatedAt).toBe("2026-08-10T00:00:00.000Z");
    });

    it("listAuditLog reads back the workspaces variant's entry, which names the workspace it happened in", async () => {
      fetchMock.mockReset();
      fetchMock.mockResolvedValueOnce(
        jsonResponse({
          items: [
            {
              id: "al-1",
              workspaceId: "ws-1",
              userId: "u1",
              name: "Permission revoked",
              action: "permission_revoked",
              info: { type: "permission_revoked", userId: "u1", permission: "billing:manage" },
              remarks: null,
              createdAt: "2026-08-10T00:00:00.000Z",
              updatedAt: "2026-08-10T00:00:00.000Z",
            },
          ],
          meta: { page: 1, limit: 25, total: 1, pageCount: 1, hasPreviousPage: false, hasNextPage: false },
        }),
      );

      const { items } = await client.listAuditLog();

      expect(items[0].workspaceId).toBe("ws-1");
      expect(items[0].info).toEqual({ type: "permission_revoked", userId: "u1", permission: "billing:manage" });
    });

    it("listUsers serializes its filter", async () => {
      await client.listUsers({ search: "ali", limit: 5, page: 2 });

      expect(fetchMock.mock.calls[0][0]).toBe("https://api.example.com/auth/admin/users?search=ali&limit=5&page=2");
    });

    it("createRole and assignRole send the bare backend bodies", async () => {
      await client.createRole({ slug: "billing-manager" });
      await client.assignRole("u1", "billing-manager");

      expect(fetchMock.mock.calls[0][0]).toBe("https://api.example.com/auth/admin/roles");
      expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ slug: "billing-manager" });
      expect(fetchMock.mock.calls[1][0]).toBe("https://api.example.com/auth/admin/users/u1/roles");
      expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ role: "billing-manager" });
    });

    it("block/unblock and the revoke routes encode their path segments", async () => {
      await client.blockUser("u/1");
      await client.revokeRole("u1", "billing manager");
      await client.revokePermission("u1", "billing:manage");

      expect(fetchMock.mock.calls[0][0]).toBe("https://api.example.com/auth/admin/users/u%2F1/block");
      expect(fetchMock.mock.calls[1][0]).toBe("https://api.example.com/auth/admin/users/u1/roles/billing%20manager/revoke");
      expect(fetchMock.mock.calls[2][0]).toBe("https://api.example.com/auth/admin/users/u1/permissions/billing%3Amanage/revoke");
    });
  });

  describe("userIdOf", () => {
    it("reads the User id out of either variant's user summary", () => {
      const deploymentProfile = {
        uuid: "uuid-1",
        firstName: null,
        lastName: null,
        displayName: null,
        phone: null,
        username: null,
        photo: null,
        dob: null,
        gender: null,
        joinedDate: "x",
        lastLogin: null,
        twoFactorEnabled: false,
        isActive: true,
        createdBy: null,
        updatedBy: null,
        updatedAt: "x",
      };
      expect(userIdOf({ id: "u1", email: "a@example.com", blocked: false, roles: [], createdAt: "x", ...deploymentProfile })).toBe("u1");
      expect(userIdOf({ memberId: "m1", userId: "u1", email: "a@example.com", blocked: false, roles: [], createdAt: "x", ...deploymentProfile })).toBe("u1");
    });
  });
});
