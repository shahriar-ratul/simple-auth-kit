"use client";

import { useAbility } from "@casl/react";
import { observer } from "mobx-react-lite";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import type { DefinePermissionInput, PermissionSummary } from "@easy-auth/auth-client";
import { toast } from "sonner";
import { Breadcrumb } from "@/components/breadcrumb";
import { FormErrorAlert } from "@/components/form-error-alert";
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
import { errorMessage, errorMessages } from "@/lib/error";
import { useWorkspaceStore } from "@/lib/stores/store-context";
import {
  deriveGroupOptions,
  emptyPermissionForm,
  groupOrderFor,
  nextGroupOrder,
  nextOrderInGroup,
  type PermissionFormValues,
} from "../permission-schema";

const inputClassName = "bg-background border-2 focus:border-purple-500 transition-colors";

const NewPermissionPage = observer(function NewPermissionPage() {
  const ability = useAbility<AppAbility>();
  const canDefine = hasPermission(ability, PERMISSIONS.permissionsDefine);
  const router = useRouter();
  const workspaces = useWorkspaceStore();
  const activeWorkspaceId = workspaces.activeWorkspaceId;

  const [permissions, setPermissions] = useState<PermissionSummary[]>([]);
  const [form, setForm] = useState<PermissionFormValues>(emptyPermissionForm);
  const [formError, setFormError] = useState<string[] | null>(null);
  const [loading, setLoading] = useState(false);

  // Permissions are per-workspace, so the catalog re-fetches on every workspace switch.
  useEffect(() => {
    if (!activeWorkspaceId) return;
    authClient
      .listPermissions()
      .then(setPermissions)
      .catch((err) => toast.error(errorMessage(err)));
  }, [activeWorkspaceId]);

  const groupOptions = useMemo(() => deriveGroupOptions(permissions), [permissions]);

  if (!canDefine) return <PermissionRequired permission={PERMISSIONS.permissionsDefine} what="Adding a permission" />;

  function set<K extends keyof PermissionFormValues>(key: K, value: PermissionFormValues[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  // The plain admin app uses a create-enabled combobox here; this app has no cmdk, so the same
  // pick-or-create flow is an input with a datalist — a known group derives its existing ordering,
  // a new group starts a fresh one.
  function handleGroupChange(value: string) {
    const known = permissions.some((p) => p.group === value);
    setForm((prev) => ({
      ...prev,
      group: value,
      groupOrder: known ? groupOrderFor(permissions, value) : nextGroupOrder(permissions),
      order: known ? nextOrderInGroup(permissions, value) : 1,
    }));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    setLoading(true);
    try {
      const input: DefinePermissionInput = form;
      const saved = await authClient.definePermission(input);
      toast.success(`Permission "${saved.slug}" saved.`);
      router.push("/permissions");
    } catch (err) {
      setFormError(errorMessages(err));
      toast.error(errorMessage(err));
      setLoading(false);
    }
  }

  return (
    <div className="flex-1 space-y-4">
      <Breadcrumb items={[{ title: "Permissions", href: "/permissions" }, { title: "Add permission", href: "/permissions/new" }]} />
      <div className="flex items-start justify-between">
        <Heading title="Add New Permission" description="Create a new permission." />
      </div>
      <Separator />

      <Card>
        <CardHeader />
        <CardContent>
          <FormErrorAlert messages={formError} />
          <form onSubmit={handleSubmit} className="space-y-8 w-full">
            <Card className="w-full">
              <CardHeader className="border-b bg-muted/50">
                <CardTitle className="text-2xl">Permission Information</CardTitle>
                <CardDescription className="text-base">Slug is the key routes check, e.g. billing:manage</CardDescription>
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
                          placeholder="billing:manage"
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
                          placeholder="Display Name"
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

                  <div className="space-y-4">
                    <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Grouping</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="flex flex-col gap-1.5 md:col-span-2">
                        <Label htmlFor="group">Permission Group</Label>
                        <Input
                          id="group"
                          required
                          disabled={loading}
                          list="permission-group-options"
                          placeholder="Select or create a group…"
                          value={form.group}
                          onChange={(e) => handleGroupChange(e.target.value)}
                          className={inputClassName}
                        />
                        <datalist id="permission-group-options">
                          {groupOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </datalist>
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <Label htmlFor="groupOrder">Group Order</Label>
                        <Input
                          id="groupOrder"
                          type="number"
                          disabled={loading}
                          value={form.groupOrder ?? ""}
                          onChange={(e) => set("groupOrder", e.target.value === "" ? undefined : Number(e.target.value))}
                          className={inputClassName}
                        />
                        <p className="text-xs text-muted-foreground">Derived from the group — override to reorder groups.</p>
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <Label htmlFor="order">Order</Label>
                        <Input
                          id="order"
                          type="number"
                          disabled={loading}
                          value={form.order ?? ""}
                          onChange={(e) => set("order", e.target.value === "" ? undefined : Number(e.target.value))}
                          className={inputClassName}
                        />
                        <p className="text-xs text-muted-foreground">Derived from the group&apos;s existing permissions.</p>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>

              <div className="flex justify-center mt-6">
                <div className="flex flex-row items-center space-x-3 rounded-lg border border-purple-500 bg-purple-50 dark:bg-purple-950/20 p-4">
                  <Checkbox id="isActive" checked={form.isActive} onCheckedChange={(checked) => set("isActive", checked === true)} />
                  <div className="space-y-1 leading-none">
                    <Label htmlFor="isActive" className="text-base font-medium">
                      Active Status
                    </Label>
                    <p className="text-sm text-muted-foreground">This permission will be active and can be assigned to roles</p>
                  </div>
                </div>
              </div>

              <CardFooter className="flex justify-center gap-4 mt-8 pb-8">
                <Button type="button" variant="outline" onClick={() => router.push("/permissions")} disabled={loading}>
                  Cancel
                </Button>
                <Button disabled={loading} className="bg-purple-600 hover:bg-purple-700 dark:bg-purple-600 dark:hover:bg-purple-700 min-w-32" type="submit">
                  {loading ? "Creating..." : "Create Permission"}
                </Button>
              </CardFooter>
            </Card>
          </form>
        </CardContent>
      </Card>
    </div>
  );
});

export default NewPermissionPage;
