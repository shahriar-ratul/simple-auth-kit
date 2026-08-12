"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useAbility } from "@casl/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { type CreateLanguageInput } from "@easy-auth/auth-client";
import { toast } from "sonner";
import { Breadcrumb } from "@/components/breadcrumb";
import { FormErrorAlert } from "@/components/form-error-alert";
import { PermissionRequired } from "@/components/permission-required";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Combobox } from "@/components/ui/combobox";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Heading } from "@/components/ui/heading";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { PERMISSIONS, hasPermission, type AppAbility } from "@/lib/ability";
import { authClient } from "@/lib/auth-client";
import { errorMessage, errorMessages } from "@/lib/error";
import { DIRECTION_OPTIONS, languageSchema, type LanguageFormValues } from "../language-schema";

export default function NewLanguagePage() {
  const ability = useAbility<AppAbility>();
  const canManage = hasPermission(ability, PERMISSIONS.languagesManage);
  const router = useRouter();

  const [formError, setFormError] = useState<string[] | null>(null);

  const form = useForm<LanguageFormValues>({
    resolver: zodResolver(languageSchema),
    defaultValues: { code: "", name: "", nativeName: "", direction: "ltr", isDefault: false, isActive: true },
  });

  if (!canManage) return <PermissionRequired permission={PERMISSIONS.languagesManage} what="Adding a language" />;

  async function onSubmit(values: LanguageFormValues) {
    setFormError(null);
    const input: CreateLanguageInput = {
      code: values.code,
      name: values.name,
      nativeName: values.nativeName,
      direction: values.direction,
      isDefault: values.isDefault,
      isActive: values.isActive,
    };
    try {
      const language = await authClient.createLanguage(input);
      toast.success("Language created.");
      router.push(`/languages/${language.id}`);
    } catch (err) {
      setFormError(errorMessages(err));
      toast.error(errorMessage(err));
    }
  }

  const loading = form.formState.isSubmitting;

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
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8 w-full">
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
                        <FormField
                          control={form.control}
                          name="name"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Language Name</FormLabel>
                              <FormControl>
                                <Input
                                  disabled={loading}
                                  placeholder="e.g., English"
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
                          name="code"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>
                                Language Code &nbsp;
                                <span className="text-xs text-destructive dark:text-destructive-foreground">(ISO code, e.g., en, ar, bn)</span>
                              </FormLabel>
                              <FormControl>
                                <Input
                                  disabled={loading}
                                  placeholder="e.g., en"
                                  {...field}
                                  type="text"
                                  maxLength={10}
                                  className="bg-background border-2 focus:border-purple-500 transition-colors lowercase"
                                  onChange={(e) => field.onChange(e.target.value.toLowerCase())}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="nativeName"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>
                                Native Name &nbsp;
                                <span className="text-xs text-muted-foreground">(e.g., العربية, বাংলা)</span>
                              </FormLabel>
                              <FormControl>
                                <Input
                                  disabled={loading}
                                  placeholder="e.g., English"
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
                          name="direction"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Text Direction</FormLabel>
                              <FormControl>
                                <div>
                                  <Combobox
                                    options={DIRECTION_OPTIONS}
                                    selected={field.value}
                                    placeholder="Select text direction"
                                    onChange={(option) => field.onChange(option.value)}
                                    showCreate={false}
                                    popoverClassName="min-w-[250px]"
                                  />
                                </div>
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                    </div>
                  </div>
                </CardContent>

                <div className="flex flex-wrap justify-center gap-4 mt-6">
                  <FormField
                    control={form.control}
                    name="isDefault"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center space-x-3 space-y-0 rounded-lg border border-purple-500 bg-purple-50 dark:bg-purple-950/20 p-4">
                        <FormControl>
                          <Checkbox checked={field.value} onCheckedChange={(checked) => field.onChange(checked === true)} />
                        </FormControl>
                        <div className="space-y-1 leading-none">
                          <FormLabel className="text-base font-medium">Default Language</FormLabel>
                          <FormDescription className="text-sm">The default language is the one a new deployment&apos;s locale falls back to</FormDescription>
                        </div>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="isActive"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center space-x-3 space-y-0 rounded-lg border border-purple-500 bg-purple-50 dark:bg-purple-950/20 p-4">
                        <FormControl>
                          <Checkbox checked={field.value} onCheckedChange={(checked) => field.onChange(checked === true)} />
                        </FormControl>
                        <div className="space-y-1 leading-none">
                          <FormLabel className="text-base font-medium">Active Status</FormLabel>
                          <FormDescription className="text-sm">Language will be active and available for selection</FormDescription>
                        </div>
                      </FormItem>
                    )}
                  />
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
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
