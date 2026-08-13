"use client";

import { useAbility } from "@casl/react";
import { observer } from "mobx-react-lite";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { type CreateCountryInput } from "@easy-auth/auth-client";
import { toast } from "sonner";
import { Breadcrumb } from "@/components/breadcrumb";
import { FormErrorAlert } from "@/components/form-error-alert";
import { PermissionRequired } from "@/components/permission-required";
import { PhotoUpload } from "@/components/photo-upload";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Heading } from "@/components/ui/heading";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { PERMISSIONS, hasPermission, type AppAbility } from "@/lib/ability";
import { authClient } from "@/lib/auth-client";
import { errorMessage, errorMessages } from "@/lib/error";
import { emptyCountryForm, type CountryFormValues } from "../country-schema";

const inputClassName = "bg-background border-2 focus:border-purple-500 transition-colors";

export default observer(function NewCountryPage() {
  const ability = useAbility<AppAbility>();
  const canManage = hasPermission(ability, PERMISSIONS.countriesManage);
  const router = useRouter();

  const [form, setForm] = useState<CountryFormValues>(emptyCountryForm);
  const [formError, setFormError] = useState<string[] | null>(null);
  const [loading, setLoading] = useState(false);

  if (!canManage) return <PermissionRequired permission={PERMISSIONS.countriesManage} what="Adding a country" />;

  function set<K extends keyof CountryFormValues>(key: K, value: CountryFormValues[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    const input: CreateCountryInput = {
      code: form.code,
      name: form.name,
      emoji: form.emoji,
      phoneCode: form.phoneCode,
      currency: form.currency,
      currencyName: form.currencyName,
      isoCode: form.isoCode,
      flag: form.flag || undefined,
      isActive: form.isActive,
    };
    setLoading(true);
    try {
      const country = await authClient.createCountry(input);
      toast.success("Country created.");
      router.push(`/countries/${country.id}`);
    } catch (err) {
      setFormError(errorMessages(err));
      toast.error(errorMessage(err));
      setLoading(false);
    }
  }

  return (
    <div className="flex-1 space-y-4">
      <Breadcrumb items={[{ title: "Countries", href: "/countries" }, { title: "Add country", href: "/countries/new" }]} />
      <div className="flex items-start justify-between">
        <Heading title="Add New Country" description="Create a new country." />
      </div>
      <Separator />

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
                      <div className="flex flex-col gap-1.5">
                        <Label htmlFor="name">Country Name</Label>
                        <Input
                          id="name"
                          required
                          disabled={loading}
                          placeholder="e.g., Bangladesh"
                          value={form.name}
                          onChange={(e) => set("name", e.target.value)}
                          type="text"
                          className={inputClassName}
                        />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <Label htmlFor="code">
                          Country Code &nbsp;
                          <span className="text-xs text-destructive dark:text-destructive-foreground">(2-3 characters, e.g., BD, USA)</span>
                        </Label>
                        <Input
                          id="code"
                          required
                          disabled={loading}
                          placeholder="e.g., BD"
                          value={form.code}
                          type="text"
                          maxLength={3}
                          className={`${inputClassName} uppercase`}
                          onChange={(e) => set("code", e.target.value.toUpperCase())}
                        />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <Label htmlFor="emoji">
                          Country Emoji &nbsp;
                          <span className="text-xs text-muted-foreground">(Stands in wherever no flag image is set)</span>
                        </Label>
                        <Input
                          id="emoji"
                          required
                          disabled={loading}
                          placeholder="e.g., 🇧🇩"
                          value={form.emoji}
                          onChange={(e) => set("emoji", e.target.value)}
                          type="text"
                          className={inputClassName}
                        />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <Label htmlFor="phoneCode">
                          Country Phone Code &nbsp;
                          <span className="text-xs text-destructive dark:text-destructive-foreground">(2-3 characters, e.g., +880, +60)</span>
                        </Label>
                        <Input
                          id="phoneCode"
                          required
                          disabled={loading}
                          placeholder="e.g., +880"
                          value={form.phoneCode}
                          type="text"
                          className={`${inputClassName} uppercase`}
                          onChange={(e) => set("phoneCode", e.target.value)}
                        />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <Label htmlFor="currency">
                          Country Currency &nbsp;
                          <span className="text-xs text-destructive dark:text-destructive-foreground">(e.g., USD, EUR)</span>
                        </Label>
                        <Input
                          id="currency"
                          required
                          disabled={loading}
                          placeholder="e.g., USD, EUR"
                          value={form.currency}
                          type="text"
                          maxLength={3}
                          className={`${inputClassName} uppercase`}
                          onChange={(e) => set("currency", e.target.value.toUpperCase())}
                        />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <Label htmlFor="currencyName">
                          Country Currency Name &nbsp;
                          <span className="text-xs text-destructive dark:text-destructive-foreground">(e.g., US Dollar, Euro)</span>
                        </Label>
                        <Input
                          id="currencyName"
                          required
                          disabled={loading}
                          placeholder="e.g., US Dollar, Euro"
                          value={form.currencyName}
                          onChange={(e) => set("currencyName", e.target.value)}
                          type="text"
                          className={inputClassName}
                        />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <Label htmlFor="isoCode">
                          Country ISO Code &nbsp;
                          <span className="text-xs text-destructive dark:text-destructive-foreground">(ISO code, e.g., BDT, USD)</span>
                        </Label>
                        <Input
                          id="isoCode"
                          required
                          disabled={loading}
                          placeholder="e.g., BDT, USD"
                          value={form.isoCode}
                          type="text"
                          maxLength={3}
                          className={`${inputClassName} uppercase`}
                          onChange={(e) => set("isoCode", e.target.value.toUpperCase())}
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
                <PhotoUpload photo={form.flag} fallback={form.emoji || "?"} onChange={(next) => set("flag", next)} disabled={loading} />
              </CardContent>

              <div className="flex justify-center mt-6">
                <div className="flex flex-row items-center space-x-3 rounded-lg border border-purple-500 bg-purple-50 dark:bg-purple-950/20 p-4">
                  <Checkbox id="isActive" checked={form.isActive} onCheckedChange={(checked) => set("isActive", checked === true)} />
                  <div className="space-y-1 leading-none">
                    <Label htmlFor="isActive" className="text-base font-medium">
                      Active Status
                    </Label>
                    <p className="text-sm text-muted-foreground">Country will be active and available for selection</p>
                  </div>
                </div>
              </div>

              <CardFooter className="flex justify-center gap-4 mt-8 pb-8">
                <Button type="button" variant="outline" onClick={() => router.push("/countries")} disabled={loading}>
                  Cancel
                </Button>
                <Button disabled={loading} className="bg-purple-600 hover:bg-purple-700 dark:bg-purple-600 dark:hover:bg-purple-700 min-w-32" type="submit">
                  {loading ? "Creating..." : "Create Country"}
                </Button>
              </CardFooter>
            </Card>
          </form>
        </CardContent>
      </Card>
    </div>
  );
});
