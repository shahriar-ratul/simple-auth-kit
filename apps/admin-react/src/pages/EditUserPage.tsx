import { type FormEvent, useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type { RoleSummary, UpdateUserInput, UserSummary } from "@easy-auth/auth-client";
import { AuthApiError } from "@easy-auth/auth-client";
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
import { Heading } from "@/components/ui/heading";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { emptyUserFields, GENDER_OPTIONS, toDateInputValue, type UserFormFields } from "./user-schema";

function apiErrorMessage(err: unknown, fallback: string): string {
  return err instanceof AuthApiError ? err.message : fallback;
}

function toForm(user: UserSummary): UserFormFields {
  return {
    firstName: user.firstName ?? "",
    lastName: user.lastName ?? "",
    displayName: user.displayName ?? "",
    phone: user.phone ?? "",
    username: user.username ?? "",
    dob: toDateInputValue(user.dob),
    gender: user.gender ?? "",
    joinedDate: toDateInputValue(user.joinedDate),
  };
}

const inputClassName = "bg-background border-2 focus:border-purple-500 transition-colors";

export function EditUserPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const ability = useAbility();
  const canReadRoles = ability.can(PERMISSIONS.rolesManage, "permission");
  const canAssignRoles = ability.can(PERMISSIONS.rolesAssign, "permission");

  const [user, setUser] = useState<UserSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState<UserFormFields>(emptyUserFields);
  const [photo, setPhoto] = useState<string | null>(null);
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
  const [roleCatalog, setRoleCatalog] = useState<RoleSummary[]>([]);
  const [formError, setFormError] = useState<string[] | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const result = await authClient.getUser(id);
      setUser(result);
      setForm(toForm(result));
      setPhoto(result.photo);
      setSelectedRoles(result.roles);
    } catch (err) {
      toast.error(apiErrorMessage(err, "Couldn't load this user."));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!canReadRoles) return;
    authClient
      .listRoles()
      .then(setRoleCatalog)
      .catch((err) => toast.error(apiErrorMessage(err, "Couldn't load the role catalog.")));
  }, [canReadRoles]);

  if (!id) return null;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!user || !id) return;
    setFormError(null);
    setSaving(true);
    // `joinedDate` is not nullable on update, so a cleared field just leaves it unchanged.
    const input: UpdateUserInput = {
      firstName: form.firstName || null,
      lastName: form.lastName || null,
      displayName: form.displayName || null,
      phone: form.phone || null,
      username: form.username || null,
      dob: form.dob || null,
      gender: form.gender || null,
      joinedDate: form.joinedDate || undefined,
      photo: photo || null,
    };
    // No bulk "set roles" endpoint — diffs against the roles loaded at mount and assigns/revokes only the delta.
    const toAssign = selectedRoles.filter((slug) => !user.roles.includes(slug));
    const toRevoke = user.roles.filter((slug) => !selectedRoles.includes(slug));
    try {
      await Promise.all([
        authClient.updateUser(id, input),
        ...toAssign.map((slug) => authClient.assignRole(id, slug)),
        ...toRevoke.map((slug) => authClient.revokeRole(id, slug)),
      ]);
      toast.success("User updated.");
      navigate(`/users/${id}`);
    } catch (err) {
      setFormError(errorMessages(err));
      toast.error(errorMessage(err));
      setSaving(false);
    }
  }

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
            <form onSubmit={handleSubmit} className="space-y-8 w-full">
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
                        <div className="flex flex-col gap-2">
                          <Label htmlFor="firstName">First Name</Label>
                          <Input
                            id="firstName"
                            disabled={saving}
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
                            disabled={saving}
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
                            disabled={saving}
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
                            disabled={saving}
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
                          <Label htmlFor="phone">
                            Phone &nbsp;
                            <span className="text-xs text-muted-foreground">(With country code)</span>
                          </Label>
                          <Input
                            id="phone"
                            type="text"
                            disabled={saving}
                            value={form.phone}
                            onChange={(e) => setForm({ ...form, phone: e.target.value })}
                            placeholder="+1234567890"
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
                            disabled={saving}
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
                            disabled={saving}
                            value={form.dob}
                            onChange={(e) => setForm({ ...form, dob: e.target.value })}
                            className={inputClassName}
                          />
                        </div>
                        <div className="flex flex-col gap-2">
                          <Label htmlFor="gender">Gender</Label>
                          <Select value={form.gender || undefined} onValueChange={(value) => setForm({ ...form, gender: value })} disabled={saving}>
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

                    {canReadRoles && (
                      <div className="space-y-4">
                        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Roles</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <div className="flex flex-col gap-2">
                            <Label>Roles</Label>
                            <RoleMultiSelect roles={roleCatalog} selected={selectedRoles} onChange={setSelectedRoles} disabled={!canAssignRoles} />
                          </div>
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
                  <PhotoUpload photo={photo} fallback="?" onChange={(next) => setPhoto(next)} disabled={saving} />
                </CardContent>

                <CardFooter className="flex justify-center gap-4 mt-8 pb-8">
                  <Button type="button" variant="outline" onClick={() => navigate(`/users/${id}`)} disabled={saving}>
                    Cancel
                  </Button>
                  <Button disabled={saving} className="bg-purple-600 hover:bg-purple-700 dark:bg-purple-600 dark:hover:bg-purple-700 min-w-32" type="submit">
                    {saving ? "Updating..." : "Update User"}
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
