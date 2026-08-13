"use client";

import { useAbility } from "@casl/react";
import { observer } from "mobx-react-lite";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { type CreateLanguageInput } from "@easy-auth/auth-client";
import { toast } from "sonner";
import { Breadcrumb } from "@/components/breadcrumb";
import { FormErrorAlert } from "@/components/form-error-alert";
import { PermissionRequired } from "@/components/permission-required";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Heading } from "@/components/ui/heading";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { PERMISSIONS, hasPermission, type AppAbility } from "@/lib/ability";
import { authClient } from "@/lib/auth-client";
import { errorMessage, errorMessages } from "@/lib/error";
import { DIRECTION_OPTIONS, emptyLanguageForm, type LanguageFormValues } from "../language-schema";

const inputClassName = "bg-background border-2 focus:border-purple-500 transition-colors";

export default observer(function NewLanguagePage() {
  const ability = useAbility<AppAbility>();
  const canManage = hasPermission(ability, PERMISSIONS.languagesManage);
  const router = useRouter();

  const [form, setForm] = useState<LanguageFormValues>(emptyLanguageForm);
  const [formError, setFormError] = useState<string[] | null>(null);
  const [loading, setLoading] = useState(false);

  if (!canManage) return <PermissionRequired permission={PERMISSIONS.languagesManage} what="Adding a language" />;

  function set<K extends keyof LanguageFormValues>(key: K, value: LanguageFormValues[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    const input: CreateLanguageInput = {
      code: form.code,
      name: form.name,
      nativeName: form.nativeName,
      direction: form.direction,
      isDefault: form.isDefault,
      isActive: form.isActive,
    };
    setLoading(true);
    try {
      const language = await authClient.createLanguage(input);
      toast.success("Language created.");
      router.push(`/languages/${language.id}`);
    } catch (err) {
      setFormError(errorMessages(err));
      toast.error(errorMessage(err));
      setLoading(false);
    }
  }

  return (
    <div className="flex-1 space-y-4">
      <Breadcrumb items={[{ title: "Languages", href: "/languages" }, { title: "Add language", href: "/languages/new" }]} />
      <div className="flex items-start justify-between">
        <Heading title="Add New Language" description="Create a new language." />
      </div>
      <Separator />

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
                      <div className="flex flex-col gap-1.5">
                        <Label htmlFor="name">Language Name</Label>
                        <Input
                          id="name"
                          required
                          disabled={loading}
                          placeholder="e.g., English"
                          value={form.name}
                          onChange={(e) => set("name", e.target.value)}
                          type="text"
                          className={inputClassName}
                        />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <Label htmlFor="code">
                          Language Code &nbsp;
                          <span className="text-xs text-destructive dark:text-destructive-foreground">(ISO code, e.g., en, ar, bn)</span>
                        </Label>
                        <Input
                          id="code"
                          required
                          disabled={loading}
                          placeholder="e.g., en"
                          value={form.code}
                          type="text"
                          maxLength={10}
                          className={`${inputClassName} lowercase`}
                          onChange={(e) => set("code", e.target.value.toLowerCase())}
                        />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <Label htmlFor="nativeName">
                          Native Name &nbsp;
                          <span className="text-xs text-muted-foreground">(e.g., العربية, বাংলা)</span>
                        </Label>
                        <Input
                          id="nativeName"
                          required
                          disabled={loading}
                          placeholder="e.g., English"
                          value={form.nativeName}
                          onChange={(e) => set("nativeName", e.target.value)}
                          type="text"
                          className={inputClassName}
                        />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <Label htmlFor="direction">Text Direction</Label>
                        <Select value={form.direction} onValueChange={(value) => set("direction", value as "ltr" | "rtl")} disabled={loading}>
                          <SelectTrigger id="direction" className="w-full min-w-[200px]">
                            <SelectValue placeholder="Select text direction" />
                          </SelectTrigger>
                          <SelectContent>
                            {DIRECTION_OPTIONS.map((option) => (
                              <SelectItem key={option.value} value={option.value}>
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>

              <div className="flex flex-wrap justify-center gap-4 mt-6">
                <div className="flex flex-row items-center space-x-3 rounded-lg border border-purple-500 bg-purple-50 dark:bg-purple-950/20 p-4">
                  <Checkbox id="isDefault" checked={form.isDefault} onCheckedChange={(checked) => set("isDefault", checked === true)} />
                  <div className="space-y-1 leading-none">
                    <Label htmlFor="isDefault" className="text-base font-medium">
                      Default Language
                    </Label>
                    <p className="text-sm text-muted-foreground">The default language is the one a new deployment&apos;s locale falls back to</p>
                  </div>
                </div>
                <div className="flex flex-row items-center space-x-3 rounded-lg border border-purple-500 bg-purple-50 dark:bg-purple-950/20 p-4">
                  <Checkbox id="isActive" checked={form.isActive} onCheckedChange={(checked) => set("isActive", checked === true)} />
                  <div className="space-y-1 leading-none">
                    <Label htmlFor="isActive" className="text-base font-medium">
                      Active Status
                    </Label>
                    <p className="text-sm text-muted-foreground">Language will be active and available for selection</p>
                  </div>
                </div>
              </div>

              <CardFooter className="flex justify-center gap-4 mt-8 pb-8">
                <Button type="button" variant="outline" onClick={() => router.push("/languages")} disabled={loading}>
                  Cancel
                </Button>
                <Button disabled={loading} className="bg-purple-600 hover:bg-purple-700 dark:bg-purple-600 dark:hover:bg-purple-700 min-w-32" type="submit">
                  {loading ? "Creating..." : "Create Language"}
                </Button>
              </CardFooter>
            </Card>
          </form>
        </CardContent>
      </Card>
    </div>
  );
});
