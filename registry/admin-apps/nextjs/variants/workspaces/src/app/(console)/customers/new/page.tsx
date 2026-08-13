"use client";

import { useAbility } from "@casl/react";
import { observer } from "mobx-react-lite";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { type CreateCustomerInput } from "@easy-auth/auth-client";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { PERMISSIONS, hasPermission, type AppAbility } from "@/lib/ability";
import { authClient } from "@/lib/auth-client";
import { errorMessage, errorMessages } from "@/lib/error";
import { GENDER_OPTIONS, emptyCreateCustomerForm, type CreateCustomerFormValues } from "../customer-schema";

const inputClassName = "bg-background border-2 focus:border-purple-500 transition-colors";

export default observer(function NewCustomerPage() {
  const ability = useAbility<AppAbility>();
  const canManage = hasPermission(ability, PERMISSIONS.customersManage);
  const router = useRouter();

  const [form, setForm] = useState<CreateCustomerFormValues>(emptyCreateCustomerForm);
  const [formError, setFormError] = useState<string[] | null>(null);
  const [loading, setLoading] = useState(false);

  if (!canManage) return <PermissionRequired permission={PERMISSIONS.customersManage} what="Adding a customer" />;

  function set<K extends keyof CreateCustomerFormValues>(key: K, value: CreateCustomerFormValues[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    const input: CreateCustomerInput = {
      email: form.email,
      firstName: form.firstName || undefined,
      lastName: form.lastName || undefined,
      username: form.username || undefined,
      phone: form.phone || undefined,
      dob: form.dob || undefined,
      gender: form.gender || undefined,
      joinedDate: form.joinedDate || undefined,
      photo: form.photo || undefined,
      isActive: form.isActive,
    };
    setLoading(true);
    try {
      const customer = await authClient.createCustomer(input);
      toast.success("Customer created.");
      router.push(`/customers/${customer.id}`);
    } catch (err) {
      setFormError(errorMessages(err));
      toast.error(errorMessage(err));
      setLoading(false);
    }
  }

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
          <form onSubmit={handleSubmit} className="space-y-8 w-full">
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
                      <div className="flex flex-col gap-1.5">
                        <Label htmlFor="firstName">First Name</Label>
                        <Input
                          id="firstName"
                          disabled={loading}
                          placeholder="First Name"
                          value={form.firstName}
                          onChange={(e) => set("firstName", e.target.value)}
                          type="text"
                          className={inputClassName}
                        />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <Label htmlFor="lastName">Last Name</Label>
                        <Input
                          id="lastName"
                          disabled={loading}
                          placeholder="Last Name"
                          value={form.lastName}
                          onChange={(e) => set("lastName", e.target.value)}
                          type="text"
                          className={inputClassName}
                        />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <Label htmlFor="username">
                          Username &nbsp;
                          <span className="text-xs text-destructive dark:text-destructive-foreground">(Must be unique)</span>
                        </Label>
                        <Input
                          id="username"
                          disabled={loading}
                          placeholder="Username"
                          value={form.username}
                          onChange={(e) => set("username", e.target.value)}
                          className={inputClassName}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Contact Information</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="flex flex-col gap-1.5">
                        <Label htmlFor="email">
                          Email &nbsp;
                          <span className="text-xs text-destructive dark:text-destructive-foreground">(Must be unique)</span>
                        </Label>
                        <Input
                          id="email"
                          required
                          disabled={loading}
                          placeholder="customer@example.com"
                          value={form.email}
                          onChange={(e) => set("email", e.target.value)}
                          type="email"
                          className={inputClassName}
                        />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <Label htmlFor="phone">
                          Phone &nbsp;
                          <span className="text-xs text-muted-foreground">(With country code)</span>
                        </Label>
                        <Input
                          id="phone"
                          type="text"
                          disabled={loading}
                          value={form.phone}
                          onChange={(e) => set("phone", e.target.value)}
                          placeholder="+1234567890"
                          className={inputClassName}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Additional Details</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="flex flex-col gap-1.5 p-2">
                        <Label htmlFor="joinedDate">Joined Date</Label>
                        <Input
                          id="joinedDate"
                          type="date"
                          disabled={loading}
                          value={form.joinedDate}
                          onChange={(e) => set("joinedDate", e.target.value)}
                          className={inputClassName}
                        />
                        <p className="text-xs text-muted-foreground">Defaults to today.</p>
                      </div>
                      <div className="flex flex-col gap-1.5 p-2">
                        <Label htmlFor="dob">Date of birth</Label>
                        <Input
                          id="dob"
                          type="date"
                          disabled={loading}
                          value={form.dob}
                          onChange={(e) => set("dob", e.target.value)}
                          className={inputClassName}
                        />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <Label htmlFor="gender">Gender</Label>
                        <Select value={form.gender || undefined} onValueChange={(value) => set("gender", value)} disabled={loading}>
                          <SelectTrigger id="gender" className="w-full min-w-[200px]">
                            <SelectValue placeholder="Select Gender" />
                          </SelectTrigger>
                          <SelectContent>
                            {GENDER_OPTIONS.map((option) => (
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

              <CardHeader className="border-b bg-muted/50 mt-6">
                <CardTitle className="text-2xl">Profile Photo</CardTitle>
                <CardDescription className="text-base">Upload customer&apos;s profile picture (Max size: 2MB, Formats: JPG, PNG)</CardDescription>
              </CardHeader>
              <CardContent className="pt-6">
                <PhotoUpload photo={form.photo} fallback="?" onChange={(next) => set("photo", next)} disabled={loading} />
              </CardContent>

              <div className="flex justify-center mt-6">
                <div className="flex flex-row items-center space-x-3 rounded-lg border border-purple-500 bg-purple-50 dark:bg-purple-950/20 p-4">
                  <Checkbox id="isActive" checked={form.isActive} onCheckedChange={(checked) => set("isActive", checked === true)} />
                  <div className="space-y-1 leading-none">
                    <Label htmlFor="isActive" className="text-base font-medium">
                      Active Status
                    </Label>
                    <p className="text-sm text-muted-foreground">Customer will be active and available for selection</p>
                  </div>
                </div>
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
        </CardContent>
      </Card>
    </div>
  );
});
