import { type FormEvent, useCallback, useEffect, useState } from "react";
import { observer } from "mobx-react-lite";
import type { WorkspaceMember } from "@easy-auth/auth-client";
import { AuthApiError } from "@easy-auth/auth-client";
import { PERMISSIONS, useAbility } from "@/lib/ability";
import { authClient } from "@/lib/auth-client";
import { useAuthStore, useWorkspaceStore } from "@/stores/store-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

/** Roles are a list on the wire and a comma-separated string in the form; one pair of helpers, used by both forms. */
function parseRoles(value: string): string[] {
  return value
    .split(",")
    .map((role) => role.trim())
    .filter((role) => role.length > 0);
}

export const MembersPage = observer(function MembersPage() {
  const ability = useAbility();
  const workspaceStore = useWorkspaceStore();
  const authStore = useAuthStore();
  const canManageMembers = ability.can(PERMISSIONS.membersManage, "permission");
  const canAssignRoles = ability.can(PERMISSIONS.rolesAssign, "permission");

  const workspaceName = workspaceStore.activeWorkspace?.name ?? "this workspace";
  const activeWorkspaceId = workspaceStore.activeWorkspaceId;
  const currentUserId = authStore.currentUser?.sub ?? null;

  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editing, setEditing] = useState<WorkspaceMember | null>(null);
  const [removing, setRemoving] = useState<WorkspaceMember | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setMembers(await authClient.listWorkspaceMembers());
    } catch (err) {
      setError(err instanceof AuthApiError ? err.message : "Couldn't load members. Check that the backend is running, then try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  // Keyed on the active workspace: switching re-runs it, so the table can never show one
  // workspace's members under another's name.
  useEffect(() => {
    void load();
  }, [load, activeWorkspaceId]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Members</h1>
        <p className="text-sm text-muted-foreground">Who belongs to {workspaceName}, and what each of them may do here.</p>
      </div>

      {canManageMembers ? (
        <AddMemberCard
          onAdded={(member, message) => {
            setMembers((prev) => [...prev, member]);
            setNotice(message);
          }}
        />
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Members of {workspaceName}</CardTitle>
        </CardHeader>
        <CardContent>
          {error ? <p className="mb-4 text-sm text-destructive">{error}</p> : null}
          {notice ? <p className="mb-4 text-sm text-emerald-600">{notice}</p> : null}
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : members.length === 0 ? (
            <p className="text-sm text-muted-foreground">No members yet. Add someone by the email they signed up with.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Roles</TableHead>
                  <TableHead>Joined</TableHead>
                  {canManageMembers || canAssignRoles ? <TableHead className="text-right">Actions</TableHead> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {members.map((member) => {
                  const isYou = member.userId === currentUserId;
                  return (
                    <TableRow key={member.memberId}>
                      <TableCell className="font-medium">
                        {member.email}
                        {isYou ? <span className="ml-2 text-xs font-normal text-muted-foreground">you</span> : null}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {member.roles.length === 0 ? (
                            <span className="text-muted-foreground">—</span>
                          ) : (
                            member.roles.map((role) => (
                              <Badge key={role} variant="secondary">
                                {role}
                              </Badge>
                            ))
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{new Date(member.createdAt).toLocaleDateString()}</TableCell>
                      {canManageMembers || canAssignRoles ? (
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            {/* The backend refuses both actions against your own membership — an
                                administrator who demoted or removed themselves would leave the
                                workspace with no way back in — so they aren't offered. */}
                            {canAssignRoles && !isYou ? (
                              <Button size="sm" variant="outline" onClick={() => setEditing(member)}>
                                Set roles
                              </Button>
                            ) : null}
                            {canManageMembers && !isYou ? (
                              <Button size="sm" variant="destructive" onClick={() => setRemoving(member)}>
                                Remove member
                              </Button>
                            ) : null}
                          </div>
                        </TableCell>
                      ) : null}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <SetRolesDialog
        member={editing}
        onClose={() => setEditing(null)}
        onSaved={(memberId, roles, message) => {
          setMembers((prev) => prev.map((m) => (m.memberId === memberId ? { ...m, roles } : m)));
          setNotice(message);
          setEditing(null);
          // Your own roles in this workspace can change as a side effect of nothing here, but the
          // workspace list carries them, so keep it honest.
          void workspaceStore.reload();
        }}
      />

      <RemoveMemberDialog
        member={removing}
        onClose={() => setRemoving(null)}
        onRemoved={(memberId, message) => {
          setMembers((prev) => prev.filter((m) => m.memberId !== memberId));
          setNotice(message);
          setRemoving(null);
        }}
      />
    </div>
  );
});

function AddMemberCard({ onAdded }: { onAdded: (member: WorkspaceMember, message: string) => void }) {
  const [email, setEmail] = useState("");
  const [roles, setRoles] = useState("member");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const member = await authClient.addWorkspaceMember({ email, roles: parseRoles(roles) });
      onAdded(member, `${member.email} added to the workspace.`);
      setEmail("");
      setRoles("member");
    } catch (err) {
      setError(
        err instanceof AuthApiError
          ? err.status === 404
            ? "No account uses that email. They need to sign up first — this adds an existing account, it doesn't send an invitation."
            : err.message
          : "Couldn't add the member. Try again.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Add member</CardTitle>
        <CardDescription>Adds an account that already exists on this deployment. There's no email invitation.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="member-email">Email</Label>
            <Input id="member-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-64" required />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="member-roles">Roles</Label>
            <Input id="member-roles" value={roles} onChange={(e) => setRoles(e.target.value)} placeholder="member" className="w-64" />
          </div>
          <Button type="submit" disabled={submitting}>
            {submitting ? "Adding…" : "Add member"}
          </Button>
          {error ? <p className="w-full text-sm text-destructive">{error}</p> : null}
        </form>
      </CardContent>
    </Card>
  );
}

function SetRolesDialog({
  member,
  onClose,
  onSaved,
}: {
  member: WorkspaceMember | null;
  onClose: () => void;
  onSaved: (memberId: string, roles: string[], message: string) => void;
}) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);

  // Seed the field from the member the dialog was opened for, once per open.
  if (member && loadedFor !== member.memberId) {
    setLoadedFor(member.memberId);
    setValue(member.roles.join(", "));
    setError(null);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!member) return;
    setSubmitting(true);
    setError(null);
    try {
      const roles = parseRoles(value);
      const result = await authClient.setWorkspaceMemberRoles(member.memberId, roles);
      onSaved(member.memberId, result.roles, `Roles for ${member.email} set to ${result.roles.join(", ") || "none"}.`);
    } catch (err) {
      setError(err instanceof AuthApiError ? err.message : "Couldn't set roles. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  function handleClose() {
    setLoadedFor(null);
    onClose();
  }

  return (
    <Dialog open={member !== null} onOpenChange={(next) => !next && handleClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Set roles</DialogTitle>
          <DialogDescription>{member ? `Replaces every role ${member.email} holds in this workspace.` : ""}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="set-roles">Roles</Label>
            <Input id="set-roles" value={value} onChange={(e) => setValue(e.target.value)} placeholder="admin, member" />
            <p className="text-xs text-muted-foreground">Comma-separated. Leave empty to remove every role — they stay a member with no permissions.</p>
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <div className="flex gap-2">
            <Button type="submit" disabled={submitting}>
              {submitting ? "Saving…" : "Set roles"}
            </Button>
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancel
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RemoveMemberDialog({
  member,
  onClose,
  onRemoved,
}: {
  member: WorkspaceMember | null;
  onClose: () => void;
  onRemoved: (memberId: string, message: string) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleRemove() {
    if (!member) return;
    setSubmitting(true);
    setError(null);
    try {
      await authClient.removeWorkspaceMember(member.memberId);
      onRemoved(member.memberId, `${member.email} removed from the workspace.`);
    } catch (err) {
      setError(err instanceof AuthApiError ? err.message : "Couldn't remove the member. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={member !== null} onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Remove member</DialogTitle>
          <DialogDescription>
            {member
              ? `${member.email} loses access to this workspace, along with any permission granted to them directly here. Their account and their other workspaces are untouched.`
              : ""}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <div className="flex gap-2">
            <Button variant="destructive" disabled={submitting} onClick={handleRemove}>
              {submitting ? "Removing…" : "Remove member"}
            </Button>
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
