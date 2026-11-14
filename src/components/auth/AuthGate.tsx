"use client";

import type { User } from "@supabase/supabase-js";
import { createContext, FormEvent, ReactNode, useContext, useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { Button, Card, ErrorBanner, Field, inputClass, PageShell, Spinner, SuccessBanner } from "@/components/ui";

const UserContext = createContext<User | null>(null);
export const useSignedInUser = () => useContext(UserContext);

type AuthState = { status: "loading" } | { status: "unconfigured" } | { status: "signed_out" } | { status: "signed_in"; user: User };

/** Tracks the Supabase session in the browser. */
export function useAuth(): AuthState {
  const [state, setState] = useState<AuthState>(() =>
    getSupabaseBrowserClient() ? { status: "loading" } : { status: "unconfigured" }
  );

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    let active = true;
    supabase.auth.getUser().then(({ data }) => {
      if (active) setState(data.user ? { status: "signed_in", user: data.user } : { status: "signed_out" });
    });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setState(session?.user ? { status: "signed_in", user: session.user } : { status: "signed_out" });
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  return state;
}

export function SignInForm({ intro }: { intro?: string }) {
  const [mode, setMode] = useState<"sign_in" | "sign_up">("sign_in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      if (mode === "sign_in") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}/library` },
        });
        if (error) throw error;
        if (!data.session) setNotice("Check your email for a link to confirm your account, then sign in.");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      setError(
        /invalid login/i.test(message)
          ? "That email and password don't match. Please try again."
          : /already registered/i.test(message)
            ? "That email already has an account. Please sign in instead."
            : message || "Couldn't sign in. Please try again."
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="mx-auto w-full max-w-md">
      <h1 className="text-2xl font-bold text-slate-900">{mode === "sign_in" ? "Parent sign in" : "Create a parent account"}</h1>
      <p className="mt-1 text-sm text-slate-600">
        {intro ?? "Sign in to manage weekly homework and let your children practise."}
      </p>
      <form onSubmit={handleSubmit} className="mt-5 space-y-4">
        <Field label="Email">
          <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} />
        </Field>
        <Field label="Password" hint={mode === "sign_up" ? "At least 8 characters." : undefined}>
          <input
            type="password"
            required
            minLength={mode === "sign_up" ? 8 : undefined}
            autoComplete={mode === "sign_in" ? "current-password" : "new-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={inputClass}
          />
        </Field>
        {error && <ErrorBanner message={error} />}
        {notice && <SuccessBanner message={notice} />}
        <Button type="submit" disabled={busy} className="w-full">
          {busy ? "Please wait…" : mode === "sign_in" ? "Sign in" : "Create account"}
        </Button>
      </form>
      <p className="mt-4 text-center text-sm text-slate-600">
        {mode === "sign_in" ? "New here? " : "Already have an account? "}
        <button
          type="button"
          onClick={() => {
            setMode(mode === "sign_in" ? "sign_up" : "sign_in");
            setError(null);
            setNotice(null);
          }}
          className="font-semibold text-indigo-700 hover:underline"
        >
          {mode === "sign_in" ? "Create an account" : "Sign in"}
        </button>
      </p>
    </Card>
  );
}

/** Renders children only for a signed-in user; otherwise a sign-in form. */
export default function AuthGate({ children, intro }: { children: ReactNode; intro?: string }) {
  const auth = useAuth();

  if (auth.status === "loading") {
    return (
      <PageShell>
        <Spinner />
      </PageShell>
    );
  }
  if (auth.status === "unconfigured") {
    return (
      <PageShell>
        <Card className="mx-auto max-w-lg text-center">
          <div aria-hidden className="text-4xl">🛠️</div>
          <h1 className="mt-3 text-xl font-bold text-slate-900">The homework library isn&apos;t set up yet</h1>
          <p className="mt-2 text-slate-600">
            Add the Supabase settings to <code className="rounded bg-slate-100 px-1">.env.local</code> and restart the app.
            The photo homework checker still works without it.
          </p>
        </Card>
      </PageShell>
    );
  }
  if (auth.status === "signed_out") {
    return (
      <PageShell>
        <SignInForm intro={intro} />
      </PageShell>
    );
  }
  return <UserContext.Provider value={auth.user}>{children}</UserContext.Provider>;
}
