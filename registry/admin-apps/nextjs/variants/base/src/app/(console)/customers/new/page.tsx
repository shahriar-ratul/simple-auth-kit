"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useAbility } from "@casl/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { format } from "date-fns";
import { type CreateCustomerInput } from "@easy-auth/auth-client";
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
import { GENDER_OPTIONS, createCustomerSchema, type CreateCustomerFormValues } from "../customer-schema";

export default function NewCustomerPage() {
  const ability = useAbility<AppAbility>();
  const canManage = hasPermission(ability, PERMISSIONS.customersManage);
  const router = useRouter();

  const [formError, setFormError] = useState<string[] | null>(null);

  const form = useForm<CreateCustomerFormValues>({
    resolver: zodResolver(createCustomerSchema),
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

  if (!canManage) return <PermissionRequired permission={PERMISSIONS.customersManage} what="Adding a customer" />;

  async function onSubmit(values: CreateCustomerFormValues) {
    setFormError(null);
    // Dates go out as plain calendar dates, not toISOString() — a midnight-local Date shifted to
    // UTC could land on the previous day.
    const input: CreateCustomerInput = {
      email: values.email,
      firstName: values.firstName || undefined,
      lastName: values.lastName || undefined,
      username: values.username || undefined,
      phone: values.phone || undefined,
      dob: values.dob ? format(values.dob, "yyyy-MM-dd") : undefined,
      gender: values.gender || undefined,
      joinedDate: values.joinedDate ? format(values.joinedDate, "yyyy-MM-dd") : undefined,
      photo: values.photo || undefined,
      isActive: values.isActive,
    };
    try {
      const customer = await authClient.createCustomer(input);
      toast.success("Customer created.");
      router.push(`/customers/${customer.id}`);
    } catch (err) {
      setFormError(errorMessages(err));
      toast.error(errorMessage(err));
    }
  }

  const loading = form.formState.isSubmitting;

  return (
    <div className="flex-1 space-y-4">
      <Breadcrumb items={[{ title: "Customers", href: "/customers" }, { title: "Add customer", href: "/customers/new" }]} />
      <div className="flex items-start justify-between">
        <Heading title="Add New Customer" description="Create a new customer." />
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
                  <CardTitle className="text-2xl">Customer Information</CardTitle>
                  <CardDescription className="text-base">Enter customer&apos;s basic information</CardDescription>
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
                                  disabled={loading}
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
                                  disabled={loading}
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
                                  disabled={loading}
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
                                  disabled={loading}
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
                                  disabled={loading}
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
                                placeholder="Defaults to today"
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
                            <PhotoUpload photo={field.value} fallback="?" onChange={field.onChange} disabled={loading} />
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
                  <Button type="button" variant="outline" onClick={() => router.push("/customers")} disabled={loading}>
                    Cancel
                  </Button>
                  <Button disabled={loading} className="bg-purple-600 hover:bg-purple-700 dark:bg-purple-600 dark:hover:bg-purple-700 min-w-32" type="submit">
                    {loading ? "Creating..." : "Create Customer"}
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
