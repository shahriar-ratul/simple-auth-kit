"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useAbility } from "@casl/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { type CreateCountryInput } from "@easy-auth/auth-client";
import { toast } from "sonner";
import { Breadcrumb } from "@/components/breadcrumb";
import { FormErrorAlert } from "@/components/form-error-alert";
import { PermissionRequired } from "@/components/permission-required";
import { PhotoUpload } from "@/components/photo-upload";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Heading } from "@/components/ui/heading";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { PERMISSIONS, hasPermission, type AppAbility } from "@/lib/ability";
import { authClient } from "@/lib/auth-client";
import { errorMessage, errorMessages } from "@/lib/error";
import { countrySchema, type CountryFormValues } from "../country-schema";

export default function NewCountryPage() {
  const ability = useAbility<AppAbility>();
  const canManage = hasPermission(ability, PERMISSIONS.countriesManage);
  const router = useRouter();

  const [formError, setFormError] = useState<string[] | null>(null);

  const form = useForm<CountryFormValues>({
    resolver: zodResolver(countrySchema),
    defaultValues: { code: "", name: "", emoji: "", phoneCode: "", currency: "", currencyName: "", isoCode: "", flag: null, isActive: true },
  });

  if (!canManage) return <PermissionRequired permission={PERMISSIONS.countriesManage} what="Adding a country" />;

  async function onSubmit(values: CountryFormValues) {
    setFormError(null);
    const input: CreateCountryInput = {
      code: values.code,
      name: values.name,
      emoji: values.emoji,
      phoneCode: values.phoneCode,
      currency: values.currency,
      currencyName: values.currencyName,
      isoCode: values.isoCode,
      flag: values.flag || undefined,
      isActive: values.isActive,
    };
    try {
      const country = await authClient.createCountry(input);
      toast.success("Country created.");
      router.push(`/countries/${country.id}`);
    } catch (err) {
      setFormError(errorMessages(err));
      toast.error(errorMessage(err));
    }
  }

  const loading = form.formState.isSubmitting;

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
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8 w-full">
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
                        <FormField
                          control={form.control}
                          name="name"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Country Name</FormLabel>
                              <FormControl>
                                <Input
                                  disabled={loading}
                                  placeholder="e.g., Bangladesh"
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
                                Country Code &nbsp;
                                <span className="text-xs text-destructive dark:text-destructive-foreground">(2-3 characters, e.g., BD, USA)</span>
                              </FormLabel>
                              <FormControl>
                                <Input
                                  disabled={loading}
                                  placeholder="e.g., BD"
                                  {...field}
                                  type="text"
                                  maxLength={3}
                                  className="bg-background border-2 focus:border-purple-500 transition-colors uppercase"
                                  onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="emoji"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>
                                Country Emoji &nbsp;
                                <span className="text-xs text-muted-foreground">(Stands in wherever no flag image is set)</span>
                              </FormLabel>
                              <FormControl>
                                <Input
                                  disabled={loading}
                                  placeholder="e.g., 🇧🇩"
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
                          name="phoneCode"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>
                                Country Phone Code &nbsp;
                                <span className="text-xs text-destructive dark:text-destructive-foreground">(2-3 characters, e.g., +880, +60)</span>
                              </FormLabel>
                              <FormControl>
                                <Input
                                  disabled={loading}
                                  placeholder="e.g., +880"
                                  {...field}
                                  type="text"
                                  className="bg-background border-2 focus:border-purple-500 transition-colors uppercase"
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="currency"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>
                                Country Currency &nbsp;
                                <span className="text-xs text-destructive dark:text-destructive-foreground">(e.g., USD, EUR)</span>
                              </FormLabel>
                              <FormControl>
                                <Input
                                  disabled={loading}
                                  placeholder="e.g., USD, EUR"
                                  {...field}
                                  type="text"
                                  maxLength={3}
                                  className="bg-background border-2 focus:border-purple-500 transition-colors uppercase"
                                  onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="currencyName"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>
                                Country Currency Name &nbsp;
                                <span className="text-xs text-destructive dark:text-destructive-foreground">(e.g., US Dollar, Euro)</span>
                              </FormLabel>
                              <FormControl>
                                <Input
                                  disabled={loading}
                                  placeholder="e.g., US Dollar, Euro"
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
                          name="isoCode"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>
                                Country ISO Code &nbsp;
                                <span className="text-xs text-destructive dark:text-destructive-foreground">(ISO code, e.g., BDT, USD)</span>
                              </FormLabel>
                              <FormControl>
                                <Input
                                  disabled={loading}
                                  placeholder="e.g., BDT, USD"
                                  {...field}
                                  type="text"
                                  maxLength={3}
                                  className="bg-background border-2 focus:border-purple-500 transition-colors uppercase"
                                  onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                    </div>
                  </div>
                </CardContent>

                <CardHeader className="border-b bg-muted/50 mt-6">
                  <CardTitle className="text-2xl">Country Flag</CardTitle>
                  <CardDescription className="text-base">Upload country flag (Max size: 2MB, Formats: JPG, PNG, SVG)</CardDescription>
                </CardHeader>
                <CardContent className="pt-6">
                  <FormField
                    control={form.control}
                    name="flag"
                    render={({ field }) => (
                      <FormItem>
                        <FormControl>
                          <div>
                            <PhotoUpload photo={field.value} fallback={form.watch("emoji") || "?"} onChange={field.onChange} disabled={loading} />
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </CardContent>

                <div className="flex justify-center mt-6">
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
                          <FormDescription className="text-sm">Country will be active and available for selection</FormDescription>
                        </div>
                      </FormItem>
                    )}
                  />
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
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
