"use client";

import { useAbility } from "@casl/react";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
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
import { Heading } from "@/components/ui/heading";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { PERMISSIONS, hasPermission, type AppAbility } from "@/lib/ability";
import { authClient } from "@/lib/auth-client";
import { errorMessage, errorMessages } from "@/lib/error";
import { useWorkspaceStore } from "@/lib/stores/store-context";
import { GENDER_OPTIONS, emptyCreateUserForm, type CreateUserFormValues } from "../user-schema";

const inputClassName = "bg-background border-2 focus:border-purple-500 transition-colors";

export default function NewUserPage() {
  const ability = useAbility<AppAbility>();
  const canManage = hasPermission(ability, PERMISSIONS.usersManage);
  const canReadRoles = hasPermission(ability, PERMISSIONS.rolesManage);
  const router = useRouter();
  const workspaces = useWorkspaceStore();
  const workspaceName = workspaces.activeWorkspace?.name ?? "this workspace";

  const [form, setForm] = useState<CreateUserFormValues>(emptyCreateUserForm);
  const [roles, setRoles] = useState<RoleSummary[]>([]);
  const [manualRoles, setManualRoles] = useState("");
  const [formError, setFormError] = useState<string[] | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!canReadRoles) return;
    authClient
      .listRoles({ activeOnly: true })
      .then(setRoles)
      .catch((err) => toast.error(errorMessage(err)));
  }, [canReadRoles]);

  if (!canManage) return <PermissionRequired permission={PERMISSIONS.usersManage} what="Adding a user" />;

  function set<K extends keyof CreateUserFormValues>(key: K, value: CreateUserFormValues[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    if (form.password.length < 8) {
      setPasswordError("Password must be at least 8 characters");
      return;
    }
    setPasswordError(null);
    // `CreateUserInput`'s optional fields are plain `string | undefined` — an empty string would
    // be sent as a real value, so blanks are dropped rather than forwarded.
    const roleSlugs = canReadRoles
      ? form.roles
      : manualRoles
          .split(",")
          .map((role) => role.trim())
          .filter(Boolean);
    const input: CreateUserInput = {
      email: form.email,
      password: form.password,
      firstName: form.firstName || undefined,
      lastName: form.lastName || undefined,
      displayName: form.displayName || undefined,
      phone: form.phone || undefined,
      username: form.username || undefined,
      dob: form.dob || undefined,
      gender: form.gender || undefined,
      joinedDate: form.joinedDate || undefined,
      photo: form.photo || undefined,
      isActive: form.isActive,
      roles: roleSlugs.length > 0 ? roleSlugs : undefined,
    };
    setLoading(true);
    try {
      const user = await authClient.createUser(input);
      toast.success("User created.");
      router.push(`/users/${userIdOf(user)}`);
    } catch (err) {
      setFormError(errorMessages(err));
      toast.error(errorMessage(err));
      setLoading(false);
    }
  }

  return (
    <div className="flex-1 space-y-4">
      <Breadcrumb items={[{ title: "Users", href: "/users" }, { title: "Add user", href: "/users/new" }]} />
      <div className="flex items-start justify-between">
        <Heading title="Add New User" description={`Create a new user. The account is usable immediately and becomes a member of ${workspaceName}.`} />
      </div>
      <Separator />

      <Card>
        <CardHeader />
        <CardContent>
          <FormErrorAlert messages={formError} />
          <form onSubmit={handleSubmit} className="space-y-8 w-full">
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
                      <div className="flex flex-col gap-1.5">
                        <Label htmlFor="firstName">First Name</Label>
                        <Input
                          id="firstName"
                          disabled={loading}
                          placeholder="First Name"
                          value={form.firstName}
                          onChange={(e) => set("firstName", e.target.value)}
                          type="text"
                          className={inputClassName}
                        />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <Label htmlFor="lastName">Last Name</Label>
                        <Input
                          id="lastName"
                          disabled={loading}
                          placeholder="Last Name"
                          value={form.lastName}
                          onChange={(e) => set("lastName", e.target.value)}
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
                      <div className="flex flex-col gap-1.5">
                        <Label htmlFor="username">
                          Username &nbsp;
                          <span className="text-xs text-destructive dark:text-destructive-foreground">(Must be unique)</span>
                        </Label>
                        <Input
                          id="username"
                          disabled={loading}
                          placeholder="Username"
                          value={form.username}
                          onChange={(e) => set("username", e.target.value)}
                          className={inputClassName}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Contact Information</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="flex flex-col gap-1.5">
                        <Label htmlFor="email">
                          Email &nbsp;
                          <span className="text-xs text-destructive dark:text-destructive-foreground">(Must be unique)</span>
                        </Label>
                        <Input
                          id="email"
                          required
                          disabled={loading}
                          placeholder="user@example.com"
                          value={form.email}
                          onChange={(e) => set("email", e.target.value)}
                          type="email"
                          className={inputClassName}
                        />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <Label htmlFor="phone">
                          Phone &nbsp;
                          <span className="text-xs text-muted-foreground">(With country code)</span>
                        </Label>
                        <Input
                          id="phone"
                          type="text"
                          disabled={loading}
                          value={form.phone}
                          onChange={(e) => set("phone", e.target.value)}
                          placeholder="+1234567890"
                          className={inputClassName}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Security</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="flex flex-col gap-1.5 md:col-span-2">
                        <Label htmlFor="password">
                          Password &nbsp;
                          <span className="text-xs text-muted-foreground">(Min. 8 characters)</span>
                        </Label>
                        <Input
                          id="password"
                          type="password"
                          required
                          disabled={loading}
                          placeholder="Enter password"
                          value={form.password}
                          onChange={(e) => set("password", e.target.value)}
                          className={inputClassName}
                        />
                        {passwordError && <p className="text-sm text-destructive">{passwordError}</p>}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Additional Details</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="flex flex-col gap-1.5 p-2">
                        <Label htmlFor="joinedDate">Joined Date</Label>
                        <Input
                          id="joinedDate"
                          type="date"
                          disabled={loading}
                          value={form.joinedDate}
                          onChange={(e) => set("joinedDate", e.target.value)}
                          className={inputClassName}
                        />
                        <p className="text-xs text-muted-foreground">Defaults to today.</p>
                      </div>
                      <div className="flex flex-col gap-1.5 p-2">
                        <Label htmlFor="dob">Date of birth</Label>
                        <Input
                          id="dob"
                          type="date"
                          disabled={loading}
                          value={form.dob}
                          onChange={(e) => set("dob", e.target.value)}
                          className={inputClassName}
                        />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <Label htmlFor="gender">Gender</Label>
                        <Select value={form.gender || undefined} onValueChange={(value) => set("gender", value)} disabled={loading}>
                          <SelectTrigger id="gender" className="w-full min-w-[200px]">
                            <SelectValue placeholder="Select Gender" />
                          </SelectTrigger>
                          <SelectContent>
                            {GENDER_OPTIONS.map((option) => (
                              <SelectItem key={option.value} value={option.value}>
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Roles</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {canReadRoles ? (
                        <div className="flex flex-col gap-1.5">
                          <Label>Roles</Label>
                          <RoleMultiSelect roles={roles} selected={form.roles} onChange={(next) => set("roles", next)} />
                          <p className="text-xs text-muted-foreground">This workspace&apos;s own roles. Leave empty for the default role(s).</p>
                        </div>
                      ) : (
                        <div className="flex flex-col gap-1.5">
                          <Label htmlFor="roles">Roles</Label>
                          <Input
                            id="roles"
                            value={manualRoles}
                            onChange={(e) => setManualRoles(e.target.value)}
                            placeholder="admin, member"
                            className={inputClassName}
                          />
                          <p className="text-xs text-muted-foreground">This workspace&apos;s own roles. Leave empty for the default role(s).</p>
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
                <PhotoUpload photo={form.photo} fallback="?" onChange={(next) => set("photo", next)} disabled={loading} />
              </CardContent>

              <div className="flex justify-center mt-6">
                <div className="flex flex-row items-center space-x-3 rounded-lg border border-purple-500 bg-purple-50 dark:bg-purple-950/20 p-4">
                  <Checkbox id="isActive" checked={form.isActive} onCheckedChange={(checked) => set("isActive", checked === true)} />
                  <div className="space-y-1 leading-none">
                    <Label htmlFor="isActive" className="text-base font-medium">
                      Active Status
                    </Label>
                    <p className="text-sm text-muted-foreground">User account will be active and can log in immediately</p>
                  </div>
                </div>
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
        </CardContent>
      </Card>
    </div>
  );
}
