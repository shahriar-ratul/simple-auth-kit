"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useAbility } from "@casl/react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import type { DefinePermissionInput, PermissionSummary } from "@easy-auth/auth-client";
import { toast } from "sonner";
import { Breadcrumb } from "@/components/breadcrumb";
import { FormErrorAlert } from "@/components/form-error-alert";
import { PermissionRequired } from "@/components/permission-required";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Combobox, type ComboboxOptions } from "@/components/ui/combobox";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Heading } from "@/components/ui/heading";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { PERMISSIONS, hasPermission, type AppAbility } from "@/lib/ability";
import { authClient } from "@/lib/auth-client";
import { errorMessage, errorMessages } from "@/lib/error";
import {
  deriveGroupOptions,
  emptyPermissionForm,
  groupOrderFor,
  nextGroupOrder,
  nextOrderInGroup,
  permissionSchema,
  type PermissionFormValues,
} from "../permission-schema";

export default function NewPermissionPage() {
  const ability = useAbility<AppAbility>();
  const canDefine = hasPermission(ability, PERMISSIONS.permissionsDefine);
  const router = useRouter();

  const [permissions, setPermissions] = useState<PermissionSummary[]>([]);
  const [formError, setFormError] = useState<string[] | null>(null);

  const form = useForm<PermissionFormValues>({
    resolver: zodResolver(permissionSchema),
    defaultValues: emptyPermissionForm,
  });

  useEffect(() => {
    authClient
      .listPermissions()
      .then(setPermissions)
      .catch((err) => toast.error(errorMessage(err)));
  }, []);

  const groupOptions = useMemo(() => deriveGroupOptions(permissions), [permissions]);

  if (!canDefine) return <PermissionRequired permission={PERMISSIONS.permissionsDefine} what="Adding a permission" />;

  function handleGroupSelect(option: ComboboxOptions) {
    form.setValue("group", option.value, { shouldValidate: true });
    form.setValue("groupOrder", groupOrderFor(permissions, option.value));
    form.setValue("order", nextOrderInGroup(permissions, option.value));
  }

  function handleGroupCreate(label: string) {
    form.setValue("group", label, { shouldValidate: true });
    form.setValue("groupOrder", nextGroupOrder(permissions));
    form.setValue("order", 1);
  }

  async function onSubmit(values: PermissionFormValues) {
    setFormError(null);
    try {
      const input: DefinePermissionInput = values;
      const saved = await authClient.definePermission(input);
      toast.success(`Permission "${saved.slug}" saved.`);
      router.push("/permissions");
    } catch (err) {
      setFormError(errorMessages(err));
      toast.error(errorMessage(err));
    }
  }

  const loading = form.formState.isSubmitting;

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
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8 w-full">
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
                        <FormField
                          control={form.control}
                          name="slug"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>
                                Slug &nbsp;
                                <span className="text-xs text-destructive dark:text-destructive-foreground">(Must be unique)</span>
                              </FormLabel>
                              <FormControl>
                                <Input
                                  disabled={loading}
                                  placeholder="billing:manage"
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
                          name="displayName"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Display Name</FormLabel>
                              <FormControl>
                                <Input
                                  disabled={loading}
                                  placeholder="Display Name"
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
                            <FormItem className="md:col-span-2">
                              <FormLabel>Description</FormLabel>
                              <FormControl>
                                <Input
                                  disabled={loading}
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

                    <div className="space-y-4">
                      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Grouping</h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <FormField
                          control={form.control}
                          name="group"
                          render={({ field }) => (
                            <FormItem className="md:col-span-2">
                              <FormLabel>Permission Group</FormLabel>
                              <FormControl>
                                <div>
                                  <Combobox
                                    options={groupOptions}
                                    selected={field.value}
                                    onChange={handleGroupSelect}
                                    onCreate={handleGroupCreate}
                                    showCreate
                                    placeholder="Select or create a group…"
                                  />
                                </div>
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="groupOrder"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Group Order</FormLabel>
                              <FormControl>
                                <Input
                                  type="number"
                                  disabled={loading}
                                  value={field.value ?? ""}
                                  onChange={(e) => field.onChange(e.target.value === "" ? undefined : Number(e.target.value))}
                                  className="bg-background border-2 focus:border-purple-500 transition-colors"
                                />
                              </FormControl>
                              <FormDescription>Derived from the group — override to reorder groups.</FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="order"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Order</FormLabel>
                              <FormControl>
                                <Input
                                  type="number"
                                  disabled={loading}
                                  value={field.value ?? ""}
                                  onChange={(e) => field.onChange(e.target.value === "" ? undefined : Number(e.target.value))}
                                  className="bg-background border-2 focus:border-purple-500 transition-colors"
                                />
                              </FormControl>
                              <FormDescription>Derived from the group&apos;s existing permissions.</FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                    </div>
                  </div>
                </CardContent>

                <div className="flex justify-center mt-6">
                  <FormField
                    control={form.control}
                    name="isActive"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center space-x-3 space-y-0 rounded-lg border border-purple-500 bg-purple-50 dark:bg-purple-950/20 p-4">
                        <FormControl>
                          <Checkbox checked={field.value ?? true} onCheckedChange={(checked) => field.onChange(checked === true)} />
                        </FormControl>
                        <div className="space-y-1 leading-none">
                          <FormLabel className="text-base font-medium">Active Status</FormLabel>
                          <FormDescription className="text-sm">This permission will be active and can be assigned to roles</FormDescription>
                        </div>
                      </FormItem>
                    )}
                  />
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
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
