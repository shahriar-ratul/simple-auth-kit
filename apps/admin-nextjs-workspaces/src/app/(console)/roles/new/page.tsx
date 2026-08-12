"use client";

import { useAbility } from "@casl/react";
import { observer } from "mobx-react-lite";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { AuthApiError, type PermissionSummary } from "@easy-auth/auth-client";
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
import { emptyCreateRoleForm, type CreateRoleFormValues } from "../role-schema";

const inputClassName = "bg-background border-2 focus:border-purple-500 transition-colors";

function apiErrorMessage(err: unknown, fallback: string): string {
  return err instanceof AuthApiError ? err.message : fallback;
}

const NewRolePage = observer(function NewRolePage() {
  const ability = useAbility<AppAbility>();
  const canManage = hasPermission(ability, PERMISSIONS.rolesManage);
  const canReadPermissions = hasPermission(ability, PERMISSIONS.permissionsRead);
  const router = useRouter();
  const workspaces = useWorkspaceStore();
  const activeWorkspaceId = workspaces.activeWorkspaceId;
  const workspaceName = workspaces.activeWorkspace?.name ?? "this workspace";

  const [form, setForm] = useState<CreateRoleFormValues>(emptyCreateRoleForm);
  const [permissionCatalog, setPermissionCatalog] = useState<PermissionSummary[]>([]);
  const [formError, setFormError] = useState<string[] | null>(null);
  const [loading, setLoading] = useState(false);

  // Permissions are per-workspace, so the catalog re-fetches on every workspace switch.
  useEffect(() => {
    if (!canReadPermissions || !activeWorkspaceId) return;
    authClient
      .listPermissions({ activeOnly: true })
      .then(setPermissionCatalog)
      .catch((err) => toast.error(apiErrorMessage(err, "Couldn't load the permission catalog.")));
  }, [canReadPermissions, activeWorkspaceId]);

  if (!canManage) return <PermissionRequired permission={PERMISSIONS.rolesManage} what="Adding a role" />;

  function set<K extends keyof CreateRoleFormValues>(key: K, value: CreateRoleFormValues[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    setLoading(true);
    try {
      const role = await authClient.createRole({
        slug: form.slug,
        displayName: form.displayName || undefined,
        description: form.description || undefined,
        isDefault: form.isDefault,
        isActive: form.isActive,
      });
      if (form.permissions.length > 0) {
        await Promise.all(form.permissions.map((slug) => authClient.attachPermissionToRole(role.id, slug)));
      }
      toast.success(`Role "${role.name}" created.`);
      router.push("/roles");
    } catch (err) {
      setFormError(errorMessages(err));
      toast.error(apiErrorMessage(err, "Couldn't create this role. Try again."));
      setLoading(false);
    }
  }

  return (
    <div className="flex-1 space-y-4">
      <Breadcrumb items={[{ title: "Roles & permissions", href: "/roles" }, { title: "Add role", href: "/roles/new" }]} />
      <div className="flex items-start justify-between">
        <Heading title="Add New Role" description={`Create a new role. Roles belong to ${workspaceName}.`} />
      </div>
      <Separator />

      <Card>
        <CardHeader />
        <CardContent>
          <FormErrorAlert messages={formError} />
          <form onSubmit={handleSubmit} className="space-y-8 w-full">
            <Card className="w-full">
              <CardHeader className="border-b bg-muted/50">
                <CardTitle className="text-2xl">Role Information</CardTitle>
                <CardDescription className="text-base">Enter role details</CardDescription>
              </CardHeader>
              <CardContent className="pt-6">
                <div className="space-y-6">
                  <div className="space-y-4">
                    <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Basic Information</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="flex flex-col gap-1.5">
                        <Label htmlFor="slug">
                          Slug &nbsp;
                          <span className="text-xs text-destructive dark:text-destructive-foreground">(Must be unique)</span>
                        </Label>
                        <Input
                          id="slug"
                          required
                          disabled={loading}
                          placeholder="billing-manager"
                          value={form.slug}
                          onChange={(e) => set("slug", e.target.value)}
                          type="text"
                          className={inputClassName}
                        />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <Label htmlFor="displayName">Display Name</Label>
                        <Input
                          id="displayName"
                          disabled={loading}
                          placeholder="Billing manager"
                          value={form.displayName}
                          onChange={(e) => set("displayName", e.target.value)}
                          type="text"
                          className={inputClassName}
                        />
                      </div>
                      <div className="flex flex-col gap-1.5 md:col-span-2">
                        <Label htmlFor="description">Description</Label>
                        <Input
                          id="description"
                          disabled={loading}
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
                    <CardDescription className="text-base">Pick the permissions this role grants — you can still change them later</CardDescription>
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
                    <p className="text-sm text-muted-foreground">Given to every new member of {workspaceName}</p>
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
                <Button type="button" variant="outline" onClick={() => router.push("/roles")} disabled={loading}>
                  Cancel
                </Button>
                <Button disabled={loading} className="bg-purple-600 hover:bg-purple-700 dark:bg-purple-600 dark:hover:bg-purple-700 min-w-32" type="submit">
                  {loading ? "Creating..." : "Create Role"}
                </Button>
              </CardFooter>
            </Card>
          </form>
        </CardContent>
      </Card>
    </div>
  );
});

export default NewRolePage;
