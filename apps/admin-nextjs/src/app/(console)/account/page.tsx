"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { observer } from "mobx-react-lite";
import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { AuthApiError, type SessionSummary } from "@easy-auth/auth-client";
import { toast } from "sonner";
import { z } from "zod";
import { Breadcrumb } from "@/components/breadcrumb";
import { FormErrorAlert } from "@/components/form-error-alert";
import { PhotoUpload } from "@/components/photo-upload";
import { Alert } from "@/components/ui/alert";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Heading } from "@/components/ui/heading";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { authClient } from "@/lib/auth-client";
import { errorMessages } from "@/lib/error";
import { useAuthStore } from "@/lib/stores/store-context";

function apiErrorMessage(err: unknown, fallback: string): string {
  return err instanceof AuthApiError ? err.message : fallback;
}

function initialsOf(label: string): string {
  return (
    label
      .split(/[@.\s]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "?"
  );
}

const profileSchema = z.object({
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  displayName: z.string().optional(),
  phone: z.string().optional(),
  username: z.string().optional(),
});
type ProfileFormValues = z.infer<typeof profileSchema>;
const emptyProfileValues: ProfileFormValues = { firstName: "", lastName: "", displayName: "", phone: "", username: "" };

function toForm(user: { firstName: string | null; lastName: string | null; displayName: string | null; phone: string | null; username: string | null }): ProfileFormValues {
  return {
    firstName: user.firstName ?? "",
    lastName: user.lastName ?? "",
    displayName: user.displayName ?? "",
    phone: user.phone ?? "",
    username: user.username ?? "",
  };
}

export default observer(function AccountPage() {
  const store = useAuthStore();
  const user = store.currentUser;

  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [submitError, setSubmitError] = useState<unknown>(null);

  const [sessions, setSessions] = useState<SessionSummary[]>([]);

  const [enrollment, setEnrollment] = useState<{ secret: string; provisioningUri: string } | null>(null);
  const [enrollCode, setEnrollCode] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  const [disableCode, setDisableCode] = useState("");
  const [twoFactorBusy, setTwoFactorBusy] = useState(false);
  const [logoutAllBusy, setLogoutAllBusy] = useState(false);

  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: emptyProfileValues,
  });

  useEffect(() => {
    store
      .listSessions()
      .then(setSessions)
      .catch((err) => toast.error(apiErrorMessage(err, "Couldn't load active sessions.")));
  }, [store]);

  async function handleEnroll() {
    setTwoFactorBusy(true);
    try {
      const result = await store.enrollTwoFactor();
      setEnrollment(result);
    } catch (err) {
      toast.error(apiErrorMessage(err, "Couldn't start 2FA enrollment. Try again."));
    } finally {
      setTwoFactorBusy(false);
    }
  }

  async function handleConfirm() {
    setTwoFactorBusy(true);
    try {
      const result = await store.confirmTwoFactor(enrollCode);
      setBackupCodes(result.backupCodes);
      setEnrollment(null);
      setEnrollCode("");
      toast.success("Two-factor authentication enabled.");
    } catch (err) {
      toast.error(apiErrorMessage(err, "Couldn't confirm this code. Try again."));
    } finally {
      setTwoFactorBusy(false);
    }
  }

  async function handleDisable() {
    setTwoFactorBusy(true);
    try {
      await store.disableTwoFactor(disableCode);
      setDisableCode("");
      setBackupCodes(null);
      toast.success("Two-factor authentication disabled.");
    } catch (err) {
      toast.error(apiErrorMessage(err, "Couldn't disable 2FA. Try again."));
    } finally {
      setTwoFactorBusy(false);
    }
  }

  async function handleLogoutAll() {
    setLogoutAllBusy(true);
    try {
      await store.logoutAll();
      toast.success("Signed out of all sessions. You'll need to sign in again.");
    } catch (err) {
      toast.error(apiErrorMessage(err, "Couldn't sign out of all sessions. Try again."));
    } finally {
      setLogoutAllBusy(false);
    }
  }

  async function handlePhotoChange(photo: string | null) {
    try {
      await authClient.updateProfile({ photo });
      await store.refreshCurrentUser();
      toast.success(photo ? "Photo updated." : "Photo removed.");
    } catch (err) {
      toast.error(apiErrorMessage(err, "Couldn't update the photo. Try again."));
    }
  }

  function startEditing() {
    if (!user) return;
    form.reset(toForm(user));
    setSubmitError(null);
    setEditing(true);
  }

  function cancelEditing() {
    if (user) form.reset(toForm(user));
    setSubmitError(null);
    setEditing(false);
  }

  async function handleProfileSave(values: ProfileFormValues) {
    setSaving(true);
    setSubmitError(null);
    try {
      await authClient.updateProfile({
        firstName: values.firstName || null,
        lastName: values.lastName || null,
        displayName: values.displayName || null,
        phone: values.phone || null,
        username: values.username || null,
      });
      await store.refreshCurrentUser();
      toast.success("Profile saved.");
      setEditing(false);
    } catch (err) {
      setSubmitError(err);
      toast.error(apiErrorMessage(err, "Couldn't save this profile. Try again."));
    } finally {
      setSaving(false);
    }
  }

  if (!user) return null;

  const displayLabel = user.displayName || user.email;

  return (
    <div className="flex-1 space-y-4">
      <Breadcrumb items={[{ title: "Profile", href: "/account" }]} />
      <div className="flex items-start justify-between">
        <Heading title="Profile" description="Manage your account information and security." />
      </div>
      <Separator />

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle>Profile</CardTitle>
            <CardDescription>Your own info — no admin permission needed to change any of this.</CardDescription>
          </div>
          <div className="flex shrink-0 gap-2">
            <Button asChild type="button" variant="outline">
              <Link href="/account/change-password">Change password</Link>
            </Button>
            {!editing && (
              <Button type="button" onClick={startEditing}>
                Edit
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {editing ? (
            <>
              <FormErrorAlert messages={submitError ? errorMessages(submitError) : null} />
              <Form {...form}>
                <form onSubmit={form.handleSubmit(handleProfileSave)} className="space-y-8 w-full">
                  <Card className="w-full">
                    <CardHeader className="border-b bg-muted/50">
                      <CardTitle className="text-2xl">Profile Information</CardTitle>
                      <CardDescription className="text-base">Update your personal information</CardDescription>
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
                      </div>
                    </CardContent>

                    <CardHeader className="border-b bg-muted/50 mt-6">
                      <CardTitle className="text-2xl">Profile Photo</CardTitle>
                      <CardDescription className="text-base">Upload your profile picture (Max size: 2MB, Formats: JPG, PNG)</CardDescription>
                    </CardHeader>
                    <CardContent className="pt-6">
                      <PhotoUpload photo={user.photo} fallback={initialsOf(displayLabel)} onChange={handlePhotoChange} disabled={saving} />
                    </CardContent>

                    <CardFooter className="flex justify-center gap-4 mt-8 pb-8">
                      <Button type="button" variant="outline" disabled={saving} onClick={cancelEditing}>
                        Cancel
                      </Button>
                      <Button disabled={saving} className="bg-purple-600 hover:bg-purple-700 dark:bg-purple-600 dark:hover:bg-purple-700 min-w-32" type="submit">
                        {saving ? "Updating..." : "Update Profile"}
                      </Button>
                    </CardFooter>
                  </Card>
                </form>
              </Form>
            </>
          ) : (
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-4">
                <Avatar className="size-16 shrink-0">
                  {user.photo && <AvatarImage src={user.photo} alt="" className="object-cover" />}
                  <AvatarFallback className="text-base">{initialsOf(displayLabel)}</AvatarFallback>
                </Avatar>
                <div>
                  <div className="text-base font-medium">{displayLabel}</div>
                  <div className="text-sm text-muted-foreground">{user.email}</div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
                <div>
                  <div className="text-xs text-muted-foreground">First name</div>
                  <div>{user.firstName || "—"}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Last name</div>
                  <div>{user.lastName || "—"}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Display name</div>
                  <div>{user.displayName || "—"}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Username</div>
                  <div>{user.username || "—"}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Phone</div>
                  <div>{user.phone || "—"}</div>
                </div>
              </div>

              <div>
                <div className="mb-1 text-xs text-muted-foreground">Roles</div>
                <div className="flex flex-wrap gap-1">
                  {user.roles.length === 0 && <span className="text-sm text-muted-foreground">No roles</span>}
                  {user.roles.map((role) => (
                    <Badge key={role} variant="outline">
                      {role}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>My account</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
          <div>
            <div className="text-xs text-muted-foreground">User ID</div>
            <div className="font-mono text-xs">{user.sub}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Session</div>
            <div className="font-mono text-xs">{user.sessionId}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Roles</div>
            <div className="flex flex-wrap gap-1">
              {user.roles.length === 0 && "—"}
              {user.roles.map((role) => (
                <Badge key={role} variant="outline">
                  {role}
                </Badge>
              ))}
            </div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Permissions</div>
            <div className="flex flex-wrap gap-1">
              {user.permissions.length === 0 && "—"}
              {user.permissions.map((permission) => (
                <Badge key={permission} variant="outline">
                  {permission}
                </Badge>
              ))}
            </div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Two-factor</div>
            <Badge variant={user.twoFactorEnabled ? "success" : "outline"}>{user.twoFactorEnabled ? "Enabled" : "Disabled"}</Badge>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Active sessions</CardTitle>
          <CardDescription>Only bulk sign-out is available — the backend doesn&apos;t yet expose per-session revocation.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Session</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>User agent</TableHead>
                <TableHead>IP</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sessions.map((session) => (
                <TableRow key={session.id}>
                  <TableCell className="font-mono text-xs">
                    {session.id}
                    {session.id === user.sessionId && (
                      <Badge variant="outline" className="ml-2">
                        This device
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{new Date(session.createdAt).toLocaleString()}</TableCell>
                  <TableCell className="max-w-xs truncate text-xs text-muted-foreground">{session.userAgent ?? "—"}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{session.ip ?? "—"}</TableCell>
                </TableRow>
              ))}
              {sessions.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-sm text-muted-foreground">
                    No active sessions.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          <Button variant="destructive" className="w-fit" disabled={logoutAllBusy} onClick={handleLogoutAll}>
            {logoutAllBusy ? "Signing out…" : "Sign out of all sessions"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Two-factor authentication</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {backupCodes && (
            <Alert variant="success">
              <p className="mb-2 font-medium">Save these backup codes — they won&apos;t be shown again:</p>
              <ul className="grid grid-cols-2 gap-1 font-mono text-xs sm:grid-cols-5">
                {backupCodes.map((code) => (
                  <li key={code}>{code}</li>
                ))}
              </ul>
            </Alert>
          )}

          {user.twoFactorEnabled ? (
            <div className="flex flex-col gap-3">
              <p className="text-sm text-muted-foreground">Two-factor authentication is enabled on your account.</p>
              <div className="flex items-end gap-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="disableCode">Enter a code to disable</Label>
                  <Input id="disableCode" value={disableCode} onChange={(e) => setDisableCode(e.target.value)} placeholder="123456" />
                </div>
                <Button variant="destructive" disabled={twoFactorBusy || !disableCode} onClick={handleDisable}>
                  {twoFactorBusy ? "Disabling…" : "Disable 2FA"}
                </Button>
              </div>
            </div>
          ) : enrollment ? (
            <div className="flex flex-col gap-3">
              <p className="text-sm text-muted-foreground">Scan this QR code with your authenticator app, then enter the 6-digit code it shows.</p>
              <div className="w-fit rounded-md border border-border bg-white p-3">
                <QRCodeSVG value={enrollment.provisioningUri} size={176} />
              </div>
              <p className="font-mono text-xs text-muted-foreground">Secret: {enrollment.secret}</p>
              <div className="flex items-end gap-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="enrollCode">Confirmation code</Label>
                  <Input id="enrollCode" value={enrollCode} onChange={(e) => setEnrollCode(e.target.value)} placeholder="123456" />
                </div>
                <Button disabled={twoFactorBusy || !enrollCode} onClick={handleConfirm}>
                  {twoFactorBusy ? "Confirming…" : "Confirm"}
                </Button>
                <Button variant="ghost" onClick={() => setEnrollment(null)}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <p className="text-sm text-muted-foreground">Two-factor authentication is not enabled on your account.</p>
              <Button className="w-fit" disabled={twoFactorBusy} onClick={handleEnroll}>
                {twoFactorBusy ? "Starting…" : "Enable 2FA"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
});
