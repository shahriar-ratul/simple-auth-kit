import { useState, type FormEvent } from "react";
import { EyeIcon, EyeOffIcon } from "lucide-react";
import { AuthApiError } from "@easy-auth/auth-client";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";

function PasswordField({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input id={id} type={visible ? "text" : "password"} required value={value} onChange={(e) => onChange(e.target.value)} className="pr-9" />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          className="absolute inset-y-0 right-2 flex items-center text-muted-foreground hover:text-foreground"
          tabIndex={-1}
        >
          {visible ? <EyeOffIcon className="size-4" /> : <EyeIcon className="size-4" />}
        </button>
      </div>
    </div>
  );
}

export function ChangePasswordDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function reset() {
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setError(null);
    setNotice(null);
  }

  function handleClose() {
    reset();
    onClose();
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    if (newPassword !== confirmPassword) {
      setError("The new password and confirmation don't match.");
      return;
    }
    setSubmitting(true);
    try {
      await authClient.changePassword({ currentPassword, newPassword });
      setNotice("Password changed. Every other session was signed out.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      setError(err instanceof AuthApiError ? err.message : "Couldn't change the password. Check your current password and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal isOpen={open} onClose={handleClose} title="Change password" description="Every other session gets signed out — this one doesn't.">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {notice ? <p className="text-sm text-emerald-600">{notice}</p> : null}
        <PasswordField id="currentPassword" label="Current password" value={currentPassword} onChange={setCurrentPassword} />
        <PasswordField id="newPassword" label="New password" value={newPassword} onChange={setNewPassword} />
        <PasswordField id="confirmPassword" label="Confirm new password" value={confirmPassword} onChange={setConfirmPassword} />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={handleClose}>
            Close
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? "Changing…" : "Change password"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
