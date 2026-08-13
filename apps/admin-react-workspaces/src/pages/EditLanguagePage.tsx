import { type FormEvent, useCallback, useEffect, useState } from "react";
import { observer } from "mobx-react-lite";
import { useNavigate, useParams } from "react-router-dom";
import { AuthApiError, type LanguageSummary, type UpdateLanguageInput } from "@easy-auth/auth-client";
import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";
import { errorMessage, errorMessages } from "@/lib/error";
import { useWorkspaceStore } from "@/stores/store-context";
import { Breadcrumb } from "@/components/breadcrumb";
import { FormErrorAlert } from "@/components/form-error-alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Combobox } from "@/components/ui/combobox";
import { Heading } from "@/components/ui/heading";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { DIRECTION_OPTIONS, emptyLanguageFields, type LanguageFormFields } from "./language-schema";

function apiErrorMessage(err: unknown, fallback: string): string {
  return err instanceof AuthApiError ? err.message : fallback;
}

function toForm(language: LanguageSummary): LanguageFormFields {
  return {
    code: language.code,
    name: language.name,
    nativeName: language.nativeName,
    direction: language.direction === "rtl" ? "rtl" : "ltr",
    isDefault: language.isDefault,
    isActive: language.isActive,
  };
}

const inputClassName = "bg-background border-2 focus:border-purple-500 transition-colors";

export const EditLanguagePage = observer(function EditLanguagePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const workspaceStore = useWorkspaceStore();
  const activeWorkspaceId = workspaceStore.activeWorkspaceId;

  const [language, setLanguage] = useState<LanguageSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState<LanguageFormFields>(emptyLanguageFields);
  const [formError, setFormError] = useState<string[] | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const result = await authClient.getLanguage(id);
      setLanguage(result);
      setForm(toForm(result));
    } catch (err) {
      toast.error(apiErrorMessage(err, "Couldn't load this language."));
    } finally {
      setLoading(false);
    }
  }, [id]);

  // Keyed on the active workspace, same as `LanguageDetailPage`: switching has to re-fetch rather
  // than let this form keep editing a record from a workspace that's no longer active.
  useEffect(() => {
    void load();
  }, [load, activeWorkspaceId]);

  if (!id) return null;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!language || !id) return;
    setFormError(null);
    setSaving(true);
    const input: UpdateLanguageInput = {
      code: form.code,
      name: form.name,
      nativeName: form.nativeName,
      direction: form.direction,
      isDefault: form.isDefault,
      isActive: form.isActive,
    };
    try {
      await authClient.updateLanguage(id, input);
      toast.success("Language updated.");
      navigate(`/languages/${id}`);
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
          { title: "Languages", href: "/languages" },
          { title: language?.name ?? "Details", href: `/languages/${id}` },
          { title: "Edit", href: `/languages/${id}/edit` },
        ]}
      />
      <div className="flex items-start justify-between">
        <Heading title="Edit Language" description="Update language details" />
      </div>
      <Separator />

      {loading && !language && <p className="text-sm text-muted-foreground">Loading…</p>}

      {language && (
        <Card>
          <CardHeader />
          <CardContent>
            <FormErrorAlert messages={formError} />
            <form onSubmit={handleSubmit} className="space-y-8 w-full">
              <Card className="w-full">
                <CardHeader className="border-b bg-muted/50">
                  <CardTitle className="text-2xl">Language Information</CardTitle>
                  <CardDescription className="text-base">Enter language details</CardDescription>
                </CardHeader>
                <CardContent className="pt-6">
                  <div className="space-y-6">
                    <div className="space-y-4">
                      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Basic Information</h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="flex flex-col gap-2">
                          <Label htmlFor="name">Language Name</Label>
                          <Input
                            id="name"
                            disabled={saving}
                            placeholder="e.g., English"
                            required
                            value={form.name}
                            onChange={(e) => setForm({ ...form, name: e.target.value })}
                            type="text"
                            className={inputClassName}
                          />
                        </div>
                        <div className="flex flex-col gap-2">
                          <Label htmlFor="code">
                            Language Code &nbsp;
                            <span className="text-xs text-destructive dark:text-destructive-foreground">(ISO code, e.g., en, ar, bn)</span>
                          </Label>
                          <Input
                            id="code"
                            disabled={saving}
                            placeholder="e.g., en"
                            required
                            value={form.code}
                            onChange={(e) => setForm({ ...form, code: e.target.value.toLowerCase() })}
                            type="text"
                            maxLength={10}
                            className={`${inputClassName} lowercase`}
                          />
                        </div>
                        <div className="flex flex-col gap-2">
                          <Label htmlFor="nativeName">
                            Native Name &nbsp;
                            <span className="text-xs text-muted-foreground">(e.g., العربية, বাংলা)</span>
                          </Label>
                          <Input
                            id="nativeName"
                            disabled={saving}
                            placeholder="e.g., English"
                            required
                            value={form.nativeName}
                            onChange={(e) => setForm({ ...form, nativeName: e.target.value })}
                            type="text"
                            className={inputClassName}
                          />
                        </div>
                        <div className="flex flex-col gap-2">
                          <Label>Text Direction</Label>
                          <Combobox
                            options={DIRECTION_OPTIONS}
                            selected={form.direction}
                            placeholder="Select text direction"
                            onChange={(option) => setForm({ ...form, direction: option.value as "ltr" | "rtl" })}
                            showCreate={false}
                            popoverClassName="min-w-[250px]"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>

                <div className="flex flex-wrap justify-center gap-4 mt-6">
                  <label className="flex flex-row items-center space-x-3 rounded-lg border border-purple-500 bg-purple-50 dark:bg-purple-950/20 p-4">
                    <Checkbox checked={form.isDefault} onCheckedChange={(checked) => setForm({ ...form, isDefault: checked === true })} />
                    <span className="space-y-1 leading-none">
                      <span className="block text-base font-medium">Default Language</span>
                      <span className="block text-sm text-muted-foreground">The default language is the one a new deployment&apos;s locale falls back to</span>
                    </span>
                  </label>
                  <label className="flex flex-row items-center space-x-3 rounded-lg border border-purple-500 bg-purple-50 dark:bg-purple-950/20 p-4">
                    <Checkbox checked={form.isActive} onCheckedChange={(checked) => setForm({ ...form, isActive: checked === true })} />
                    <span className="space-y-1 leading-none">
                      <span className="block text-base font-medium">Active Status</span>
                      <span className="block text-sm text-muted-foreground">Language will be active and available for selection</span>
                    </span>
                  </label>
                </div>

                <CardFooter className="flex justify-center gap-4 mt-8 pb-8">
                  <Button type="button" variant="outline" onClick={() => navigate(`/languages/${id}`)} disabled={saving}>
                    Cancel
                  </Button>
                  <Button disabled={saving} className="bg-purple-600 hover:bg-purple-700 dark:bg-purple-600 dark:hover:bg-purple-700 min-w-32" type="submit">
                    {saving ? "Updating..." : "Update Language"}
                  </Button>
                </CardFooter>
              </Card>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
});
