"use client";

import { useAbility } from "@casl/react";
import { observer } from "mobx-react-lite";
import { useCallback, useEffect, useState } from "react";
import type { WorkspaceMember } from "@easy-auth/auth-client";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PERMISSIONS, hasPermission, missingPermissionHint, type AppAbility } from "@/lib/ability";
import { authClient } from "@/lib/auth-client";
import { errorMessage } from "@/lib/error";
import { useAuthStore, useWorkspaceStore } from "@/lib/stores/store-context";

/** Roles are a set, entered and shown as a comma-separated list — the backend replaces the whole set. */
function parseRoles(input: string): string[] {
  return [...new Set(input.split(",").map((role) => role.trim()).filter(Boolean))];
}

export default observer(function MembersPage() {
  const store = useAuthStore();
  const workspaces = useWorkspaceStore();
  const ability = useAbility<AppAbility>();
  const canManageMembers = hasPermission(ability, PERMISSIONS.membersManage);
  const canAssignRoles = hasPermission(ability, PERMISSIONS.rolesAssign);

  const activeWorkspaceId = workspaces.activeWorkspaceId;
  const workspaceName = workspaces.activeWorkspace?.name ?? "this workspace";

  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRoles, setInviteRoles] = useState("member");
  const [adding, setAdding] = useState(false);

  const [editingMemberId, setEditingMemberId] = useState<string | null>(null);
  const [editingRoles, setEditingRoles] = useState("");
  const [pendingMemberId, setPendingMemberId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setMembers(await authClient.listWorkspaceMembers());
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  // Re-runs on every workspace switch: membership is the one thing that is entirely per-workspace.
  useEffect(() => {
    if (!activeWorkspaceId) return;
    void load();
  }, [activeWorkspaceId, load]);

  async function handleAddMember(event: React.FormEvent) {
    event.preventDefault();
    setAdding(true);
    setError(null);
    setNotice(null);
    try {
      const member = await authClient.addWorkspaceMember({ email: inviteEmail.trim(), roles: parseRoles(inviteRoles) });
      setMembers((prev) => [...prev, member]);
      setInviteEmail("");
      setInviteRoles("member");
      setNotice(`Member added: ${member.email}.`);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setAdding(false);
    }
  }

  async function handleSetRoles(member: WorkspaceMember) {
    setPendingMemberId(member.memberId);
    setError(null);
    setNotice(null);
    try {
      const result = await authClient.setWorkspaceMemberRoles(member.memberId, parseRoles(editingRoles));
      setMembers((prev) => prev.map((m) => (m.memberId === member.memberId ? { ...m, roles: result.roles } : m)));
      setEditingMemberId(null);
      setNotice(`Roles set for ${member.email}.`);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPendingMemberId(null);
    }
  }

  async function handleRemoveMember(member: WorkspaceMember) {
    setPendingMemberId(member.memberId);
    setError(null);
    setNotice(null);
    try {
      await authClient.removeWorkspaceMember(member.memberId);
      setMembers((prev) => prev.filter((m) => m.memberId !== member.memberId));
      setNotice(`Member removed: ${member.email}.`);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPendingMemberId(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {error && <Alert variant="destructive">{error}</Alert>}
      {notice && <Alert variant="success">{notice}</Alert>}

      <Card>
        <CardHeader>
          <CardTitle>Add a member</CardTitle>
          <CardDescription>
            The person must already have an account on this deployment — adding them puts that existing account into {workspaceName}.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="flex flex-wrap items-end gap-2" onSubmit={handleAddMember}>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="inviteEmail">Email</Label>
              <Input
                id="inviteEmail"
                type="email"
                required
                className="w-64"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="teammate@example.com"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="inviteRoles">Roles</Label>
              <Input id="inviteRoles" className="w-56" value={inviteRoles} onChange={(e) => setInviteRoles(e.target.value)} placeholder="member" />
            </div>
            <Button
              type="submit"
              disabled={adding || !canManageMembers}
              title={canManageMembers ? undefined : missingPermissionHint(PERMISSIONS.membersManage)}
            >
              {adding ? "Adding member…" : "Add member"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Members</CardTitle>
          <CardDescription>Everyone in {workspaceName}, and what each of them may do here.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Roles</TableHead>
                <TableHead>Joined</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map((member) => {
                // The backend refuses both of these against your own membership — it would leave
                // a workspace with no administrator and no route back in. Say so, don't 403.
                const isSelf = member.userId === store.currentUser?.sub;
                const busy = pendingMemberId === member.memberId;
                const editing = editingMemberId === member.memberId;
                return (
                  <TableRow key={member.memberId}>
                    <TableCell className="font-medium">
                      {member.email}
                      {isSelf && (
                        <Badge variant="outline" className="ml-2">
                          You
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {editing ? (
                        <div className="flex items-center gap-2">
                          <Input className="h-8 w-56" value={editingRoles} onChange={(e) => setEditingRoles(e.target.value)} autoFocus />
                          <Button size="sm" disabled={busy} onClick={() => void handleSetRoles(member)}>
                            {busy ? "Saving…" : "Save"}
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setEditingMemberId(null)}>
                            Cancel
                          </Button>
                        </div>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {member.roles.length === 0 && <span className="text-xs text-muted-foreground">—</span>}
                          {member.roles.map((role) => (
                            <Badge key={role} variant="outline">
                              {role}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{new Date(member.createdAt).toLocaleString()}</TableCell>
                    <TableCell className="space-x-2 text-right">
                      {!editing && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy || isSelf || !canAssignRoles}
                          title={
                            isSelf
                              ? "You can't change your own roles."
                              : canAssignRoles
                                ? undefined
                                : missingPermissionHint(PERMISSIONS.rolesAssign)
                          }
                          onClick={() => {
                            setEditingMemberId(member.memberId);
                            setEditingRoles(member.roles.join(", "));
                          }}
                        >
                          Set roles
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={busy || isSelf || !canManageMembers}
                        title={
                          isSelf
                            ? "You can't remove yourself from a workspace you administer."
                            : canManageMembers
                              ? undefined
                              : missingPermissionHint(PERMISSIONS.membersManage)
                        }
                        onClick={() => void handleRemoveMember(member)}
                      >
                        Remove member
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
              {members.length === 0 && !loading && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-sm text-muted-foreground">
                    No members yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
});
