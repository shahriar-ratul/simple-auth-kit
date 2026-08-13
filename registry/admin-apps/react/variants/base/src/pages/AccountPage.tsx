import { type FormEvent, useEffect, useState } from "react";
import { observer } from "mobx-react-lite";
import { QRCodeSVG } from "qrcode.react";
import { AuthApiError } from "@easy-auth/auth-client";
import { toast } from "sonner";
import { useAuthStore } from "@/stores/store-context";
import { authClient } from "@/lib/auth-client";
import { PhotoUpload } from "@/components/photo-upload";
import { ChangePasswordDialog } from "@/components/change-password-dialog";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

function apiErrorMessage(err: unknown, fallback: string): string {
  return err instanceof AuthApiError ? err.message : fallback;
}

interface ProfileForm {
  firstName: string;
  lastName: string;
  displayName: string;
  phone: string;
  username: string;
}

function toProfileForm(user: {
  firstName: string | null;
  lastName: string | null;
  displayName: string | null;
  phone: string | null;
  username: string | null;
}): ProfileForm {
  return {
    firstName: user.firstName ?? "",
    lastName: user.lastName ?? "",
    displayName: user.displayName ?? "",
    phone: user.phone ?? "",
    username: user.username ?? "",
  };
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

export const AccountPage = observer(function AccountPage() {
  const store = useAuthStore();
  const user = store.currentUser;

  const [form, setForm] = useState<ProfileForm | null>(user ? toProfileForm(user) : null);
  const [profileSaving, setProfileSaving] = useState(false);
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);
  const [logoutAllBusy, setLogoutAllBusy] = useState(false);

  useEffect(() => {
    store.loadSessions().catch((err) => toast.error(apiErrorMessage(err, "Couldn't load active sessions.")));
  }, [store]);

  async function handlePhotoChange(photo: string | null) {
    try {
      const updated = await authClient.updateProfile({ photo });
      setForm(toProfileForm(updated));
      await store.refreshCurrentUser();
      toast.success(photo ? "Photo updated." : "Photo removed.");
    } catch (err) {
      toast.error(apiErrorMessage(err, "Couldn't update the photo. Try again."));
    }
  }

  async function handleProfileSubmit(event: FormEvent) {
    event.preventDefault();
    if (!form) return;
    setProfileSaving(true);
    try {
      const updated = await authClient.updateProfile({
        firstName: form.firstName || null,
        lastName: form.lastName || null,
        displayName: form.displayName || null,
        phone: form.phone || null,
        username: form.username || null,
      });
      setForm(toProfileForm(updated));
      await store.refreshCurrentUser();
      toast.success("Profile saved.");
    } catch (err) {
      toast.error(apiErrorMessage(err, "Couldn't save your profile. Try again."));
    } finally {
      setProfileSaving(false);
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

  if (!user || !form) return null;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">My account</h1>
        <p className="text-sm text-muted-foreground">Session details, active sessions, and two-factor authentication.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Profile</CardTitle>
          <CardDescription>Your own info — no admin permission needed to change any of this.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <PhotoUpload photo={user.photo} fallback={initialsOf(user.displayName || user.email)} onChange={handlePhotoChange} />

          <form onSubmit={handleProfileSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="account-firstName">First name</Label>
              <Input id="account-firstName" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="account-lastName">Last name</Label>
              <Input id="account-lastName" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="account-displayName">Display name</Label>
              <Input id="account-displayName" value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="account-username">Username</Label>
              <Input id="account-username" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="account-phone">Phone</Label>
              <Input id="account-phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
            <div className="flex items-end gap-2">
              <Button type="submit" disabled={profileSaving}>
                {profileSaving ? "Saving…" : "Save changes"}
              </Button>
              <Button type="button" variant="outline" onClick={() => setChangePasswordOpen(true)}>
                Change password
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Session</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-2 text-sm">
            <dt className="text-muted-foreground">User ID</dt>
            <dd className="font-mono">{user.sub}</dd>
            <dt className="text-muted-foreground">Session ID</dt>
            <dd className="font-mono">{user.sessionId}</dd>
            <dt className="text-muted-foreground">Roles</dt>
            <dd className="flex flex-wrap gap-1">
              {user.roles.map((role) => (
                <Badge key={role} variant="secondary">
                  {role}
                </Badge>
              ))}
            </dd>
            <dt className="text-muted-foreground">Permissions</dt>
            <dd className="flex flex-wrap gap-1">
              {user.permissions.length === 0 ? (
                <span className="text-muted-foreground">None</span>
              ) : (
                user.permissions.map((permission) => (
                  <Badge key={permission} variant="outline">
                    {permission}
                  </Badge>
                ))
              )}
            </dd>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Active sessions</CardTitle>
          <CardDescription>Devices/browsers currently signed in as you.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {store.sessions.length === 0 ? (
            <p className="text-sm text-muted-foreground">No active sessions.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Session ID</TableHead>
                  <TableHead>User agent</TableHead>
                  <TableHead>IP</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {store.sessions.map((session) => (
                  <TableRow key={session.id}>
                    <TableCell className="font-mono text-xs">
                      {session.id === user.sessionId ? <Badge variant="secondary">this device</Badge> : session.id.slice(0, 8)}
                    </TableCell>
                    <TableCell className="max-w-[16rem] truncate text-muted-foreground">{session.userAgent ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{session.ip ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{new Date(session.createdAt).toLocaleString()}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          <Button variant="destructive" className="w-fit" disabled={logoutAllBusy} onClick={() => void handleLogoutAll()}>
            {logoutAllBusy ? "Signing out…" : "Sign out of all sessions"}
          </Button>
        </CardContent>
      </Card>

      <TwoFactorCard />

      <ChangePasswordDialog open={changePasswordOpen} onClose={() => setChangePasswordOpen(false)} />
    </div>
  );
});

const TwoFactorCard = observer(function TwoFactorCard() {
  const store = useAuthStore();
  const user = store.currentUser;

  const [enrollment, setEnrollment] = useState<{ secret: string; provisioningUri: string } | null>(null);
  const [confirmCode, setConfirmCode] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  const [disableCode, setDisableCode] = useState("");
  const [showDisableForm, setShowDisableForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  if (!user) return null;

  async function handleEnroll() {
    setSubmitting(true);
    try {
      const result = await store.enrollTwoFactor();
      setEnrollment(result);
    } catch (err) {
      toast.error(apiErrorMessage(err, "Couldn't start 2FA enrollment. Try again."));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleConfirm(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    try {
      const result = await store.confirmTwoFactor(confirmCode);
      setBackupCodes(result.backupCodes);
      setEnrollment(null);
      setConfirmCode("");
      toast.success("Two-factor authentication enabled.");
    } catch (err) {
      toast.error(apiErrorMessage(err, "Couldn't confirm this code. Try again."));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDisable(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    try {
      await store.disableTwoFactor(disableCode);
      setShowDisableForm(false);
      setDisableCode("");
      toast.success("Two-factor authentication disabled.");
    } catch (err) {
      toast.error(apiErrorMessage(err, "Couldn't disable 2FA. Try again."));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Two-factor authentication</CardTitle>
        <CardDescription>
          {user.twoFactorEnabled ? "Enabled — a code is required at every login." : "Not enabled. Add an authenticator app for extra security."}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {backupCodes ? (
          <div className="rounded-md border border-border bg-muted/50 p-4">
            <p className="mb-2 text-sm font-medium">Save these backup codes — shown only once.</p>
            <div className="grid grid-cols-2 gap-1 font-mono text-sm">
              {backupCodes.map((code) => (
                <span key={code}>{code}</span>
              ))}
            </div>
            <Button size="sm" variant="outline" className="mt-3" onClick={() => setBackupCodes(null)}>
              Done
            </Button>
          </div>
        ) : user.twoFactorEnabled ? (
          showDisableForm ? (
            <form onSubmit={handleDisable} className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5 max-w-xs">
                <Label htmlFor="disable-code">Enter a code to confirm</Label>
                <Input id="disable-code" value={disableCode} onChange={(e) => setDisableCode(e.target.value)} autoFocus required />
              </div>
              <div className="flex gap-2">
                <Button type="submit" variant="destructive" disabled={submitting}>
                  {submitting ? "Disabling…" : "Confirm disable"}
                </Button>
                <Button type="button" variant="outline" onClick={() => setShowDisableForm(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          ) : (
            <Button variant="destructive" className="self-start" onClick={() => setShowDisableForm(true)}>
              Disable 2FA
            </Button>
          )
        ) : enrollment ? (
          <form onSubmit={handleConfirm} className="flex flex-col gap-4">
            <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
              <div className="rounded-md border border-border bg-white p-3">
                <QRCodeSVG value={enrollment.provisioningUri} size={160} />
              </div>
              <div className="flex flex-col gap-1 text-sm text-muted-foreground">
                <p>Scan with your authenticator app, or enter this secret manually:</p>
                <code className="rounded bg-muted px-2 py-1 font-mono text-xs">{enrollment.secret}</code>
              </div>
            </div>
            <div className="flex flex-col gap-1.5 max-w-xs">
              <Label htmlFor="confirm-code">Enter the 6-digit code to confirm</Label>
              <Input id="confirm-code" value={confirmCode} onChange={(e) => setConfirmCode(e.target.value)} autoFocus required />
            </div>
            <Button type="submit" disabled={submitting} className="self-start">
              {submitting ? "Confirming…" : "Confirm & enable"}
            </Button>
          </form>
        ) : (
          <Button onClick={() => void handleEnroll()} disabled={submitting} className="self-start">
            {submitting ? "Starting…" : "Enable 2FA"}
          </Button>
        )}
      </CardContent>
    </Card>
  );
});
