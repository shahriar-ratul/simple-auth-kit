"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { EyeIcon, EyeOffIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm, type Control } from "react-hook-form";
import { z } from "zod";
import { Breadcrumb } from "@/components/breadcrumb";
import { FormErrorAlert } from "@/components/form-error-alert";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Heading } from "@/components/ui/heading";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { authClient } from "@/lib/auth-client";
import { errorMessages } from "@/lib/error";

const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Current password is required"),
    newPassword: z.string().min(8, "Must be at least 8 characters"),
    confirmPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
  });

type ChangePasswordValues = z.infer<typeof changePasswordSchema>;

const emptyValues: ChangePasswordValues = { currentPassword: "", newPassword: "", confirmPassword: "" };

function PasswordField({
  control,
  name,
  label,
  placeholder,
  disabled,
}: {
  control: Control<ChangePasswordValues>;
  name: keyof ChangePasswordValues;
  label: string;
  placeholder: string;
  disabled?: boolean;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <div className="relative">
              <Input
                type={visible ? "text" : "password"}
                placeholder={placeholder}
                disabled={disabled}
                className="pr-9 bg-background border-2 focus:border-purple-500 transition-colors"
                {...field}
              />
              <button
                type="button"
                onClick={() => setVisible((v) => !v)}
                className="absolute inset-y-0 right-2 flex items-center text-muted-foreground hover:text-foreground"
                tabIndex={-1}
              >
                {visible ? <EyeOffIcon className="size-4" /> : <EyeIcon className="size-4" />}
              </button>
            </div>
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

export default function ChangePasswordPage() {
  const router = useRouter();
  const [notice, setNotice] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<unknown>(null);
  const [submitting, setSubmitting] = useState(false);

  const form = useForm<ChangePasswordValues>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: emptyValues,
  });

  async function handleSubmit(values: ChangePasswordValues) {
    setSubmitError(null);
    setNotice(null);
    setSubmitting(true);
    try {
      await authClient.changePassword({ currentPassword: values.currentPassword, newPassword: values.newPassword });
      setNotice("Password changed. Every other session was signed out.");
      form.reset(emptyValues);
    } catch (err) {
      setSubmitError(err);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex-1 space-y-4">
      <Breadcrumb items={[{ title: "Profile", href: "/account" }, { title: "Change Password", href: "/account/change-password" }]} />
      <div className="flex items-start justify-between">
        <Heading title="Change Password" description="Update your account password" />
      </div>
      <Separator />

      <Card className="mx-auto w-full max-w-2xl">
        <CardHeader>
          <CardTitle className="text-left text-2xl font-bold">Change Password</CardTitle>
          <CardDescription>Enter your current password and choose a new password</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
              <FormErrorAlert messages={submitError ? errorMessages(submitError) : null} />
              {notice && <Alert variant="success">{notice}</Alert>}
              <PasswordField
                control={form.control}
                name="currentPassword"
                label="Current Password"
                placeholder="Enter your current password"
                disabled={submitting}
              />
              <PasswordField
                control={form.control}
                name="newPassword"
                label="New Password"
                placeholder="Enter your new password (min. 8 characters)"
                disabled={submitting}
              />
              <PasswordField
                control={form.control}
                name="confirmPassword"
                label="Confirm New Password"
                placeholder="Confirm your new password"
                disabled={submitting}
              />

              <div className="flex gap-4 pt-4">
                <Button type="submit" disabled={submitting} className="bg-purple-600 hover:bg-purple-700 dark:bg-purple-600 dark:hover:bg-purple-700 min-w-32">
                  {submitting ? "Changing Password..." : "Change Password"}
                </Button>
                <Button type="button" variant="outline" disabled={submitting} onClick={() => router.push("/account")}>
                  Cancel
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
