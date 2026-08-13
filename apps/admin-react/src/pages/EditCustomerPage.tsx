import { type FormEvent, useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AuthApiError, type CustomerSummary, type UpdateCustomerInput } from "@easy-auth/auth-client";
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

function apiErrorMessage(err: unknown, fallback: string): string {
  return err instanceof AuthApiError ? err.message : fallback;
}

function toForm(customer: CustomerSummary): CustomerFormFields {
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

const inputClassName = "bg-background border-2 focus:border-purple-500 transition-colors";

export function EditCustomerPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [customer, setCustomer] = useState<CustomerSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState<CustomerFormFields>(emptyCustomerFields);
  const [formError, setFormError] = useState<string[] | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const result = await authClient.getCustomer(id);
      setCustomer(result);
      setForm(toForm(result));
    } catch (err) {
      toast.error(apiErrorMessage(err, "Couldn't load this customer."));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!id) return null;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!customer || !id) return;
    setFormError(null);
    setSaving(true);
    // `joinedDate` is not nullable on update, so a cleared picker just leaves it unchanged.
    const input: UpdateCustomerInput = {
      email: form.email,
      firstName: form.firstName || null,
      lastName: form.lastName || null,
      username: form.username || null,
      phone: form.phone || null,
      dob: form.dob ? format(form.dob, "yyyy-MM-dd") : null,
      gender: form.gender || null,
      joinedDate: form.joinedDate ? format(form.joinedDate, "yyyy-MM-dd") : undefined,
      photo: form.photo || null,
      isActive: form.isActive,
    };
    try {
      await authClient.updateCustomer(id, input);
      toast.success("Customer updated.");
      navigate(`/customers/${id}`);
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
            <form onSubmit={handleSubmit} className="space-y-8 w-full">
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
                        <div className="flex flex-col gap-2">
                          <Label htmlFor="firstName">First Name</Label>
                          <Input
                            id="firstName"
                            disabled={saving}
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
                            disabled={saving}
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
                            disabled={saving}
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
                            disabled={saving}
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
                            disabled={saving}
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
                          <DatePicker placeholder="Joined Date" value={form.joinedDate} onChange={(date) => setForm({ ...form, joinedDate: date })} displayFormat="dd-MM-yyyy" />
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
                  <PhotoUpload photo={form.photo} fallback="?" onChange={(next) => setForm({ ...form, photo: next })} disabled={saving} />
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
                  <Button type="button" variant="outline" onClick={() => navigate(`/customers/${id}`)} disabled={saving}>
                    Cancel
                  </Button>
                  <Button disabled={saving} className="bg-purple-600 hover:bg-purple-700 dark:bg-purple-600 dark:hover:bg-purple-700 min-w-32" type="submit">
                    {saving ? "Updating..." : "Update Customer"}
                  </Button>
                </CardFooter>
              </Card>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
