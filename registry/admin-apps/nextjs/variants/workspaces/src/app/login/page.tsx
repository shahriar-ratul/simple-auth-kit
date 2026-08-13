"use client";

import { observer } from "mobx-react-lite";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { errorMessage } from "@/lib/error";
import { useAuthStore } from "@/lib/stores/store-context";

export default observer(function LoginPage() {
  const store = useAuthStore();
  const router = useRouter();

  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [challengeToken, setChallengeToken] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleCredentialsSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const outcome = await store.login({ identifier, password });
      if (outcome.status === "twoFactorRequired") {
        setChallengeToken(outcome.challengeToken);
      } else {
        router.push("/");
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleTwoFactorSubmit(event: FormEvent) {
    event.preventDefault();
    if (!challengeToken) return;
    setError(null);
    setSubmitting(true);
    try {
      await store.loginTwoFactor({ challengeToken, code });
      router.push("/");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
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
            <form className="flex flex-col gap-4" onSubmit={handleCredentialsSubmit}>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="identifier">Email, username, or phone</Label>
                <Input id="identifier" type="text" required value={identifier} onChange={(e) => setIdentifier(e.target.value)} placeholder="you@example.com" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="password">Password</Label>
                <Input id="password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
              </div>
              <Button type="submit" disabled={submitting}>
                {submitting ? "Signing in…" : "Sign in"}
              </Button>
            </form>
          ) : (
            <form className="flex flex-col gap-4" onSubmit={handleTwoFactorSubmit}>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="code">Authentication code</Label>
                <Input id="code" required autoFocus value={code} onChange={(e) => setCode(e.target.value)} placeholder="123456" />
              </div>
              <Button type="submit" disabled={submitting}>
                {submitting ? "Verifying…" : "Verify"}
              </Button>
              <Button type="button" variant="ghost" onClick={() => setChallengeToken(null)}>
                Back
              </Button>
            </form>
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
});
