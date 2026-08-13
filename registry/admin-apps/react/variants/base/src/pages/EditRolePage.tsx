import { type FormEvent, useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type { PermissionSummary, RoleSummary } from "@easy-auth/auth-client";
import { AuthApiError } from "@easy-auth/auth-client";
import { toast } from "sonner";
import { PERMISSIONS, useAbility } from "@/lib/ability";
import { authClient } from "@/lib/auth-client";
import { errorMessages } from "@/lib/error";
import { Breadcrumb } from "@/components/breadcrumb";
import { FormErrorAlert } from "@/components/form-error-alert";
import { PermissionGroupSelect } from "@/components/permission-group-select";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Heading } from "@/components/ui/heading";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

function apiErrorMessage(err: unknown, fallback: string): string {
  return err instanceof AuthApiError ? err.message : fallback;
}

function sameSlugs(a: string[], b: string[]): boolean {
  return JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
}

const inputClassName = "bg-background border-2 focus:border-purple-500 transition-colors";

export function EditRolePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const ability = useAbility();
  const canReadPermissions = ability.can(PERMISSIONS.permissionsRead, "permission");

  const [role, setRole] = useState<RoleSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [description, setDescription] = useState("");
  const [isDefault, setIsDefault] = useState(false);
  const [isActive, setIsActive] = useState(true);
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>([]);
  const [permissionCatalog, setPermissionCatalog] = useState<PermissionSummary[]>([]);
  const [formError, setFormError] = useState<string[] | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // No single-role endpoint on the client — the list is small, so find by id.
      const roles = await authClient.listRoles();
      const result = roles.find((r) => r.id === id) ?? null;
      setRole(result);
      if (result) {
        setDisplayName(result.displayName);
        // RoleSummary doesn't carry a description (there's no "get one role" endpoint), so that
        // field always starts blank — leaving it blank leaves the role's current description untouched.
        setDescription("");
        setIsDefault(result.isDefault);
        setIsActive(result.isActive);
        setSelectedPermissions(result.permissions);
      } else {
        toast.error("Couldn't find this role.");
      }
    } catch (err) {
      toast.error(apiErrorMessage(err, "Couldn't load this role."));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!canReadPermissions) return;
    authClient
      .listPermissions({ activeOnly: true })
      .then(setPermissionCatalog)
      .catch((err) => toast.error(apiErrorMessage(err, "Couldn't load the permission catalog.")));
  }, [canReadPermissions]);

  const unchanged =
    role !== null &&
    displayName === role.displayName &&
    description === "" &&
    isDefault === role.isDefault &&
    isActive === role.isActive &&
    sameSlugs(selectedPermissions, role.permissions);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!role) return;
    setFormError(null);
    setSaving(true);
    try {
      // No bulk "set permissions" endpoint — diffs against the role loaded at mount and attaches/detaches only the delta.
      const toAttach = selectedPermissions.filter((slug) => !role.permissions.includes(slug));
      const toDetach = role.permissions.filter((slug) => !selectedPermissions.includes(slug));
      const [updated] = await Promise.all([
        authClient.updateRole(role.id, {
          displayName: displayName.trim() === "" ? undefined : displayName,
          description: description.trim() === "" ? undefined : description,
          isDefault,
          isActive,
        }),
        ...toAttach.map((slug) => authClient.attachPermissionToRole(role.id, slug)),
        ...toDetach.map((slug) => authClient.detachPermissionFromRole(role.id, slug)),
      ]);
      toast.success(`Role "${updated.name}" updated.`);
      navigate("/roles");
    } catch (err) {
      setFormError(errorMessages(err));
      toast.error(apiErrorMessage(err, "Couldn't update this role. Try again."));
      setSaving(false);
    }
  }

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

      {role && (
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
                        <div className="flex flex-col gap-2">
                          <Label htmlFor="displayName">Display Name</Label>
                          <Input
                            id="displayName"
                            disabled={saving}
                            placeholder="Billing manager"
                            value={displayName}
                            onChange={(e) => setDisplayName(e.target.value)}
                            type="text"
                            className={inputClassName}
                          />
                        </div>
                        <div className="flex flex-col gap-2">
                          <Label htmlFor="description">Description</Label>
                          <Input
                            id="description"
                            disabled={saving}
                            placeholder="Leave blank to leave the current description unchanged"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
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
                        <PermissionGroupSelect permissions={permissionCatalog} selected={selectedPermissions} onChange={setSelectedPermissions} />
                      </div>
                    </CardContent>
                  </>
                )}

                <div className="flex flex-wrap justify-center gap-4 mt-6">
                  <label className="flex flex-row items-center space-x-3 rounded-lg border border-purple-500 bg-purple-50 dark:bg-purple-950/20 p-4">
                    <Checkbox checked={isDefault} onCheckedChange={(checked) => setIsDefault(checked === true)} />
                    <span className="space-y-1 leading-none">
                      <span className="block text-base font-medium">Default Role</span>
                      <span className="block text-sm text-muted-foreground">Given to every newly signed-up user</span>
                    </span>
                  </label>
                  <label className="flex flex-row items-center space-x-3 rounded-lg border border-purple-500 bg-purple-50 dark:bg-purple-950/20 p-4">
                    <Checkbox checked={isActive} onCheckedChange={(checked) => setIsActive(checked === true)} />
                    <span className="space-y-1 leading-none">
                      <span className="block text-base font-medium">Active Status</span>
                      <span className="block text-sm text-muted-foreground">This role will be active and can be assigned to users</span>
                    </span>
                  </label>
                </div>

                <CardFooter className="flex justify-center gap-4 mt-8 pb-8">
                  <Button type="button" variant="outline" onClick={() => navigate("/roles")} disabled={saving}>
                    Cancel
                  </Button>
                  <Button
                    disabled={saving || unchanged}
                    className="bg-purple-600 hover:bg-purple-700 dark:bg-purple-600 dark:hover:bg-purple-700 min-w-32"
                    type="submit"
                  >
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
}
