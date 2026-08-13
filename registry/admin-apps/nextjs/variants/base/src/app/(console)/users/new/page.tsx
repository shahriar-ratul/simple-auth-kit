"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useAbility } from "@casl/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { format } from "date-fns";
import { userIdOf, type CreateUserInput, type RoleSummary } from "@easy-auth/auth-client";
import { toast } from "sonner";
import { Breadcrumb } from "@/components/breadcrumb";
import { FormErrorAlert } from "@/components/form-error-alert";
import { PermissionRequired } from "@/components/permission-required";
import { PhotoUpload } from "@/components/photo-upload";
import { RoleMultiSelect } from "@/components/role-multi-select";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Combobox } from "@/components/ui/combobox";
import { DatePicker } from "@/components/ui/date-picker";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Heading } from "@/components/ui/heading";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { PERMISSIONS, hasPermission, type AppAbility } from "@/lib/ability";
import { authClient } from "@/lib/auth-client";
import { errorMessage, errorMessages } from "@/lib/error";
import { GENDER_OPTIONS, createUserSchema, type CreateUserFormValues } from "../user-schema";

export default function NewUserPage() {
  const ability = useAbility<AppAbility>();
  const canManage = hasPermission(ability, PERMISSIONS.usersManage);
  const canReadRoles = hasPermission(ability, PERMISSIONS.rolesManage);
  const router = useRouter();

  const [roles, setRoles] = useState<RoleSummary[]>([]);
  const [manualRoles, setManualRoles] = useState("");
  const [formError, setFormError] = useState<string[] | null>(null);

  const form = useForm<CreateUserFormValues>({
    resolver: zodResolver(createUserSchema),
    defaultValues: {
      email: "",
      password: "",
      firstName: "",
      lastName: "",
      displayName: "",
      phone: "",
      username: "",
      dob: undefined,
      gender: "",
      joinedDate: undefined,
      photo: null,
      isActive: true,
      roles: [],
    },
  });

  useEffect(() => {
    if (!canReadRoles) return;
    authClient
      .listRoles({ activeOnly: true })
      .then(setRoles)
      .catch((err) => toast.error(errorMessage(err)));
  }, [canReadRoles]);

  if (!canManage) return <PermissionRequired permission={PERMISSIONS.usersManage} what="Adding a user" />;

  async function onSubmit(values: CreateUserFormValues) {
    setFormError(null);
    // `CreateUserInput`'s optional fields are plain `string | undefined` — an empty string would
    // be sent as a real value, so blanks are dropped rather than forwarded.
    const roleSlugs = canReadRoles
      ? (values.roles ?? [])
      : manualRoles
          .split(",")
          .map((role) => role.trim())
          .filter(Boolean);
    const input: CreateUserInput = {
      email: values.email,
      password: values.password,
      firstName: values.firstName || undefined,
      lastName: values.lastName || undefined,
      displayName: values.displayName || undefined,
      phone: values.phone || undefined,
      username: values.username || undefined,
      // Dates go out as plain calendar dates, not toISOString() — a midnight-local Date shifted
      // to UTC could land on the previous day.
      dob: values.dob ? format(values.dob, "yyyy-MM-dd") : undefined,
      gender: values.gender || undefined,
      joinedDate: values.joinedDate ? format(values.joinedDate, "yyyy-MM-dd") : undefined,
      photo: values.photo || undefined,
      isActive: values.isActive,
      roles: roleSlugs.length > 0 ? roleSlugs : undefined,
    };
    try {
      const user = await authClient.createUser(input);
      toast.success("User created.");
      router.push(`/users/${userIdOf(user)}`);
    } catch (err) {
      setFormError(errorMessages(err));
      toast.error(errorMessage(err));
    }
  }

  const loading = form.formState.isSubmitting;

  return (
    <div className="flex-1 space-y-4">
      <Breadcrumb items={[{ title: "Users", href: "/users" }, { title: "Add user", href: "/users/new" }]} />
      <div className="flex items-start justify-between">
        <Heading title="Add New User" description="Create a new user." />
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
                  <CardTitle className="text-2xl">User Information</CardTitle>
                  <CardDescription className="text-base">Enter user&apos;s basic information and credentials</CardDescription>
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
                                  disabled={loading}
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
                                  disabled={loading}
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
                          name="username"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>
                                Username &nbsp;
                                <span className="text-xs text-destructive dark:text-destructive-foreground">(Must be unique)</span>
                              </FormLabel>
                              <FormControl>
                                <Input
                                  disabled={loading}
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
                          name="email"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>
                                Email &nbsp;
                                <span className="text-xs text-destructive dark:text-destructive-foreground">(Must be unique)</span>
                              </FormLabel>
                              <FormControl>
                                <Input
                                  disabled={loading}
                                  placeholder="user@example.com"
                                  {...field}
                                  type="email"
                                  className="bg-background border-2 focus:border-purple-500 transition-colors"
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
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
                                  disabled={loading}
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
                      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Security</h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <FormField
                          control={form.control}
                          name="password"
                          render={({ field }) => (
                            <FormItem className="md:col-span-2">
                              <FormLabel>
                                Password &nbsp;
                                <span className="text-xs text-muted-foreground">(Min. 8 characters)</span>
                              </FormLabel>
                              <FormControl>
                                <Input
                                  type="password"
                                  disabled={loading}
                                  placeholder="Enter password"
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
                      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Additional Details</h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <FormField
                          control={form.control}
                          name="joinedDate"
                          render={({ field }) => (
                            <FormItem className="flex flex-col p-2">
                              <FormLabel>Joined Date</FormLabel>
                              <DatePicker
                                placeholder="Defaults to today"
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

                    <div className="space-y-4">
                      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Roles</h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {canReadRoles ? (
                          <FormField
                            control={form.control}
                            name="roles"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Roles</FormLabel>
                                <FormControl>
                                  <div>
                                    <RoleMultiSelect roles={roles} selected={field.value ?? []} onChange={field.onChange} />
                                  </div>
                                </FormControl>
                                <p className="text-xs text-muted-foreground">Leave empty for the default role(s).</p>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        ) : (
                          <div className="flex flex-col gap-1.5">
                            <Label htmlFor="roles">Roles</Label>
                            <Input
                              id="roles"
                              value={manualRoles}
                              onChange={(e) => setManualRoles(e.target.value)}
                              placeholder="admin, member"
                              className="bg-background border-2 focus:border-purple-500 transition-colors"
                            />
                            <p className="text-xs text-muted-foreground">Leave empty for the default role(s).</p>
                          </div>
                        )}
                      </div>
                    </div>
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
                            <PhotoUpload photo={field.value} fallback="?" onChange={field.onChange} disabled={loading} />
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </CardContent>

                <div className="flex justify-center mt-6">
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
                          <FormDescription className="text-sm">User account will be active and can log in immediately</FormDescription>
                        </div>
                      </FormItem>
                    )}
                  />
                </div>

                <CardFooter className="flex justify-center gap-4 mt-8 pb-8">
                  <Button type="button" variant="outline" onClick={() => router.push("/users")} disabled={loading}>
                    Cancel
                  </Button>
                  <Button disabled={loading} className="bg-purple-600 hover:bg-purple-700 dark:bg-purple-600 dark:hover:bg-purple-700 min-w-32" type="submit">
                    {loading ? "Creating..." : "Create User"}
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
