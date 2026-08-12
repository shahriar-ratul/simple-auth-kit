import { type FormEvent, useEffect, useState } from "react";
import type { CreateUserInput, RoleSummary } from "@easy-auth/auth-client";
import { AuthApiError, userIdOf } from "@easy-auth/auth-client";
import { observer } from "mobx-react-lite";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { PERMISSIONS, useAbility } from "@/lib/ability";
import { authClient } from "@/lib/auth-client";
import { errorMessage, errorMessages } from "@/lib/error";
import { GENDER_OPTIONS } from "@/lib/user-fields";
import { useWorkspaceStore } from "@/stores/store-context";
import { Breadcrumb } from "@/components/breadcrumb";
import { FormErrorAlert } from "@/components/form-error-alert";
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

const inputClass = "bg-background border-2 focus:border-purple-500 transition-colors";

const emptyForm = {
  email: "",
  password: "",
  firstName: "",
  lastName: "",
  displayName: "",
  phone: "",
  username: "",
  dob: "",
  gender: "",
  joinedDate: "",
};

export const AddUserPage = observer(function AddUserPage() {
  const navigate = useNavigate();
  const ability = useAbility();
  const workspaceStore = useWorkspaceStore();
  const activeWorkspaceId = workspaceStore.activeWorkspaceId;
  const workspaceName = workspaceStore.activeWorkspace?.name ?? "this workspace";
  const canReadRoles = ability.can(PERMISSIONS.rolesManage, "permission");

  const [form, setForm] = useState(emptyForm);
  const [photo, setPhoto] = useState<string | null>(null);
  const [isActive, setIsActive] = useState(true);
  const [roles, setRoles] = useState<RoleSummary[]>([]);
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
  const [manualRoles, setManualRoles] = useState("");
  const [formError, setFormError] = useState<string[] | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Roles are per workspace, same as `RolesPage`: switching has to re-fetch the catalog this
  // picker offers, or it could show one workspace's roles while creating a member of another.
  // Filtered to active roles, same as the permission grid on RolesPage, so the picker doesn't
  // offer a retired role.
  useEffect(() => {
    setRoles([]);
    if (!canReadRoles) return;
    authClient
      .listRoles({ activeOnly: true })
      .then(setRoles)
      .catch((err) => toast.error(err instanceof AuthApiError ? err.message : "Couldn't load the role catalog."));
  }, [canReadRoles, activeWorkspaceId]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    setSubmitting(true);
    try {
      const roleSlugs = canReadRoles
        ? selectedRoles
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
        photo: photo || undefined,
        isActive,
        roles: roleSlugs.length > 0 ? roleSlugs : undefined,
      };
      // No scope argument: the client sends the active workspace's `X-Workspace-Id` by default,
      // so this new account becomes a member of whichever workspace the console is currently in.
      const user = await authClient.createUser(input);
      toast.success("User created.");
      navigate(`/users/${userIdOf(user)}`);
    } catch (err) {
      setFormError(errorMessages(err));
      toast.error(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  function field(name: keyof typeof emptyForm) {
    return {
      value: form[name],
      onChange: (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [name]: e.target.value }),
      disabled: submitting,
    };
  }

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
          <form onSubmit={handleSubmit} className="space-y-8 w-full">
            <Card className="w-full">
              <CardHeader className="border-b bg-muted/50">
                <CardTitle className="text-2xl">User Information</CardTitle>
                <CardDescription className="text-base">Enter user's basic information and credentials</CardDescription>
              </CardHeader>
              <CardContent className="pt-6">
                <div className="space-y-6">
                  <div className="space-y-4">
                    <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Personal Information</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="flex flex-col gap-2">
                        <Label htmlFor="firstName">First Name</Label>
                        <Input id="firstName" type="text" placeholder="First Name" className={inputClass} {...field("firstName")} />
                      </div>
                      <div className="flex flex-col gap-2">
                        <Label htmlFor="lastName">Last Name</Label>
                        <Input id="lastName" type="text" placeholder="Last Name" className={inputClass} {...field("lastName")} />
                      </div>
                      <div className="flex flex-col gap-2">
                        <Label htmlFor="displayName">Display Name</Label>
                        <Input id="displayName" type="text" placeholder="Display Name" className={inputClass} {...field("displayName")} />
                      </div>
                      <div className="flex flex-col gap-2">
                        <Label htmlFor="username">
                          Username &nbsp;
                          <span className="text-xs text-destructive dark:text-destructive-foreground">(Must be unique)</span>
                        </Label>
                        <Input id="username" placeholder="Username" className={inputClass} {...field("username")} />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Contact Information</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="flex flex-col gap-2">
                        <Label htmlFor="email">
                          Email &nbsp;
                          <span className="text-xs text-destructive dark:text-destructive-foreground">(Must be unique)</span>
                        </Label>
                        <Input id="email" type="email" required placeholder="user@example.com" className={inputClass} {...field("email")} />
                      </div>
                      <div className="flex flex-col gap-2">
                        <Label htmlFor="phone">
                          Phone &nbsp;
                          <span className="text-xs text-muted-foreground">(With country code)</span>
                        </Label>
                        <Input id="phone" type="text" placeholder="+1234567890" className={inputClass} {...field("phone")} />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Security</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="flex flex-col gap-2 md:col-span-2">
                        <Label htmlFor="password">
                          Password &nbsp;
                          <span className="text-xs text-muted-foreground">(Min. 8 characters)</span>
                        </Label>
                        <Input
                          id="password"
                          type="password"
                          required
                          minLength={8}
                          placeholder="Enter password"
                          className={inputClass}
                          {...field("password")}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Additional Details</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="flex flex-col gap-2 p-2">
                        <Label htmlFor="joinedDate">Joined Date</Label>
                        <Input id="joinedDate" type="date" title="Defaults to today" className={inputClass} {...field("joinedDate")} />
                      </div>
                      <div className="flex flex-col gap-2 p-2">
                        <Label htmlFor="dob">Date of birth</Label>
                        <Input id="dob" type="date" className={inputClass} {...field("dob")} />
                      </div>
                      <div className="flex flex-col gap-2">
                        <Label htmlFor="gender">Gender</Label>
                        <Select value={form.gender} onValueChange={(value) => setForm({ ...form, gender: value })} disabled={submitting}>
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
                        <div className="flex flex-col gap-2">
                          <Label>Roles</Label>
                          <RoleMultiSelect roles={roles} selected={selectedRoles} onChange={setSelectedRoles} />
                          <p className="text-xs text-muted-foreground">Scoped to {workspaceName}. Leave empty for the default role(s).</p>
                        </div>
                      ) : (
                        <div className="flex flex-col gap-2">
                          <Label htmlFor="roles">Roles</Label>
                          <Input
                            id="roles"
                            value={manualRoles}
                            onChange={(e) => setManualRoles(e.target.value)}
                            placeholder="admin, member"
                            className={inputClass}
                          />
                          <p className="text-xs text-muted-foreground">Scoped to {workspaceName}. Leave empty for the default role(s).</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>

              <CardHeader className="border-b bg-muted/50 mt-6">
                <CardTitle className="text-2xl">Profile Photo</CardTitle>
                <CardDescription className="text-base">Upload user's profile picture (Max size: 2MB, Formats: JPG, PNG)</CardDescription>
              </CardHeader>
              <CardContent className="pt-6">
                <PhotoUpload photo={photo} fallback="?" onChange={(next) => setPhoto(next)} disabled={submitting} />
              </CardContent>

              <div className="flex justify-center mt-6">
                <div className="flex flex-row items-center space-x-3 space-y-0 rounded-lg border border-purple-500 bg-purple-50 dark:bg-purple-950/20 p-4">
                  <Checkbox id="isActive" checked={isActive} onCheckedChange={(checked) => setIsActive(checked === true)} />
                  <div className="space-y-1 leading-none">
                    <Label htmlFor="isActive" className="text-base font-medium">
                      Active Status
                    </Label>
                    <p className="text-sm text-muted-foreground">User account will be active and can log in immediately</p>
                  </div>
                </div>
              </div>

              <CardFooter className="flex justify-center gap-4 mt-8 pb-8">
                <Button type="button" variant="outline" onClick={() => navigate("/users")} disabled={submitting}>
                  Cancel
                </Button>
                <Button
                  disabled={submitting}
                  className="bg-purple-600 hover:bg-purple-700 dark:bg-purple-600 dark:hover:bg-purple-700 min-w-32"
                  type="submit"
                >
                  {submitting ? "Creating..." : "Create User"}
                </Button>
              </CardFooter>
            </Card>
          </form>
        </CardContent>
      </Card>
    </div>
  );
});
