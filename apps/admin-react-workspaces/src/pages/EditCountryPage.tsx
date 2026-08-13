import { type FormEvent, useCallback, useEffect, useState } from "react";
import { observer } from "mobx-react-lite";
import { useNavigate, useParams } from "react-router-dom";
import { AuthApiError, type CountrySummary, type UpdateCountryInput } from "@easy-auth/auth-client";
import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";
import { errorMessage, errorMessages } from "@/lib/error";
import { useWorkspaceStore } from "@/stores/store-context";
import { Breadcrumb } from "@/components/breadcrumb";
import { FormErrorAlert } from "@/components/form-error-alert";
import { PhotoUpload } from "@/components/photo-upload";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Heading } from "@/components/ui/heading";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { emptyCountryFields, type CountryFormFields } from "./country-schema";

function apiErrorMessage(err: unknown, fallback: string): string {
  return err instanceof AuthApiError ? err.message : fallback;
}

function toForm(country: CountrySummary): CountryFormFields {
  return {
    code: country.code,
    name: country.name,
    emoji: country.emoji,
    phoneCode: country.phoneCode,
    currency: country.currency,
    currencyName: country.currencyName,
    isoCode: country.isoCode,
    flag: country.flag,
    isActive: country.isActive,
  };
}

const inputClassName = "bg-background border-2 focus:border-purple-500 transition-colors";
const upperInputClassName = `${inputClassName} uppercase`;

export const EditCountryPage = observer(function EditCountryPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const workspaceStore = useWorkspaceStore();
  const activeWorkspaceId = workspaceStore.activeWorkspaceId;

  const [country, setCountry] = useState<CountrySummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState<CountryFormFields>(emptyCountryFields);
  const [formError, setFormError] = useState<string[] | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const result = await authClient.getCountry(id);
      setCountry(result);
      setForm(toForm(result));
    } catch (err) {
      toast.error(apiErrorMessage(err, "Couldn't load this country."));
    } finally {
      setLoading(false);
    }
  }, [id]);

  // Keyed on the active workspace, same as `CountryDetailPage`: switching has to re-fetch rather
  // than let this form keep editing a record from a workspace that's no longer active.
  useEffect(() => {
    void load();
  }, [load, activeWorkspaceId]);

  if (!id) return null;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!country || !id) return;
    setFormError(null);
    setSaving(true);
    const input: UpdateCountryInput = {
      code: form.code,
      name: form.name,
      emoji: form.emoji,
      phoneCode: form.phoneCode,
      currency: form.currency,
      currencyName: form.currencyName,
      isoCode: form.isoCode,
      flag: form.flag || null,
      isActive: form.isActive,
    };
    try {
      await authClient.updateCountry(id, input);
      toast.success("Country updated.");
      navigate(`/countries/${id}`);
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
          { title: "Countries", href: "/countries" },
          { title: country?.name ?? "Details", href: `/countries/${id}` },
          { title: "Edit", href: `/countries/${id}/edit` },
        ]}
      />
      <div className="flex items-start justify-between">
        <Heading title="Edit Country" description="Update country details" />
      </div>
      <Separator />

      {loading && !country && <p className="text-sm text-muted-foreground">Loading…</p>}

      {country && (
        <Card>
          <CardHeader />
          <CardContent>
            <FormErrorAlert messages={formError} />
            <form onSubmit={handleSubmit} className="space-y-8 w-full">
              <Card className="w-full">
                <CardHeader className="border-b bg-muted/50">
                  <CardTitle className="text-2xl">Country Information</CardTitle>
                  <CardDescription className="text-base">Enter country details</CardDescription>
                </CardHeader>
                <CardContent className="pt-6">
                  <div className="space-y-6">
                    <div className="space-y-4">
                      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Basic Information</h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="flex flex-col gap-2">
                          <Label htmlFor="name">Country Name</Label>
                          <Input
                            id="name"
                            disabled={saving}
                            placeholder="e.g., Bangladesh"
                            required
                            value={form.name}
                            onChange={(e) => setForm({ ...form, name: e.target.value })}
                            type="text"
                            className={inputClassName}
                          />
                        </div>
                        <div className="flex flex-col gap-2">
                          <Label htmlFor="code">
                            Country Code &nbsp;
                            <span className="text-xs text-destructive dark:text-destructive-foreground">(2-3 characters, e.g., BD, USA)</span>
                          </Label>
                          <Input
                            id="code"
                            disabled={saving}
                            placeholder="e.g., BD"
                            required
                            value={form.code}
                            onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                            type="text"
                            maxLength={3}
                            className={upperInputClassName}
                          />
                        </div>
                        <div className="flex flex-col gap-2">
                          <Label htmlFor="emoji">
                            Country Emoji &nbsp;
                            <span className="text-xs text-muted-foreground">(Stands in wherever no flag image is set)</span>
                          </Label>
                          <Input
                            id="emoji"
                            disabled={saving}
                            placeholder="e.g., 🇧🇩"
                            required
                            value={form.emoji}
                            onChange={(e) => setForm({ ...form, emoji: e.target.value })}
                            type="text"
                            className={inputClassName}
                          />
                        </div>
                        <div className="flex flex-col gap-2">
                          <Label htmlFor="phoneCode">
                            Country Phone Code &nbsp;
                            <span className="text-xs text-destructive dark:text-destructive-foreground">(2-3 characters, e.g., +880, +60)</span>
                          </Label>
                          <Input
                            id="phoneCode"
                            disabled={saving}
                            placeholder="e.g., +880"
                            required
                            value={form.phoneCode}
                            onChange={(e) => setForm({ ...form, phoneCode: e.target.value })}
                            type="text"
                            className={upperInputClassName}
                          />
                        </div>
                        <div className="flex flex-col gap-2">
                          <Label htmlFor="currency">
                            Country Currency &nbsp;
                            <span className="text-xs text-destructive dark:text-destructive-foreground">(e.g., USD, EUR)</span>
                          </Label>
                          <Input
                            id="currency"
                            disabled={saving}
                            placeholder="e.g., USD, EUR"
                            required
                            value={form.currency}
                            onChange={(e) => setForm({ ...form, currency: e.target.value.toUpperCase() })}
                            type="text"
                            maxLength={3}
                            className={upperInputClassName}
                          />
                        </div>
                        <div className="flex flex-col gap-2">
                          <Label htmlFor="currencyName">
                            Country Currency Name &nbsp;
                            <span className="text-xs text-destructive dark:text-destructive-foreground">(e.g., US Dollar, Euro)</span>
                          </Label>
                          <Input
                            id="currencyName"
                            disabled={saving}
                            placeholder="e.g., US Dollar, Euro"
                            required
                            value={form.currencyName}
                            onChange={(e) => setForm({ ...form, currencyName: e.target.value })}
                            type="text"
                            className={inputClassName}
                          />
                        </div>
                        <div className="flex flex-col gap-2">
                          <Label htmlFor="isoCode">
                            Country ISO Code &nbsp;
                            <span className="text-xs text-destructive dark:text-destructive-foreground">(ISO code, e.g., BDT, USD)</span>
                          </Label>
                          <Input
                            id="isoCode"
                            disabled={saving}
                            placeholder="e.g., BDT, USD"
                            required
                            value={form.isoCode}
                            onChange={(e) => setForm({ ...form, isoCode: e.target.value.toUpperCase() })}
                            type="text"
                            maxLength={3}
                            className={upperInputClassName}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>

                <CardHeader className="border-b bg-muted/50 mt-6">
                  <CardTitle className="text-2xl">Country Flag</CardTitle>
                  <CardDescription className="text-base">Upload country flag (Max size: 2MB, Formats: JPG, PNG, SVG)</CardDescription>
                </CardHeader>
                <CardContent className="pt-6">
                  <PhotoUpload photo={form.flag} fallback={form.emoji || "?"} onChange={(next) => setForm({ ...form, flag: next })} disabled={saving} />
                </CardContent>

                <div className="flex justify-center mt-6">
                  <label className="flex flex-row items-center space-x-3 rounded-lg border border-purple-500 bg-purple-50 dark:bg-purple-950/20 p-4">
                    <Checkbox checked={form.isActive} onCheckedChange={(checked) => setForm({ ...form, isActive: checked === true })} />
                    <span className="space-y-1 leading-none">
                      <span className="block text-base font-medium">Active Status</span>
                      <span className="block text-sm text-muted-foreground">Country will be active and available for selection</span>
                    </span>
                  </label>
                </div>

                <CardFooter className="flex justify-center gap-4 mt-8 pb-8">
                  <Button type="button" variant="outline" onClick={() => navigate(`/countries/${id}`)} disabled={saving}>
                    Cancel
                  </Button>
                  <Button disabled={saving} className="bg-purple-600 hover:bg-purple-700 dark:bg-purple-600 dark:hover:bg-purple-700 min-w-32" type="submit">
                    {saving ? "Updating..." : "Update Country"}
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
