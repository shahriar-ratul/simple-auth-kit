import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { AuthApiError, type LanguageSummary } from "@easy-auth/auth-client";
import { format } from "date-fns";
import { PencilIcon } from "lucide-react";
import { toast } from "sonner";
import { PERMISSIONS, useAbility } from "@/lib/ability";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/cn";
import { Breadcrumb } from "@/components/breadcrumb";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";

function apiErrorMessage(err: unknown, fallback: string): string {
  return err instanceof AuthApiError ? err.message : fallback;
}

function field(label: string, value: string | null) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm">{value || "—"}</span>
    </div>
  );
}

export function LanguageDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const ability = useAbility();
  const canManage = ability.can(PERMISSIONS.languagesManage, "permission");
  const canStatus = ability.can(PERMISSIONS.languagesStatus, "permission");

  const [language, setLanguage] = useState<LanguageSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [statusPending, setStatusPending] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      setLanguage(await authClient.getLanguage(id));
    } catch (err) {
      toast.error(apiErrorMessage(err, "Couldn't load this language."));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function toggleActive() {
    if (!id || !language) return;
    setStatusPending(true);
    try {
      if (language.isActive) await authClient.deactivateLanguage(id);
      else await authClient.activateLanguage(id);
      setLanguage((prev) => (prev ? { ...prev, isActive: !prev.isActive } : prev));
      toast.success(language.isActive ? "Language deactivated." : "Language activated.");
    } catch (err) {
      toast.error(apiErrorMessage(err, "Couldn't change this language's status. Try again."));
    } finally {
      setStatusPending(false);
    }
  }

  if (!id) return null;

  return (
    <div className="flex flex-col gap-4">
      <Breadcrumb items={[{ title: "Languages", href: "/languages" }, { title: language?.name ?? "Details", href: `/languages/${id}` }]} />

      {loading && !language && <p className="text-sm text-muted-foreground">Loading…</p>}

      {language && (
        <>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>{language.name}</CardTitle>
                <CardDescription>
                  Created: {format(new Date(language.createdAt), "dd MMM yyyy")} · Updated: {format(new Date(language.updatedAt), "dd MMM yyyy")}
                </CardDescription>
              </div>
              <div className="flex items-center gap-1.5">
                {language.isDefault && <Badge variant="secondary">Default</Badge>}
                <Badge variant={language.isActive ? "success" : "destructive"}>{language.isActive ? "Active" : "Inactive"}</Badge>
                <Link
                  to={`/languages/${id}/edit`}
                  className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
                  title={canManage ? undefined : `You need the "${PERMISSIONS.languagesManage}" permission to do this.`}
                  aria-disabled={!canManage}
                  onClick={(e) => !canManage && e.preventDefault()}
                >
                  <PencilIcon />
                  Edit
                </Link>
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {field("Name", language.name)}
                {field("Native name", language.nativeName)}
                {field("Code", language.code)}
                {field("Direction", language.direction === "rtl" ? "Right to left (RTL)" : "Left to right (LTR)")}
                {field("Default language", language.isDefault ? "Yes" : "No")}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Danger zone</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              <Button
                variant={language.isActive ? "destructive" : "outline"}
                disabled={!canStatus || statusPending}
                title={canStatus ? undefined : `You need the "${PERMISSIONS.languagesStatus}" permission to do this.`}
                onClick={() => void toggleActive()}
              >
                {language.isActive ? "Deactivate" : "Activate"}
              </Button>

              <Button
                variant="destructive"
                disabled={!canManage}
                title={canManage ? undefined : `You need the "${PERMISSIONS.languagesManage}" permission to do this.`}
                onClick={() => setConfirmingDelete(true)}
              >
                Delete language
              </Button>
            </CardContent>
          </Card>
        </>
      )}

      <DeleteLanguageDialog
        open={confirmingDelete}
        name={language?.name ?? ""}
        languageId={id}
        onClose={() => setConfirmingDelete(false)}
        onDeleted={() => navigate("/languages")}
      />
    </div>
  );
}

function DeleteLanguageDialog({
  open,
  name,
  languageId,
  onClose,
  onDeleted,
}: {
  open: boolean;
  name: string;
  languageId: string;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [submitting, setSubmitting] = useState(false);

  async function handleDelete() {
    setSubmitting(true);
    try {
      await authClient.deleteLanguage(languageId);
      toast.success("Language deleted.");
      onDeleted();
    } catch (err) {
      toast.error(apiErrorMessage(err, "Couldn't delete this language. Try again."));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      title={`Delete ${name || "this language"}?`}
      description="This soft-deletes the language: it stops appearing in listings and pickers, but the row is kept for audit purposes."
    >
      <div className="flex flex-col gap-4">
        <div className="flex gap-2">
          <Button variant="destructive" disabled={submitting} onClick={() => void handleDelete()}>
            {submitting ? "Deleting…" : "Delete language"}
          </Button>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </div>
    </Modal>
  );
}
