import { type FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { PermissionSummary } from "@easy-auth/auth-client";
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

const inputClassName = "bg-background border-2 focus:border-purple-500 transition-colors";

export function AddRolePage() {
  const navigate = useNavigate();
  const ability = useAbility();
  const canReadPermissions = ability.can(PERMISSIONS.permissionsRead, "permission");

  const [slug, setSlug] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [description, setDescription] = useState("");
  const [isDefault, setIsDefault] = useState(false);
  const [isActive, setIsActive] = useState(true);
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>([]);
  const [permissionCatalog, setPermissionCatalog] = useState<PermissionSummary[]>([]);
  const [formError, setFormError] = useState<string[] | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!canReadPermissions) return;
    authClient
      .listPermissions({ activeOnly: true })
      .then(setPermissionCatalog)
      .catch((err) => toast.error(apiErrorMessage(err, "Couldn't load the permission catalog.")));
  }, [canReadPermissions]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    setLoading(true);
    try {
      const role = await authClient.createRole({
        slug,
        displayName: displayName || undefined,
        description: description || undefined,
        isDefault,
        isActive,
      });
      if (selectedPermissions.length > 0) {
        await Promise.all(selectedPermissions.map((permSlug) => authClient.attachPermissionToRole(role.id, permSlug)));
      }
      toast.success(`Role "${role.name}" created.`);
      navigate("/roles");
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
        <Heading title="Add New Role" description="Create a new role." />
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
                      <div className="flex flex-col gap-2">
                        <Label htmlFor="slug">
                          Slug &nbsp;
                          <span className="text-xs text-destructive dark:text-destructive-foreground">(Must be unique)</span>
                        </Label>
                        <Input
                          id="slug"
                          disabled={loading}
                          placeholder="billing-manager"
                          required
                          value={slug}
                          onChange={(e) => setSlug(e.target.value)}
                          type="text"
                          className={inputClassName}
                        />
                      </div>
                      <div className="flex flex-col gap-2">
                        <Label htmlFor="displayName">Display Name</Label>
                        <Input
                          id="displayName"
                          disabled={loading}
                          placeholder="Billing manager"
                          value={displayName}
                          onChange={(e) => setDisplayName(e.target.value)}
                          type="text"
                          className={inputClassName}
                        />
                      </div>
                      <div className="flex flex-col gap-2 md:col-span-2">
                        <Label htmlFor="description">Description</Label>
                        <Input
                          id="description"
                          disabled={loading}
                          placeholder="Description"
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
                    <CardDescription className="text-base">Pick the permissions this role grants — you can still change them later</CardDescription>
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
                <Button type="button" variant="outline" onClick={() => navigate("/roles")} disabled={loading}>
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
}
