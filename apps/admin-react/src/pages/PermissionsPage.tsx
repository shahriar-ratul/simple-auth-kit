import { type FormEvent, useCallback, useEffect, useState } from "react";
import type { DefinePermissionInput, PermissionSummary } from "@easy-auth/auth-client";
import { AuthApiError } from "@easy-auth/auth-client";
import { PERMISSIONS, useAbility } from "@/lib/ability";
import { authClient } from "@/lib/auth-client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

/** One dialog serves both create (slug editable) and edit (slug fixed) — `definePermission` upserts on slug. */
type DialogState = { mode: "create" } | { mode: "edit"; permission: PermissionSummary };

interface PermissionGroup {
  name: string;
  groupOrder: number;
  permissions: PermissionSummary[];
}

/** Client-side grouping: by `group`, groups ordered by `groupOrder`, permissions within a group ordered by `order`. */
function groupPermissions(permissions: PermissionSummary[]): PermissionGroup[] {
  const byGroup = new Map<string, PermissionSummary[]>();
  for (const permission of permissions) {
    const list = byGroup.get(permission.group) ?? [];
    list.push(permission);
    byGroup.set(permission.group, list);
  }
  const groups = Array.from(byGroup.entries()).map(([name, list]) => ({
    name,
    groupOrder: Math.min(...list.map((p) => p.groupOrder)),
    permissions: [...list].sort((a, b) => a.order - b.order),
  }));
  groups.sort((a, b) => a.groupOrder - b.groupOrder);
  return groups;
}

export function PermissionsPage() {
  const ability = useAbility();
  const canDefine = ability.can(PERMISSIONS.permissionsDefine, "permission");

  const [permissions, setPermissions] = useState<PermissionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialogState, setDialogState] = useState<DialogState | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setPermissions(await authClient.listPermissions());
    } catch (err) {
      setError(err instanceof AuthApiError ? err.message : "Couldn't load permissions. Check that the backend is running, then try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const groups = groupPermissions(permissions);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Permissions</h1>
          <p className="text-sm text-muted-foreground">The full capability catalog, grouped the way the console reads it elsewhere.</p>
        </div>
        {canDefine ? <Button onClick={() => setDialogState({ mode: "create" })}>New permission</Button> : null}
      </div>

      <Card>
        <CardContent className="pt-6">
          {error ? <p className="mb-4 text-sm text-destructive">{error}</p> : null}
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : permissions.length === 0 ? (
            <p className="text-sm text-muted-foreground">No permissions defined yet.</p>
          ) : (
            <div className="flex flex-col gap-6">
              {groups.map((group) => (
                <div key={group.name}>
                  <h2 className="mb-2 text-sm font-semibold text-muted-foreground">{group.name}</h2>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Slug</TableHead>
                        <TableHead>Display name</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead>Status</TableHead>
                        {canDefine ? <TableHead className="text-right">Actions</TableHead> : null}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {group.permissions.map((permission) => (
                        <TableRow key={permission.id}>
                          <TableCell className="font-mono text-xs">{permission.slug}</TableCell>
                          <TableCell className="font-medium">{permission.displayName}</TableCell>
                          <TableCell className="max-w-xs truncate text-muted-foreground" title={permission.description ?? undefined}>
                            {permission.description ?? "—"}
                          </TableCell>
                          <TableCell>
                            <Badge variant={permission.isActive ? "success" : "destructive"}>{permission.isActive ? "Active" : "Inactive"}</Badge>
                          </TableCell>
                          {canDefine ? (
                            <TableCell className="text-right">
                              <Button size="sm" variant="outline" onClick={() => setDialogState({ mode: "edit", permission })}>
                                Edit
                              </Button>
                            </TableCell>
                          ) : null}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <DefinePermissionDialog
        state={dialogState}
        onClose={() => setDialogState(null)}
        onSaved={(permission) => {
          setPermissions((prev) => {
            const index = prev.findIndex((p) => p.id === permission.id);
            if (index === -1) return [...prev, permission];
            const next = [...prev];
            next[index] = permission;
            return next;
          });
          setDialogState(null);
        }}
      />
    </div>
  );
}

function DefinePermissionDialog({
  state,
  onClose,
  onSaved,
}: {
  state: DialogState | null;
  onClose: () => void;
  onSaved: (permission: PermissionSummary) => void;
}) {
  const [slug, setSlug] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [description, setDescription] = useState("");
  const [group, setGroup] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);

  const key = state ? (state.mode === "edit" ? state.permission.id : "__create__") : null;

  // Seed from the permission being edited (or blank, for create), once per open.
  if (state && loadedFor !== key) {
    setLoadedFor(key);
    if (state.mode === "edit") {
      setSlug(state.permission.slug);
      setDisplayName(state.permission.displayName);
      setDescription(state.permission.description ?? "");
      setGroup(state.permission.group);
      setIsActive(state.permission.isActive);
    } else {
      setSlug("");
      setDisplayName("");
      setDescription("");
      setGroup("");
      setIsActive(true);
    }
    setError(null);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!state) return;
    setSubmitting(true);
    setError(null);
    try {
      const input: DefinePermissionInput = {
        slug,
        displayName: displayName.trim() === "" ? undefined : displayName,
        description: description.trim() === "" ? null : description,
        group: group.trim() === "" ? undefined : group,
        ...(state.mode === "edit" ? { isActive } : {}),
      };
      const permission = await authClient.definePermission(input);
      onSaved(permission);
    } catch (err) {
      setError(err instanceof AuthApiError ? err.message : "Couldn't save the permission. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  function handleClose() {
    setLoadedFor(null);
    onClose();
  }

  return (
    <Modal
      isOpen={state !== null}
      onClose={handleClose}
      title={state?.mode === "edit" ? "Edit permission" : "New permission"}
      description={
        state?.mode === "edit"
          ? `Updates the "${state.permission.slug}" capability.`
          : "Defines a new capability in the catalog, keyed on its slug."
      }
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="permission-slug">Slug</Label>
          <Input
            id="permission-slug"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            placeholder="e.g. reports:export"
            required
            disabled={state?.mode === "edit"}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="permission-displayName">Display name</Label>
          <Input id="permission-displayName" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Defaults to the slug" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="permission-description">Description</Label>
          <Input id="permission-description" value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="permission-group">Group</Label>
          <Input id="permission-group" value={group} onChange={(e) => setGroup(e.target.value)} placeholder='Defaults to "Custom"' />
        </div>
        {state?.mode === "edit" ? (
          <div className="flex items-center gap-2">
            <input
              id="permission-isActive"
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="h-4 w-4 rounded border-input"
            />
            <Label htmlFor="permission-isActive">Active</Label>
          </div>
        ) : null}
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <div className="flex gap-2">
          <Button type="submit" disabled={submitting}>
            {submitting ? "Saving…" : "Save"}
          </Button>
          <Button type="button" variant="outline" onClick={handleClose}>
            Cancel
          </Button>
        </div>
      </form>
    </Modal>
  );
}
