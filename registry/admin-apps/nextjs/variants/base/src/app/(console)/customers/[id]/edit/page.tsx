"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useAbility } from "@casl/react";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { AuthApiError, type CustomerSummary, type UpdateCustomerInput } from "@easy-auth/auth-client";
import { format } from "date-fns";
import { toast } from "sonner";
import { Breadcrumb } from "@/components/breadcrumb";
import { FormErrorAlert } from "@/components/form-error-alert";
import { PermissionRequired } from "@/components/permission-required";
import { PhotoUpload } from "@/components/photo-upload";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Combobox } from "@/components/ui/combobox";
import { DatePicker } from "@/components/ui/date-picker";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Heading } from "@/components/ui/heading";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { PERMISSIONS, hasPermission, type AppAbility } from "@/lib/ability";
import { authClient } from "@/lib/auth-client";
import { errorMessage, errorMessages } from "@/lib/error";
import { GENDER_OPTIONS, editCustomerSchema, type EditCustomerFormValues } from "../../customer-schema";

function apiErrorMessage(err: unknown, fallback: string): string {
  return err instanceof AuthApiError ? err.message : fallback;
}

function toForm(customer: CustomerSummary): EditCustomerFormValues {
  return {
    email: customer.email,
    firstName: customer.firstName ?? "",
    lastName: customer.lastName ?? "",
    username: customer.username ?? "",
    phone: customer.phone ?? "",
    dob: customer.dob ? new Date(customer.dob) : undefined,
    gender: customer.gender ?? "",
    joinedDate: customer.joinedDate ? new Date(customer.joinedDate) : undefined,
    photo: customer.photo,
    isActive: customer.isActive,
  };
}

export default function EditCustomerPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const ability = useAbility<AppAbility>();
  const canManage = hasPermission(ability, PERMISSIONS.customersManage);

  const [customer, setCustomer] = useState<CustomerSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState<string[] | null>(null);

  const form = useForm<EditCustomerFormValues>({
    resolver: zodResolver(editCustomerSchema),
    defaultValues: {
      email: "",
      firstName: "",
      lastName: "",
      username: "",
      phone: "",
      dob: undefined,
      gender: "",
      joinedDate: undefined,
      photo: null,
      isActive: true,
    },
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await authClient.getCustomer(id);
      setCustomer(result);
      form.reset(toForm(result));
    } catch (err) {
      toast.error(apiErrorMessage(err, "Couldn't load this customer."));
    } finally {
      setLoading(false);
    }
    // `form` is stable across renders (react-hook-form memoizes it), so it's safe to omit here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (!canManage) return;
    void load();
  }, [canManage, load]);

  if (!canManage) return <PermissionRequired permission={PERMISSIONS.customersManage} what="Editing a customer" />;

  async function onSubmit(values: EditCustomerFormValues) {
    if (!customer) return;
    setFormError(null);
    // `joinedDate` is not nullable on update, so a cleared picker just leaves it unchanged.
    const input: UpdateCustomerInput = {
      email: values.email,
      firstName: values.firstName || null,
      lastName: values.lastName || null,
      username: values.username || null,
      phone: values.phone || null,
      dob: values.dob ? format(values.dob, "yyyy-MM-dd") : null,
      gender: values.gender || null,
      joinedDate: values.joinedDate ? format(values.joinedDate, "yyyy-MM-dd") : undefined,
      photo: values.photo || null,
      isActive: values.isActive,
    };
    try {
      await authClient.updateCustomer(id, input);
      toast.success("Customer updated.");
      router.push(`/customers/${id}`);
    } catch (err) {
      setFormError(errorMessages(err));
      toast.error(errorMessage(err));
    }
  }

  const saving = form.formState.isSubmitting;

  return (
    <div className="flex-1 space-y-4">
      <Breadcrumb
        items={[
          { title: "Customers", href: "/customers" },
          { title: customer?.email ?? "Details", href: `/customers/${id}` },
          { title: "Edit", href: `/customers/${id}/edit` },
        ]}
      />
      <div className="flex items-start justify-between">
        <Heading title="Edit Customer" description="Update customer details" />
      </div>
      <Separator />

      {loading && !customer && <p className="text-sm text-muted-foreground">Loading…</p>}

      {customer && (
        <Card>
          <CardHeader />
          <CardContent>
            <FormErrorAlert messages={formError} />
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8 w-full">
                <Card className="w-full">
                  <CardHeader className="border-b bg-muted/50">
                    <CardTitle className="text-2xl">Customer Information</CardTitle>
                    <CardDescription className="text-base">Update customer&apos;s basic information</CardDescription>
                  </CardHeader>
                  <CardContent className="pt-6">
                    <div className="space-y-6">
                      <div className="space-y-4">
                        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Personal Information</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <FormField
                            control={form.control}
                            name="firstName"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>First Name</FormLabel>
                                <FormControl>
                                  <Input
                                    disabled={saving}
                                    placeholder="First Name"
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
                            name="lastName"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Last Name</FormLabel>
                                <FormControl>
                                  <Input
                                    disabled={saving}
                                    placeholder="Last Name"
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
                            name="username"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>
                                  Username &nbsp;
                                  <span className="text-xs text-destructive dark:text-destructive-foreground">(Must be unique)</span>
                                </FormLabel>
                                <FormControl>
                                  <Input
                                    disabled={saving}
                                    placeholder="Username"
                                    {...field}
                                    className="bg-background border-2 focus:border-purple-500 transition-colors"
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                      </div>

                      <div className="space-y-4">
                        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Contact Information</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <FormField
                            control={form.control}
                            name="email"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>
                                  Email &nbsp;
                                  <span className="text-xs text-destructive dark:text-destructive-foreground">(Must be unique)</span>
                                </FormLabel>
                                <FormControl>
                                  <Input
                                    disabled={saving}
                                    placeholder="customer@example.com"
                                    {...field}
                                    type="email"
                                    className="bg-background border-2 focus:border-purple-500 transition-colors"
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={form.control}
                            name="phone"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>
                                  Phone &nbsp;
                                  <span className="text-xs text-muted-foreground">(With country code)</span>
                                </FormLabel>
                                <FormControl>
                                  <Input
                                    type="text"
                                    disabled={saving}
                                    {...field}
                                    placeholder="+1234567890"
                                    className="bg-background border-2 focus:border-purple-500 transition-colors"
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                      </div>

                      <div className="space-y-4">
                        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Additional Details</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <FormField
                            control={form.control}
                            name="joinedDate"
                            render={({ field }) => (
                              <FormItem className="flex flex-col p-2">
                                <FormLabel>Joined Date</FormLabel>
                                <DatePicker
                                  placeholder="Joined Date"
                                  onChange={field.onChange}
                                  value={field.value}
                                  displayFormat="dd-MM-yyyy"
                                />
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={form.control}
                            name="dob"
                            render={({ field }) => (
                              <FormItem className="flex flex-col p-2">
                                <FormLabel>Date of birth</FormLabel>
                                <DatePicker
                                  placeholder="Date of birth"
                                  onChange={field.onChange}
                                  value={field.value}
                                  displayFormat="dd-MM-yyyy"
                                />
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={form.control}
                            name="gender"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Gender</FormLabel>
                                <FormControl>
                                  <div>
                                    <Combobox
                                      options={GENDER_OPTIONS}
                                      selected={field.value ?? ""}
                                      placeholder="Select Gender"
                                      onChange={(option) => field.onChange(option.value)}
                                      showCreate={false}
                                      popoverClassName="min-w-[200px]"
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

                  <CardHeader className="border-b bg-muted/50 mt-6">
                    <CardTitle className="text-2xl">Profile Photo</CardTitle>
                    <CardDescription className="text-base">Upload customer&apos;s profile picture (Max size: 2MB, Formats: JPG, PNG)</CardDescription>
                  </CardHeader>
                  <CardContent className="pt-6">
                    <FormField
                      control={form.control}
                      name="photo"
                      render={({ field }) => (
                        <FormItem>
                          <FormControl>
                            <div>
                              <PhotoUpload photo={field.value} fallback="?" onChange={field.onChange} disabled={saving} />
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
                            <FormDescription className="text-sm">Customer will be active and available for selection</FormDescription>
                          </div>
                        </FormItem>
                      )}
                    />
                  </div>

                  <CardFooter className="flex justify-center gap-4 mt-8 pb-8">
                    <Button type="button" variant="outline" onClick={() => router.push(`/customers/${id}`)} disabled={saving}>
                      Cancel
                    </Button>
                    <Button disabled={saving} className="bg-purple-600 hover:bg-purple-700 dark:bg-purple-600 dark:hover:bg-purple-700 min-w-32" type="submit">
                      {saving ? "Updating..." : "Update Customer"}
                    </Button>
                  </CardFooter>
                </Card>
              </form>
            </Form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
