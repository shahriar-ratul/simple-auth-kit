"use client";

import { useAbility } from "@casl/react";
import { observer } from "mobx-react-lite";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { AuthApiError, type PermissionSummary, type RoleSummary } from "@easy-auth/auth-client";
import { toast } from "sonner";
import { Breadcrumb } from "@/components/breadcrumb";
import { FormErrorAlert } from "@/components/form-error-alert";
import { PermissionGroupSelect } from "@/components/permission-group-select";
import { PermissionRequired } from "@/components/permission-required";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Heading } from "@/components/ui/heading";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { PERMISSIONS, hasPermission, type AppAbility } from "@/lib/ability";
import { authClient } from "@/lib/auth-client";
import { errorMessages } from "@/lib/error";
import { useWorkspaceStore } from "@/lib/stores/store-context";
import type { EditRoleFormValues } from "../../role-schema";

const inputClassName = "bg-background border-2 focus:border-purple-500 transition-colors";

function apiErrorMessage(err: unknown, fallback: string): string {
  return err instanceof AuthApiError ? err.message : fallback;
}

function sameSlugs(a: string[], b: string[]): boolean {
  return JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
}

const EditRolePage = observer(function EditRolePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const ability = useAbility<AppAbility>();
  const canManage = hasPermission(ability, PERMISSIONS.rolesManage);
  const canReadPermissions = hasPermission(ability, PERMISSIONS.permissionsRead);
  const workspaces = useWorkspaceStore();
  const activeWorkspaceId = workspaces.activeWorkspaceId;

  const [role, setRole] = useState<RoleSummary | null>(null);
  const [form, setForm] = useState<EditRoleFormValues | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [permissionCatalog, setPermissionCatalog] = useState<PermissionSummary[]>([]);
  const [formError, setFormError] = useState<string[] | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // No single-role endpoint on the client — the list is small, so find by id.
      const roles = await authClient.listRoles();
      const result = roles.find((r) => r.id === id) ?? null;
      setRole(result);
      if (result) {
        setForm({
          displayName: result.displayName,
          description: "",
          isDefault: result.isDefault,
          isActive: result.isActive,
          permissions: result.permissions,
        });
      } else {
        toast.error("Couldn't find this role.");
      }
    } catch (err) {
      toast.error(apiErrorMessage(err, "Couldn't load this role."));
    } finally {
      setLoading(false);
    }
  }, [id]);

  // Roles are per-workspace, so switching workspace has to re-fetch rather than leave the
  // previous workspace's role on screen.
  useEffect(() => {
    if (!canManage || !activeWorkspaceId) return;
    void load();
  }, [canManage, activeWorkspaceId, load]);

  useEffect(() => {
    if (!canReadPermissions || !activeWorkspaceId) return;
    authClient
      .listPermissions({ activeOnly: true })
      .then(setPermissionCatalog)
      .catch((err) => toast.error(apiErrorMessage(err, "Couldn't load the permission catalog.")));
  }, [canReadPermissions, activeWorkspaceId]);

  if (!canManage) return <PermissionRequired permission={PERMISSIONS.rolesManage} what="Editing a role" />;

  function set<K extends keyof EditRoleFormValues>(key: K, value: EditRoleFormValues[K]) {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!role || !form) return;
    setFormError(null);
    setSaving(true);
    try {
      // No bulk "set permissions" endpoint — diffs against the role loaded at mount and attaches/detaches only the delta.
      const toAttach = form.permissions.filter((slug) => !role.permissions.includes(slug));
      const toDetach = role.permissions.filter((slug) => !form.permissions.includes(slug));
      const [updated] = await Promise.all([
        authClient.updateRole(role.id, {
          displayName: form.displayName,
          description: form.description || null,
          isDefault: form.isDefault,
          isActive: form.isActive,
        }),
        ...toAttach.map((slug) => authClient.attachPermissionToRole(role.id, slug)),
        ...toDetach.map((slug) => authClient.detachPermissionFromRole(role.id, slug)),
      ]);
      toast.success(`Role "${updated.name}" updated.`);
      router.push("/roles");
    } catch (err) {
      setFormError(errorMessages(err));
      toast.error(apiErrorMessage(err, "Couldn't update this role. Try again."));
      setSaving(false);
    }
  }

  const unchanged =
    role !== null &&
    form !== null &&
    form.displayName === role.displayName &&
    form.isDefault === role.isDefault &&
    form.isActive === role.isActive &&
    sameSlugs(form.permissions, role.permissions);

  return (
    <div className="flex-1 space-y-4">
      <Breadcrumb
        items={[
          { title: "Roles & permissions", href: "/roles" },
          { title: role?.name ?? "Details", href: `/roles/${id}/edit` },
          { title: "Edit", href: `/roles/${id}/edit` },
        ]}
      />
      <div className="flex items-start justify-between">
        <Heading title="Edit Role" description="Update role details" />
      </div>
      <Separator />

      {loading && !role && <p className="text-sm text-muted-foreground">Loading…</p>}

      {role && form && (
        <Card>
          <CardHeader />
          <CardContent>
            <FormErrorAlert messages={formError} />
            <form onSubmit={handleSubmit} className="space-y-8 w-full">
              <Card className="w-full">
                <CardHeader className="border-b bg-muted/50">
                  <CardTitle className="text-2xl">Role Information</CardTitle>
                  <CardDescription className="text-base">{role.name}</CardDescription>
                </CardHeader>
                <CardContent className="pt-6">
                  <div className="space-y-6">
                    <div className="space-y-4">
                      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Basic Information</h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="flex flex-col gap-1.5">
                          <Label htmlFor="displayName">Display Name</Label>
                          <Input
                            id="displayName"
                            disabled={saving}
                            placeholder="Billing manager"
                            value={form.displayName}
                            onChange={(e) => set("displayName", e.target.value)}
                            type="text"
                            className={inputClassName}
                          />
                        </div>
                        <div className="flex flex-col gap-1.5">
                          <Label htmlFor="description">Description</Label>
                          <Input
                            id="description"
                            disabled={saving}
                            placeholder="Description"
                            value={form.description}
                            onChange={(e) => set("description", e.target.value)}
                            type="text"
                            className={inputClassName}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>

                {canReadPermissions && (
                  <>
                    <CardHeader className="border-b bg-muted/50 mt-6">
                      <CardTitle className="text-2xl">Permissions</CardTitle>
                      <CardDescription className="text-base">Pick the permissions this role grants</CardDescription>
                    </CardHeader>
                    <CardContent className="pt-6">
                      <div className="space-y-4">
                        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Permissions</h3>
                        <PermissionGroupSelect permissions={permissionCatalog} selected={form.permissions} onChange={(next) => set("permissions", next)} />
                      </div>
                    </CardContent>
                  </>
                )}

                <div className="flex flex-wrap justify-center gap-4 mt-6">
                  <div className="flex flex-row items-center space-x-3 rounded-lg border border-purple-500 bg-purple-50 dark:bg-purple-950/20 p-4">
                    <Checkbox id="isDefault" checked={form.isDefault} onCheckedChange={(checked) => set("isDefault", checked === true)} />
                    <div className="space-y-1 leading-none">
                      <Label htmlFor="isDefault" className="text-base font-medium">
                        Default Role
                      </Label>
                      <p className="text-sm text-muted-foreground">Given to every new member of this workspace</p>
                    </div>
                  </div>
                  <div className="flex flex-row items-center space-x-3 rounded-lg border border-purple-500 bg-purple-50 dark:bg-purple-950/20 p-4">
                    <Checkbox id="isActive" checked={form.isActive} onCheckedChange={(checked) => set("isActive", checked === true)} />
                    <div className="space-y-1 leading-none">
                      <Label htmlFor="isActive" className="text-base font-medium">
                        Active Status
                      </Label>
                      <p className="text-sm text-muted-foreground">This role will be active and can be assigned to users</p>
                    </div>
                  </div>
                </div>

                <CardFooter className="flex justify-center gap-4 mt-8 pb-8">
                  <Button type="button" variant="outline" onClick={() => router.push("/roles")} disabled={saving}>
                    Cancel
                  </Button>
                  <Button disabled={saving || unchanged} className="bg-purple-600 hover:bg-purple-700 dark:bg-purple-600 dark:hover:bg-purple-700 min-w-32" type="submit">
                    {saving ? "Updating..." : "Update Role"}
                  </Button>
                </CardFooter>
              </Card>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
});

export default EditRolePage;
