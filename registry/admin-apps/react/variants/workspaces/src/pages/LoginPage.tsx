import { type FormEvent, useState } from "react";
import { observer } from "mobx-react-lite";
import { type Location, useLocation, useNavigate } from "react-router-dom";
import { AuthApiError } from "@easy-auth/auth-client";
import { useAuthStore } from "@/stores/store-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type Mode = "login" | "signup";
type Step = "credentials" | "two-factor";

export const LoginPage = observer(function LoginPage() {
  const store = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  const redirectTo = (location.state as { from?: Location } | null)?.from?.pathname ?? "/account";

  const [mode, setMode] = useState<Mode>("login");
  const [step, setStep] = useState<Step>("credentials");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [challengeToken, setChallengeToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleCredentialsSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      if (mode === "signup") {
        await store.signup({ email: identifier, password });
        navigate(redirectTo, { replace: true });
        return;
      }

      const challenge = await store.login({ identifier, password });
      if (challenge) {
        setChallengeToken(challenge.challengeToken);
        setStep("two-factor");
      } else {
        navigate(redirectTo, { replace: true });
      }
    } catch (err) {
      setError(err instanceof AuthApiError ? err.message : "Something went wrong. Please try again.");
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
      navigate(redirectTo, { replace: true });
    } catch (err) {
      setError(err instanceof AuthApiError ? err.message : "Invalid code. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>{step === "two-factor" ? "Two-factor verification" : mode === "login" ? "Sign in" : "Create an account"}</CardTitle>
          <CardDescription>
            {step === "two-factor"
              ? "Enter the 6-digit code from your authenticator app, or a backup code."
              : mode === "login"
                ? "Use the email, username, or phone number and password for your account on this deployment."
                : "Pick an email and a password of at least 8 characters. You'll create or join a workspace next."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {step === "credentials" ? (
            <form onSubmit={handleCredentialsSubmit} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="identifier">{mode === "login" ? "Email, username, or phone" : "Email"}</Label>
                <Input
                  id="identifier"
                  type={mode === "login" ? "text" : "email"}
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  required
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="password">Password</Label>
                <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
              </div>
              {error ? <p className="text-sm text-destructive">{error}</p> : null}
              <Button type="submit" disabled={submitting}>
                {submitting ? "Please wait…" : mode === "login" ? "Sign in" : "Sign up"}
              </Button>
              <Button
                type="button"
                variant="link"
                className="self-center"
                onClick={() => {
                  setMode(mode === "login" ? "signup" : "login");
                  setError(null);
                }}
              >
                {mode === "login" ? "Need an account? Sign up" : "Already have an account? Sign in"}
              </Button>
            </form>
          ) : (
            <form onSubmit={handleTwoFactorSubmit} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="code">Authentication code</Label>
                <Input
                  id="code"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="123456"
                  autoFocus
                  required
                />
              </div>
              {error ? <p className="text-sm text-destructive">{error}</p> : null}
              <Button type="submit" disabled={submitting}>
                {submitting ? "Verifying…" : "Verify"}
              </Button>
              <Button
                type="button"
                variant="link"
                className="self-center"
                onClick={() => {
                  setStep("credentials");
                  setError(null);
                }}
              >
                Back
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
});
