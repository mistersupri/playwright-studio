import { useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router";
import { Wordmark } from "@/components/wordmark";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { useMe, useProviders } from "@/hooks/use-auth";
import { api, errorMessage } from "@/lib/api";
import type { User } from "@/lib/types";

const OAUTH_ERRORS: Record<string, string> = {
  google_disabled: "Google sign-in is not set up on this server.",
  google_state: "The Google sign-in session expired. Try again.",
  google_email: "Your Google account did not share an email address.",
};

export function LoginPage() {
  const me = useMe();
  const providers = useProviders();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [mode, setMode] = useState<"signin" | "register" | "forgot">("signin");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(() => {
    const code = params.get("error");
    return code ? (OAUTH_ERRORS[code] ?? "Google sign-in failed. Try again.") : null;
  });
  const [busy, setBusy] = useState(false);

  const next = params.get("next")?.startsWith("/") ? params.get("next")! : "/";
  if (me.data) return <Navigate to={next} replace />;

  const canRegister = providers.data?.registration ?? false;

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    try {
      if (mode === "forgot") {
        const email = String(form.get("email") ?? "");
        await api.post("/auth/forgot", { email });
        setSentTo(email);
        return;
      }
      const { user } = await api.post<{ user: User }>(mode === "signin" ? "/auth/login" : "/auth/register", {
        email: String(form.get("email") ?? ""),
        password: String(form.get("password") ?? ""),
        ...(mode === "register" ? { name: String(form.get("name") ?? "") } : {}),
      });
      qc.setQueryData(["me"], user);
      navigate(next, { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-full flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-[360px]">
        <Wordmark className="mb-8" />
        <h1 className="text-xl font-semibold tracking-tight">{TITLES[mode]}</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          {mode === "forgot"
            ? providers.data?.passwordReset
              ? "Enter the email you sign in with and we will send you a link to choose a new password."
              : "Password reset links need email, which this server does not send."
            : "Write Playwright scripts, run them in a real Chromium, and watch every step as it happens."}
        </p>

        {mode === "forgot" ? (
          <ForgotPassword
            available={providers.data?.passwordReset ?? false}
            sentTo={sentTo}
            busy={busy}
            error={error}
            onSubmit={submit}
            onBack={() => {
              setMode("signin");
              setSentTo(null);
              setError(null);
            }}
          />
        ) : (
          <>

        <form className="mt-8 grid gap-4" onSubmit={submit} noValidate={false}>
          {mode === "register" && (
            <div className="grid gap-1.5">
              <Label htmlFor="name">Name</Label>
              <Input id="name" name="name" autoComplete="name" maxLength={80} placeholder="How others see you" />
            </div>
          )}
          <div className="grid gap-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" autoComplete="email" required autoFocus />
          </div>
          <div className="grid gap-1.5">
            <div className="flex items-baseline justify-between gap-3">
              <Label htmlFor="password">Password</Label>
              {mode === "signin" && (
                <button
                  type="button"
                  className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:underline"
                  onClick={() => {
                    setMode("forgot");
                    setError(null);
                  }}
                >
                  Forgot password?
                </button>
              )}
            </div>
            <Input
              id="password"
              name="password"
              type="password"
              required
              minLength={8}
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
            />
            {mode === "register" && <p className="text-xs text-muted-foreground">At least 8 characters.</p>}
          </div>

          {error && (
            <p role="alert" className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
              {error}
            </p>
          )}

          <Button type="submit" size="lg" disabled={busy} className="mt-1">
            {busy && <Spinner />}
            {mode === "signin" ? "Sign in" : "Create account"}
          </Button>
        </form>

        {providers.data?.google && (
          <>
            <div className="my-6 flex items-center gap-3 text-xs text-muted-foreground">
              <span className="h-px flex-1 bg-border" />
              or
              <span className="h-px flex-1 bg-border" />
            </div>
            <Button variant="outline" size="lg" className="w-full" asChild>
              <a href="/api/auth/google">Continue with Google</a>
            </Button>
          </>
        )}

        {canRegister && (
          <p className="mt-8 text-sm text-muted-foreground">
            {mode === "signin" ? "New here? " : "Already have an account? "}
            <button
              type="button"
              className="font-medium text-foreground underline-offset-4 hover:underline focus-visible:underline"
              onClick={() => {
                setMode(mode === "signin" ? "register" : "signin");
                setError(null);
              }}
            >
              {mode === "signin" ? "Create an account" : "Sign in instead"}
            </button>
          </p>
        )}
          </>
        )}
        {providers.isPending && <Spinner className="mt-8 text-muted-foreground" />}
      </div>
    </main>
  );
}

const TITLES = {
  signin: "Sign in to your workbench",
  register: "Create your account",
  forgot: "Reset your password",
};

function ForgotPassword(props: {
  available: boolean;
  sentTo: string | null;
  busy: boolean;
  error: string | null;
  onSubmit: (e: FormEvent<HTMLFormElement>) => void;
  onBack: () => void;
}) {
  const back = (
    <button
      type="button"
      className="mt-8 text-sm font-medium underline-offset-4 hover:underline focus-visible:underline"
      onClick={props.onBack}
    >
      Back to sign in
    </button>
  );

  if (!props.available) {
    return (
      <>
        <p className="mt-8 rounded-md border bg-muted/40 px-3 py-2.5 text-sm">
          Ask an administrator to set a temporary password for you in Settings → Users.
        </p>
        {back}
      </>
    );
  }

  if (props.sentTo) {
    return (
      <>
        <p role="status" className="mt-8 rounded-md border bg-muted/40 px-3 py-2.5 text-sm">
          If <span className="font-medium">{props.sentTo}</span> has an account, a reset link is on its way. The link
          works for one hour.
        </p>
        {back}
      </>
    );
  }

  return (
    <>
      <form className="mt-8 grid gap-4" onSubmit={props.onSubmit}>
        <div className="grid gap-1.5">
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" autoComplete="email" required autoFocus />
        </div>
        {props.error && (
          <p role="alert" className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
            {props.error}
          </p>
        )}
        <Button type="submit" size="lg" disabled={props.busy} className="mt-1">
          {props.busy && <Spinner />}
          Send reset link
        </Button>
      </form>
      {back}
    </>
  );
}
