"use client";

import { useAbility } from "@casl/react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { AuthApiError, type LanguageSummary } from "@easy-auth/auth-client";
import { format } from "date-fns";
import { PencilIcon } from "lucide-react";
import { toast } from "sonner";
import { Breadcrumb } from "@/components/breadcrumb";
import { PermissionRequired } from "@/components/permission-required";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { PERMISSIONS, hasPermission, missingPermissionHint, type AppAbility } from "@/lib/ability";
import { authClient } from "@/lib/auth-client";

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

export default function LanguageDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const ability = useAbility<AppAbility>();
  const canRead = hasPermission(ability, PERMISSIONS.languagesRead);
  const canManage = hasPermission(ability, PERMISSIONS.languagesManage);
  const canStatus = hasPermission(ability, PERMISSIONS.languagesStatus);

  const [language, setLanguage] = useState<LanguageSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await authClient.getLanguage(id);
      setLanguage(result);
    } catch (err) {
      toast.error(apiErrorMessage(err, "Couldn't load this language."));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (!canRead) return;
    void load();
  }, [canRead, load]);

  if (!canRead) return <PermissionRequired permission={PERMISSIONS.languagesRead} what="Language details" />;

  async function toggleActive() {
    if (!language) return;
    try {
      if (language.isActive) await authClient.deactivateLanguage(id);
      else await authClient.activateLanguage(id);
      setLanguage((prev) => (prev ? { ...prev, isActive: !prev.isActive } : prev));
      toast.success(language.isActive ? "Language deactivated." : "Language activated.");
    } catch (err) {
      toast.error(apiErrorMessage(err, "Couldn't change this language's status. Try again."));
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      await authClient.deleteLanguage(id);
      toast.success("Language deleted.");
      router.push("/languages");
    } catch (err) {
      toast.error(apiErrorMessage(err, "Couldn't delete this language. Try again."));
      setDeleting(false);
      setDeleteOpen(false);
    }
  }

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
                  href={`/languages/${id}/edit`}
                  className={buttonVariants({ variant: "outline", size: "sm" })}
                  title={canManage ? undefined : missingPermissionHint(PERMISSIONS.languagesManage)}
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
                disabled={!canStatus}
                title={canStatus ? undefined : missingPermissionHint(PERMISSIONS.languagesStatus)}
                onClick={() => void toggleActive()}
              >
                {language.isActive ? "Deactivate" : "Activate"}
              </Button>

              <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
                <DialogTrigger asChild>
                  <Button variant="destructive" disabled={!canManage} title={canManage ? undefined : missingPermissionHint(PERMISSIONS.languagesManage)}>
                    Delete language
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Delete {language.name}?</DialogTitle>
                    <DialogDescription>
                      This soft-deletes the language: it stops appearing in listings and pickers, but the row is kept for audit purposes.
                    </DialogDescription>
                  </DialogHeader>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setDeleteOpen(false)} disabled={deleting}>
                      Cancel
                    </Button>
                    <Button variant="destructive" onClick={() => void handleDelete()} disabled={deleting}>
                      {deleting ? "Deleting…" : "Delete language"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
