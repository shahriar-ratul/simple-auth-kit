import { type FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { CreateCustomerInput } from "@easy-auth/auth-client";
import { format } from "date-fns";
import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";
import { errorMessage, errorMessages } from "@/lib/error";
import { Breadcrumb } from "@/components/breadcrumb";
import { FormErrorAlert } from "@/components/form-error-alert";
import { PhotoUpload } from "@/components/photo-upload";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Combobox } from "@/components/ui/combobox";
import { DatePicker } from "@/components/ui/date-picker";
import { Heading } from "@/components/ui/heading";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { emptyCustomerFields, GENDER_OPTIONS, type CustomerFormFields } from "./customer-schema";

const inputClassName = "bg-background border-2 focus:border-purple-500 transition-colors";

export function AddCustomerPage() {
  const navigate = useNavigate();

  const [form, setForm] = useState<CustomerFormFields>(emptyCustomerFields);
  const [formError, setFormError] = useState<string[] | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    setLoading(true);
    // Dates go out as plain calendar dates, not toISOString() — a midnight-local Date shifted to
    // UTC could land on the previous day.
    const input: CreateCustomerInput = {
      email: form.email,
      firstName: form.firstName || undefined,
      lastName: form.lastName || undefined,
      username: form.username || undefined,
      phone: form.phone || undefined,
      dob: form.dob ? format(form.dob, "yyyy-MM-dd") : undefined,
      gender: form.gender || undefined,
      joinedDate: form.joinedDate ? format(form.joinedDate, "yyyy-MM-dd") : undefined,
      photo: form.photo || undefined,
      isActive: form.isActive,
    };
    try {
      const customer = await authClient.createCustomer(input);
      toast.success("Customer created.");
      navigate(`/customers/${customer.id}`);
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
                      <div className="flex flex-col gap-2">
                        <Label htmlFor="firstName">First Name</Label>
                        <Input
                          id="firstName"
                          disabled={loading}
                          placeholder="First Name"
                          value={form.firstName}
                          onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                          type="text"
                          className={inputClassName}
                        />
                      </div>
                      <div className="flex flex-col gap-2">
                        <Label htmlFor="lastName">Last Name</Label>
                        <Input
                          id="lastName"
                          disabled={loading}
                          placeholder="Last Name"
                          value={form.lastName}
                          onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                          type="text"
                          className={inputClassName}
                        />
                      </div>
                      <div className="flex flex-col gap-2">
                        <Label htmlFor="username">
                          Username &nbsp;
                          <span className="text-xs text-destructive dark:text-destructive-foreground">(Must be unique)</span>
                        </Label>
                        <Input
                          id="username"
                          disabled={loading}
                          placeholder="Username"
                          value={form.username}
                          onChange={(e) => setForm({ ...form, username: e.target.value })}
                          className={inputClassName}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Contact Information</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="flex flex-col gap-2">
                        <Label htmlFor="email">
                          Email &nbsp;
                          <span className="text-xs text-destructive dark:text-destructive-foreground">(Must be unique)</span>
                        </Label>
                        <Input
                          id="email"
                          disabled={loading}
                          placeholder="customer@example.com"
                          required
                          value={form.email}
                          onChange={(e) => setForm({ ...form, email: e.target.value })}
                          type="email"
                          className={inputClassName}
                        />
                      </div>
                      <div className="flex flex-col gap-2">
                        <Label htmlFor="phone">
                          Phone &nbsp;
                          <span className="text-xs text-muted-foreground">(With country code)</span>
                        </Label>
                        <Input
                          id="phone"
                          type="text"
                          disabled={loading}
                          value={form.phone}
                          onChange={(e) => setForm({ ...form, phone: e.target.value })}
                          placeholder="+1234567890"
                          className={inputClassName}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Additional Details</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="flex flex-col gap-2 p-2">
                        <Label>Joined Date</Label>
                        <DatePicker placeholder="Defaults to today" value={form.joinedDate} onChange={(date) => setForm({ ...form, joinedDate: date })} displayFormat="dd-MM-yyyy" />
                      </div>
                      <div className="flex flex-col gap-2 p-2">
                        <Label>Date of birth</Label>
                        <DatePicker placeholder="Date of birth" value={form.dob} onChange={(date) => setForm({ ...form, dob: date })} displayFormat="dd-MM-yyyy" />
                      </div>
                      <div className="flex flex-col gap-2">
                        <Label>Gender</Label>
                        <Combobox
                          options={GENDER_OPTIONS}
                          selected={form.gender}
                          placeholder="Select Gender"
                          onChange={(option) => setForm({ ...form, gender: option.value })}
                          showCreate={false}
                          popoverClassName="min-w-[200px]"
                        />
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
                <PhotoUpload photo={form.photo} fallback="?" onChange={(next) => setForm({ ...form, photo: next })} disabled={loading} />
              </CardContent>

              <div className="flex justify-center mt-6">
                <label className="flex flex-row items-center space-x-3 rounded-lg border border-purple-500 bg-purple-50 dark:bg-purple-950/20 p-4">
                  <Checkbox checked={form.isActive} onCheckedChange={(checked) => setForm({ ...form, isActive: checked === true })} />
                  <span className="space-y-1 leading-none">
                    <span className="block text-base font-medium">Active Status</span>
                    <span className="block text-sm text-muted-foreground">Customer will be active and available for selection</span>
                  </span>
                </label>
              </div>

              <CardFooter className="flex justify-center gap-4 mt-8 pb-8">
                <Button type="button" variant="outline" onClick={() => navigate("/customers")} disabled={loading}>
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
}
