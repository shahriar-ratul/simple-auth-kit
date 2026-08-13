"use client";

import { observer } from "mobx-react-lite";
import { QRCodeSVG } from "qrcode.react";
import { useEffect, useState } from "react";
import { AuthApiError, type SessionSummary } from "@easy-auth/auth-client";
import { toast } from "sonner";
import { ChangePasswordDialog } from "@/components/change-password-dialog";
import { PhotoUpload } from "@/components/photo-upload";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { authClient } from "@/lib/auth-client";
import { useAuthStore, useWorkspaceStore } from "@/lib/stores/store-context";

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

type ProfileForm = { firstName: string; lastName: string; displayName: string; phone: string; username: string };

function toForm(user: { firstName: string | null; lastName: string | null; displayName: string | null; phone: string | null; username: string | null }): ProfileForm {
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
  const workspaces = useWorkspaceStore();
  const user = store.currentUser;
  const workspaceName = workspaces.activeWorkspace?.name ?? null;

  const [form, setForm] = useState<ProfileForm | null>(user ? toForm(user) : null);
  const [profileSaving, setProfileSaving] = useState(false);
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);

  const [sessions, setSessions] = useState<SessionSummary[]>([]);

  const [enrollment, setEnrollment] = useState<{ secret: string; provisioningUri: string } | null>(null);
  const [enrollCode, setEnrollCode] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  const [disableCode, setDisableCode] = useState("");
  const [twoFactorBusy, setTwoFactorBusy] = useState(false);
  const [logoutAllBusy, setLogoutAllBusy] = useState(false);

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
      const updated = await authClient.updateProfile({ photo });
      setForm(toForm(updated));
      await store.refreshCurrentUser();
      toast.success(photo ? "Photo updated." : "Photo removed.");
    } catch (err) {
      toast.error(apiErrorMessage(err, "Couldn't update the photo. Try again."));
    }
  }

  async function handleProfileSave(event: React.FormEvent) {
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
      setForm(toForm(updated));
      await store.refreshCurrentUser();
      toast.success("Profile saved.");
    } catch (err) {
      toast.error(apiErrorMessage(err, "Couldn't save this profile. Try again."));
    } finally {
      setProfileSaving(false);
    }
  }

  if (!user || !form) return null;

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
          <CardDescription>Your own info — no admin permission needed to change any of this.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <PhotoUpload photo={user.photo} fallback={initialsOf(user.displayName || user.email)} onChange={handlePhotoChange} />

          <form onSubmit={handleProfileSave} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="firstName">First name</Label>
              <Input id="firstName" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="lastName">Last name</Label>
              <Input id="lastName" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="displayName">Display name</Label>
              <Input id="displayName" value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="username">Username</Label>
              <Input id="username" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="phone">Phone</Label>
              <Input id="phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
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
          <CardTitle>My account</CardTitle>
          <CardDescription>
            {workspaceName
              ? `Roles and permissions below are the ones you hold in ${workspaceName} — they are different in every workspace.`
              : "You're not in a workspace, so you hold no roles or permissions right now."}
          </CardDescription>
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
          <CardDescription>Only bulk sign-out is available — the backend doesn't yet expose per-session revocation.</CardDescription>
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

      <ChangePasswordDialog open={changePasswordOpen} onOpenChange={setChangePasswordOpen} />
    </div>
  );
});
