import { type FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { CreateUserInput, RoleSummary } from "@easy-auth/auth-client";
import { AuthApiError, userIdOf } from "@easy-auth/auth-client";
import { toast } from "sonner";
import { PERMISSIONS, useAbility } from "@/lib/ability";
import { authClient } from "@/lib/auth-client";
import { errorMessage, errorMessages } from "@/lib/error";
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
import { emptyUserFields, GENDER_OPTIONS } from "./user-schema";

function apiErrorMessage(err: unknown, fallback: string): string {
  return err instanceof AuthApiError ? err.message : fallback;
}

const inputClassName = "bg-background border-2 focus:border-purple-500 transition-colors";

export function AddUserPage() {
  const navigate = useNavigate();
  const ability = useAbility();
  const canReadRoles = ability.can(PERMISSIONS.rolesManage, "permission");

  const [form, setForm] = useState({ ...emptyUserFields, email: "", password: "" });
  const [photo, setPhoto] = useState<string | null>(null);
  const [isActive, setIsActive] = useState(true);
  const [roles, setRoles] = useState<RoleSummary[]>([]);
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
  const [manualRoles, setManualRoles] = useState("");
  const [formError, setFormError] = useState<string[] | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!canReadRoles) return;
    authClient
      .listRoles({ activeOnly: true })
      .then(setRoles)
      .catch((err) => toast.error(apiErrorMessage(err, "Couldn't load the role catalog.")));
  }, [canReadRoles]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    setLoading(true);
    try {
      const roleSlugs = canReadRoles
        ? selectedRoles
        : manualRoles
            .split(",")
            .map((role) => role.trim())
            .filter(Boolean);
      // `CreateUserInput`'s optional fields are plain `string | undefined` — an empty string would
      // be sent as a real value, so blanks are dropped rather than forwarded.
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
      const user = await authClient.createUser(input);
      toast.success("User created.");
      navigate(`/users/${userIdOf(user)}`);
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
                <CardDescription className="text-base">Enter user&apos;s basic information and credentials</CardDescription>
              </CardHeader>
              <CardContent className="pt-6">
                <div className="space-y-6">
                  <div className="space-y-4">
                    <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Personal Information</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="flex flex-col gap-2">
                        <Label htmlFor="firstName">First Name</Label>
                        <Input
                          id="firstName"
                          disabled={loading}
                          placeholder="First Name"
                          value={form.firstName}
                          onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                          type="text"
                          className={inputClassName}
                        />
                      </div>
                      <div className="flex flex-col gap-2">
                        <Label htmlFor="lastName">Last Name</Label>
                        <Input
                          id="lastName"
                          disabled={loading}
                          placeholder="Last Name"
                          value={form.lastName}
                          onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                          type="text"
                          className={inputClassName}
                        />
                      </div>
                      <div className="flex flex-col gap-2">
                        <Label htmlFor="displayName">Display Name</Label>
                        <Input
                          id="displayName"
                          disabled={loading}
                          placeholder="Display Name"
                          value={form.displayName}
                          onChange={(e) => setForm({ ...form, displayName: e.target.value })}
                          type="text"
                          className={inputClassName}
                        />
                      </div>
                      <div className="flex flex-col gap-2">
                        <Label htmlFor="username">
                          Username &nbsp;
                          <span className="text-xs text-destructive dark:text-destructive-foreground">(Must be unique)</span>
                        </Label>
                        <Input
                          id="username"
                          disabled={loading}
                          placeholder="Username"
                          value={form.username}
                          onChange={(e) => setForm({ ...form, username: e.target.value })}
                          className={inputClassName}
                        />
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
                        <Input
                          id="email"
                          disabled={loading}
                          placeholder="user@example.com"
                          required
                          value={form.email}
                          onChange={(e) => setForm({ ...form, email: e.target.value })}
                          type="email"
                          className={inputClassName}
                        />
                      </div>
                      <div className="flex flex-col gap-2">
                        <Label htmlFor="phone">
                          Phone &nbsp;
                          <span className="text-xs text-muted-foreground">(With country code)</span>
                        </Label>
                        <Input
                          id="phone"
                          type="text"
                          disabled={loading}
                          value={form.phone}
                          onChange={(e) => setForm({ ...form, phone: e.target.value })}
                          placeholder="+1234567890"
                          className={inputClassName}
                        />
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
                          disabled={loading}
                          placeholder="Enter password"
                          required
                          minLength={8}
                          value={form.password}
                          onChange={(e) => setForm({ ...form, password: e.target.value })}
                          className={inputClassName}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Additional Details</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="flex flex-col gap-2 p-2">
                        <Label htmlFor="joinedDate">Joined Date</Label>
                        <Input
                          id="joinedDate"
                          type="date"
                          disabled={loading}
                          placeholder="Defaults to today"
                          value={form.joinedDate}
                          onChange={(e) => setForm({ ...form, joinedDate: e.target.value })}
                          className={inputClassName}
                        />
                      </div>
                      <div className="flex flex-col gap-2 p-2">
                        <Label htmlFor="dob">Date of birth</Label>
                        <Input
                          id="dob"
                          type="date"
                          disabled={loading}
                          value={form.dob}
                          onChange={(e) => setForm({ ...form, dob: e.target.value })}
                          className={inputClassName}
                        />
                      </div>
                      <div className="flex flex-col gap-2">
                        <Label htmlFor="gender">Gender</Label>
                        <Select value={form.gender || undefined} onValueChange={(value) => setForm({ ...form, gender: value })} disabled={loading}>
                          <SelectTrigger id="gender" className={`w-full ${inputClassName}`}>
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
                          <p className="text-xs text-muted-foreground">Leave empty for the default role(s).</p>
                        </div>
                      ) : (
                        <div className="flex flex-col gap-2">
                          <Label htmlFor="roles">Roles</Label>
                          <Input
                            id="roles"
                            value={manualRoles}
                            onChange={(e) => setManualRoles(e.target.value)}
                            placeholder="admin, member"
                            className={inputClassName}
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
                <PhotoUpload photo={photo} fallback="?" onChange={(next) => setPhoto(next)} disabled={loading} />
              </CardContent>

              <div className="flex justify-center mt-6">
                <label className="flex flex-row items-center space-x-3 rounded-lg border border-purple-500 bg-purple-50 dark:bg-purple-950/20 p-4">
                  <Checkbox checked={isActive} onCheckedChange={(checked) => setIsActive(checked === true)} />
                  <span className="space-y-1 leading-none">
                    <span className="block text-base font-medium">Active Status</span>
                    <span className="block text-sm text-muted-foreground">User account will be active and can log in immediately</span>
                  </span>
                </label>
              </div>

              <CardFooter className="flex justify-center gap-4 mt-8 pb-8">
                <Button type="button" variant="outline" onClick={() => navigate("/users")} disabled={loading}>
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
