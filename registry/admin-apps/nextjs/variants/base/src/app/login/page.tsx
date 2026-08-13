"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { signIn } from "next-auth/react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { DEFAULT_LOGIN_REDIRECT } from "@/routes";

const credentialsSchema = z.object({
  identifier: z.string().min(1, "Email, username, or phone is required"),
  password: z.string().min(1, "Password is required"),
});

const twoFactorSchema = z.object({
  code: z.string().min(1, "Authentication code is required"),
});

const TWO_FACTOR_PREFIX = "2fa_required:";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") ?? DEFAULT_LOGIN_REDIRECT;

  const [challengeToken, setChallengeToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const credentialsForm = useForm<z.infer<typeof credentialsSchema>>({
    resolver: zodResolver(credentialsSchema),
    defaultValues: { identifier: "", password: "" },
  });

  const twoFactorForm = useForm<z.infer<typeof twoFactorSchema>>({
    resolver: zodResolver(twoFactorSchema),
    defaultValues: { code: "" },
  });

  function handleResult(result: Awaited<ReturnType<typeof signIn>> | undefined) {
    if (!result) return;
    if (result.error) {
      if (result.code?.startsWith(TWO_FACTOR_PREFIX)) {
        setChallengeToken(result.code.slice(TWO_FACTOR_PREFIX.length));
        setError(null);
        return;
      }
      setError(challengeToken ? "Invalid or expired code." : "Invalid credentials.");
      return;
    }
    router.push(callbackUrl);
    router.refresh();
  }

  async function onCredentialsSubmit(values: z.infer<typeof credentialsSchema>) {
    setError(null);
    handleResult(await signIn("credentials", { ...values, redirect: false }));
  }

  async function onTwoFactorSubmit(values: z.infer<typeof twoFactorSchema>) {
    if (!challengeToken) return;
    setError(null);
    handleResult(await signIn("credentials", { challengeToken, code: values.code, redirect: false }));
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>{challengeToken ? "Two-factor verification" : "Sign in"}</CardTitle>
          <CardDescription>
            {challengeToken ? "Enter the 6-digit code from your authenticator app, or a backup code." : "Sign in to the admin console."}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {error && <Alert variant="destructive">{error}</Alert>}

          {!challengeToken ? (
            <Form {...credentialsForm}>
              <form className="flex flex-col gap-4" onSubmit={credentialsForm.handleSubmit(onCredentialsSubmit)}>
                <FormField
                  control={credentialsForm.control}
                  name="identifier"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email, username, or phone</FormLabel>
                      <FormControl>
                        <Input type="text" placeholder="you@example.com" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={credentialsForm.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Password</FormLabel>
                      <FormControl>
                        <Input type="password" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button type="submit" disabled={credentialsForm.formState.isSubmitting}>
                  {credentialsForm.formState.isSubmitting ? "Signing in…" : "Sign in"}
                </Button>
              </form>
            </Form>
          ) : (
            <Form {...twoFactorForm}>
              <form className="flex flex-col gap-4" onSubmit={twoFactorForm.handleSubmit(onTwoFactorSubmit)}>
                <FormField
                  control={twoFactorForm.control}
                  name="code"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Authentication code</FormLabel>
                      <FormControl>
                        <Input placeholder="123456" autoFocus {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button type="submit" disabled={twoFactorForm.formState.isSubmitting}>
                  {twoFactorForm.formState.isSubmitting ? "Verifying…" : "Verify"}
                </Button>
                <Button type="button" variant="ghost" onClick={() => setChallengeToken(null)}>
                  Back
                </Button>
              </form>
            </Form>
          )}

          <p className="text-center text-sm text-muted-foreground">
            No account yet?{" "}
            <Link href="/signup" className="font-medium text-foreground underline underline-offset-2">
              Sign up
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
