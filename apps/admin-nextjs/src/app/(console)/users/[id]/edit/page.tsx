"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useAbility } from "@casl/react";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { format } from "date-fns";
import { AuthApiError, type RoleSummary, type UpdateUserInput, type UserSummary } from "@easy-auth/auth-client";
import { toast } from "sonner";
import { Breadcrumb } from "@/components/breadcrumb";
import { FormErrorAlert } from "@/components/form-error-alert";
import { PermissionRequired } from "@/components/permission-required";
import { PhotoUpload } from "@/components/photo-upload";
import { RoleMultiSelect } from "@/components/role-multi-select";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Combobox } from "@/components/ui/combobox";
import { DatePicker } from "@/components/ui/date-picker";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Heading } from "@/components/ui/heading";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { PERMISSIONS, hasPermission, type AppAbility } from "@/lib/ability";
import { authClient } from "@/lib/auth-client";
import { errorMessage, errorMessages } from "@/lib/error";
import { GENDER_OPTIONS, editUserSchema, type EditUserFormValues } from "../../user-schema";

function apiErrorMessage(err: unknown, fallback: string): string {
  return err instanceof AuthApiError ? err.message : fallback;
}

function toForm(user: UserSummary): EditUserFormValues {
  return {
    firstName: user.firstName ?? "",
    lastName: user.lastName ?? "",
    displayName: user.displayName ?? "",
    phone: user.phone ?? "",
    username: user.username ?? "",
    dob: user.dob ? new Date(user.dob) : undefined,
    gender: user.gender ?? "",
    joinedDate: user.joinedDate ? new Date(user.joinedDate) : undefined,
    photo: user.photo,
    roles: user.roles,
  };
}

export default function EditUserPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const ability = useAbility<AppAbility>();
  const canManage = hasPermission(ability, PERMISSIONS.usersManage);
  const canReadRoles = hasPermission(ability, PERMISSIONS.rolesManage);
  const canAssignRoles = hasPermission(ability, PERMISSIONS.rolesAssign);

  const [user, setUser] = useState<UserSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [roleCatalog, setRoleCatalog] = useState<RoleSummary[]>([]);
  const [formError, setFormError] = useState<string[] | null>(null);

  const form = useForm<EditUserFormValues>({
    resolver: zodResolver(editUserSchema),
    defaultValues: {
      firstName: "",
      lastName: "",
      displayName: "",
      phone: "",
      username: "",
      dob: undefined,
      gender: "",
      joinedDate: undefined,
      photo: null,
      roles: [],
    },
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await authClient.getUser(id);
      setUser(result);
      form.reset(toForm(result));
    } catch (err) {
      toast.error(apiErrorMessage(err, "Couldn't load this user."));
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
    if (!canReadRoles) return;
    authClient
      .listRoles()
      .then(setRoleCatalog)
      .catch((err) => toast.error(apiErrorMessage(err, "Couldn't load the role catalog.")));
  }, [canReadRoles]);

  if (!canManage) return <PermissionRequired permission={PERMISSIONS.usersManage} what="Editing a user" />;

  async function onSubmit(values: EditUserFormValues) {
    if (!user) return;
    setFormError(null);
    // `joinedDate` is not nullable on update, so a cleared picker just leaves it unchanged.
    const input: UpdateUserInput = {
      firstName: values.firstName || null,
      lastName: values.lastName || null,
      displayName: values.displayName || null,
      phone: values.phone || null,
      username: values.username || null,
      dob: values.dob ? format(values.dob, "yyyy-MM-dd") : null,
      gender: values.gender || null,
      joinedDate: values.joinedDate ? format(values.joinedDate, "yyyy-MM-dd") : undefined,
      photo: values.photo || null,
    };
    // No bulk "set roles" endpoint — diffs against the roles loaded at mount and assigns/revokes only the delta.
    const selectedRoles = values.roles ?? [];
    const toAssign = selectedRoles.filter((slug) => !user.roles.includes(slug));
    const toRevoke = user.roles.filter((slug) => !selectedRoles.includes(slug));
    try {
      await Promise.all([
        authClient.updateUser(id, input),
        ...toAssign.map((slug) => authClient.assignRole(id, slug)),
        ...toRevoke.map((slug) => authClient.revokeRole(id, slug)),
      ]);
      toast.success("User updated.");
      router.push(`/users/${id}`);
    } catch (err) {
      setFormError(errorMessages(err));
      toast.error(errorMessage(err));
    }
  }

  const saving = form.formState.isSubmitting;

  return (
    <div className="flex-1 space-y-4">
      <Breadcrumb
        items={[
          { title: "Users", href: "/users" },
          { title: user?.email ?? "Details", href: `/users/${id}` },
          { title: "Edit", href: `/users/${id}/edit` },
        ]}
      />
      <div className="flex items-start justify-between">
        <Heading title="Edit User" description="Update user details" />
      </div>
      <Separator />

      {loading && !user && <p className="text-sm text-muted-foreground">Loading…</p>}

      {user && (
        <Card>
          <CardHeader />
          <CardContent>
            <FormErrorAlert messages={formError} />
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8 w-full">
                <Card className="w-full">
                  <CardHeader className="border-b bg-muted/50">
                    <CardTitle className="text-2xl">User Information</CardTitle>
                    <CardDescription className="text-base">Update user&apos;s basic information</CardDescription>
                  </CardHeader>
                  <CardContent className="pt-6">
                    <div className="space-y-6">
                      <div className="space-y-4">
                        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Personal Information</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <FormField
                            control={form.control}
                            name="firstName"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>First Name</FormLabel>
                                <FormControl>
                                  <Input
                                    disabled={saving}
                                    placeholder="First Name"
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
                            name="lastName"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Last Name</FormLabel>
                                <FormControl>
                                  <Input
                                    disabled={saving}
                                    placeholder="Last Name"
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
                                    disabled={saving}
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
                            name="username"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>
                                  Username &nbsp;
                                  <span className="text-xs text-destructive dark:text-destructive-foreground">(Must be unique)</span>
                                </FormLabel>
                                <FormControl>
                                  <Input
                                    disabled={saving}
                                    placeholder="Username"
                                    {...field}
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
                        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Contact Information</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <FormField
                            control={form.control}
                            name="phone"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>
                                  Phone &nbsp;
                                  <span className="text-xs text-muted-foreground">(With country code)</span>
                                </FormLabel>
                                <FormControl>
                                  <Input
                                    type="text"
                                    disabled={saving}
                                    {...field}
                                    placeholder="+1234567890"
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
                        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Additional Details</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <FormField
                            control={form.control}
                            name="joinedDate"
                            render={({ field }) => (
                              <FormItem className="flex flex-col p-2">
                                <FormLabel>Joined Date</FormLabel>
                                <DatePicker
                                  placeholder="Joined Date"
                                  onChange={field.onChange}
                                  value={field.value}
                                  displayFormat="dd-MM-yyyy"
                                />
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={form.control}
                            name="dob"
                            render={({ field }) => (
                              <FormItem className="flex flex-col p-2">
                                <FormLabel>Date of birth</FormLabel>
                                <DatePicker
                                  placeholder="Date of birth"
                                  onChange={field.onChange}
                                  value={field.value}
                                  displayFormat="dd-MM-yyyy"
                                />
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={form.control}
                            name="gender"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Gender</FormLabel>
                                <FormControl>
                                  <div>
                                    <Combobox
                                      options={GENDER_OPTIONS}
                                      selected={field.value ?? ""}
                                      placeholder="Select Gender"
                                      onChange={(option) => field.onChange(option.value)}
                                      showCreate={false}
                                      popoverClassName="min-w-[200px]"
                                    />
                                  </div>
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                      </div>

                      {canReadRoles && (
                        <div className="space-y-4">
                          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Roles</h3>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <FormField
                              control={form.control}
                              name="roles"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Roles</FormLabel>
                                  <FormControl>
                                    <div>
                                      <RoleMultiSelect
                                        roles={roleCatalog}
                                        selected={field.value ?? []}
                                        onChange={field.onChange}
                                        disabled={!canAssignRoles}
                                      />
                                    </div>
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  </CardContent>

                  <CardHeader className="border-b bg-muted/50 mt-6">
                    <CardTitle className="text-2xl">Profile Photo</CardTitle>
                    <CardDescription className="text-base">Upload user&apos;s profile picture (Max size: 2MB, Formats: JPG, PNG)</CardDescription>
                  </CardHeader>
                  <CardContent className="pt-6">
                    <FormField
                      control={form.control}
                      name="photo"
                      render={({ field }) => (
                        <FormItem>
                          <FormControl>
                            <div>
                              <PhotoUpload photo={field.value} fallback="?" onChange={field.onChange} disabled={saving} />
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </CardContent>

                  <CardFooter className="flex justify-center gap-4 mt-8 pb-8">
                    <Button type="button" variant="outline" onClick={() => router.push(`/users/${id}`)} disabled={saving}>
                      Cancel
                    </Button>
                    <Button disabled={saving} className="bg-purple-600 hover:bg-purple-700 dark:bg-purple-600 dark:hover:bg-purple-700 min-w-32" type="submit">
                      {saving ? "Updating..." : "Update User"}
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
