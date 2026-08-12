"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useAbility } from "@casl/react";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { AuthApiError, type PermissionSummary, type RoleSummary } from "@easy-auth/auth-client";
import { toast } from "sonner";
import { Breadcrumb } from "@/components/breadcrumb";
import { FormErrorAlert } from "@/components/form-error-alert";
import { PermissionGroupSelect } from "@/components/permission-group-select";
import { PermissionRequired } from "@/components/permission-required";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Heading } from "@/components/ui/heading";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { PERMISSIONS, hasPermission, type AppAbility } from "@/lib/ability";
import { authClient } from "@/lib/auth-client";
import { errorMessages } from "@/lib/error";
import { editRoleSchema, type EditRoleFormValues } from "../../role-schema";

function apiErrorMessage(err: unknown, fallback: string): string {
  return err instanceof AuthApiError ? err.message : fallback;
}

function sameSlugs(a: string[], b: string[]): boolean {
  return JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
}

export default function EditRolePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const ability = useAbility<AppAbility>();
  const canManage = hasPermission(ability, PERMISSIONS.rolesManage);
  const canReadPermissions = hasPermission(ability, PERMISSIONS.permissionsRead);

  const [role, setRole] = useState<RoleSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [permissionCatalog, setPermissionCatalog] = useState<PermissionSummary[]>([]);
  const [formError, setFormError] = useState<string[] | null>(null);

  const form = useForm<EditRoleFormValues>({
    resolver: zodResolver(editRoleSchema),
    defaultValues: { displayName: "", description: "", isDefault: false, isActive: true, permissions: [] },
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // No single-role endpoint on the client — the list is small, so find by id.
      const roles = await authClient.listRoles();
      const result = roles.find((r) => r.id === id) ?? null;
      setRole(result);
      if (result) {
        form.reset({ displayName: result.displayName, description: "", isDefault: result.isDefault, isActive: result.isActive, permissions: result.permissions });
      } else {
        toast.error("Couldn't find this role.");
      }
    } catch (err) {
      toast.error(apiErrorMessage(err, "Couldn't load this role."));
    } finally {
      setLoading(false);
    }
    // `form` is stable across renders (react-hook-form memoizes it), so it's safe to omit here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (!canManage) return;
    void load();
  }, [canManage, load]);

  useEffect(() => {
    if (!canReadPermissions) return;
    authClient
      .listPermissions({ activeOnly: true })
      .then(setPermissionCatalog)
      .catch((err) => toast.error(apiErrorMessage(err, "Couldn't load the permission catalog.")));
  }, [canReadPermissions]);

  if (!canManage) return <PermissionRequired permission={PERMISSIONS.rolesManage} what="Editing a role" />;

  async function onSubmit(values: EditRoleFormValues) {
    if (!role) return;
    setFormError(null);
    try {
      // No bulk "set permissions" endpoint — diffs against the role loaded at mount and attaches/detaches only the delta.
      const toAttach = values.permissions.filter((slug) => !role.permissions.includes(slug));
      const toDetach = role.permissions.filter((slug) => !values.permissions.includes(slug));
      const [updated] = await Promise.all([
        authClient.updateRole(role.id, {
          displayName: values.displayName,
          description: values.description || null,
          isDefault: values.isDefault,
          isActive: values.isActive,
        }),
        ...toAttach.map((slug) => authClient.attachPermissionToRole(role.id, slug)),
        ...toDetach.map((slug) => authClient.detachPermissionFromRole(role.id, slug)),
      ]);
      toast.success(`Role "${updated.name}" updated.`);
      router.push("/roles");
    } catch (err) {
      setFormError(errorMessages(err));
      toast.error(apiErrorMessage(err, "Couldn't update this role. Try again."));
    }
  }

  const saving = form.formState.isSubmitting;
  const values = form.watch();
  const unchanged =
    role !== null &&
    values.displayName === role.displayName &&
    values.isDefault === role.isDefault &&
    values.isActive === role.isActive &&
    sameSlugs(values.permissions, role.permissions);

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
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8 w-full">
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
                          <FormField
                            control={form.control}
                            name="displayName"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Display Name</FormLabel>
                                <FormControl>
                                  <Input
                                    disabled={saving}
                                    placeholder="Billing manager"
                                    {...field}
                                    type="text"
                                    className="bg-background border-2 focus:border-purple-500 transition-colors"
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={form.control}
                            name="description"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Description</FormLabel>
                                <FormControl>
                                  <Input
                                    disabled={saving}
                                    placeholder="Description"
                                    {...field}
                                    type="text"
                                    className="bg-background border-2 focus:border-purple-500 transition-colors"
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
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
                          <FormField
                            control={form.control}
                            name="permissions"
                            render={({ field }) => (
                              <FormItem>
                                <FormControl>
                                  <PermissionGroupSelect permissions={permissionCatalog} selected={field.value} onChange={field.onChange} />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                      </CardContent>
                    </>
                  )}

                  <div className="flex flex-wrap justify-center gap-4 mt-6">
                    <FormField
                      control={form.control}
                      name="isDefault"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-center space-x-3 space-y-0 rounded-lg border border-purple-500 bg-purple-50 dark:bg-purple-950/20 p-4">
                          <FormControl>
                            <Checkbox checked={field.value} onCheckedChange={(checked) => field.onChange(checked === true)} />
                          </FormControl>
                          <div className="space-y-1 leading-none">
                            <FormLabel className="text-base font-medium">Default Role</FormLabel>
                            <FormDescription className="text-sm">Given to every newly signed-up user</FormDescription>
                          </div>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="isActive"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-center space-x-3 space-y-0 rounded-lg border border-purple-500 bg-purple-50 dark:bg-purple-950/20 p-4">
                          <FormControl>
                            <Checkbox checked={field.value} onCheckedChange={(checked) => field.onChange(checked === true)} />
                          </FormControl>
                          <div className="space-y-1 leading-none">
                            <FormLabel className="text-base font-medium">Active Status</FormLabel>
                            <FormDescription className="text-sm">This role will be active and can be assigned to users</FormDescription>
                          </div>
                        </FormItem>
                      )}
                    />
                  </div>

                  <CardFooter className="flex justify-center gap-4 mt-8 pb-8">
                    <Button type="button" variant="outline" onClick={() => router.push("/roles")} disabled={saving}>
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
            </Form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
