"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { api, ApiError } from "@/lib/api-client";

function useForm() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  async function submit(fn: () => Promise<void>) {
    setLoading(true);
    setError(null);
    setFieldErrors({});
    try {
      await fn();
    } catch (e) {
      if (e instanceof ApiError && e.issues?.length) {
        setFieldErrors(Object.fromEntries(e.issues.map((i) => [i.path, i.message])));
        setError(null);
      } else setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  return { loading, error, fieldErrors, submit };
}

function ErrorLine({ error }: { error: string | null }) {
  return error ? <p className="rounded-md border border-red/30 bg-red-soft px-3 py-2 text-xs text-red">{error}</p> : null;
}

export function LoginForm({ next, demo }: { next?: string; demo: boolean }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const f = useForm();
  const login = (e: string, p: string) =>
    f.submit(async () => {
      await api("POST", "/api/auth/login", { email: e, password: p });
      router.push(next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard");
      router.refresh();
    });
  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        login(email, password);
      }}
    >
      <Field label="Email" htmlFor="email" error={f.fieldErrors.email}>
        <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
      </Field>
      <Field
        label={
          <span className="flex justify-between">
            Password
            <Link href="/forgot-password" className="font-normal text-fg-subtle hover:text-fg">
              Forgot?
            </Link>
          </span>
        }
        htmlFor="password"
      >
        <Input id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
      </Field>
      <ErrorLine error={f.error} />
      <Button type="submit" variant="primary" loading={f.loading} className="w-full justify-center">
        Sign in
      </Button>
      {demo ? (
        <button
          type="button"
          onClick={() => {
            setEmail("demo@forgebase.dev");
            setPassword("forgebase-demo");
            login("demo@forgebase.dev", "forgebase-demo");
          }}
          className="rounded-md border border-dashed border-border px-3 py-2 text-left text-xs text-fg-muted hover:border-border-strong hover:text-fg"
        >
          <span className="font-medium text-fg">Explore the demo workspace →</span>
          <span className="mt-0.5 block text-fg-subtle">Forge Robotics · Autonomous Cargo Transport Robot (seeded, clearly labeled demo data)</span>
        </button>
      ) : null}
    </form>
  );
}

export function SignupForm({ next }: { next?: string }) {
  const router = useRouter();
  const [v, setV] = useState({ displayName: "", username: "", email: "", password: "" });
  const [touchedUser, setTouchedUser] = useState(false);
  const f = useForm();
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setV((s) => {
      const next = { ...s, [k]: value };
      if (k === "displayName" && !touchedUser)
        next.username = value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 39);
      return next;
    });
  };
  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        f.submit(async () => {
          await api("POST", "/api/auth/signup", v);
          toast.success("Account created — check your email to verify it");
          router.push(next && next.startsWith("/") && !next.startsWith("//") ? next : "/organizations/new?welcome=1");
          router.refresh();
        });
      }}
    >
      <Field label="Full name" htmlFor="name" error={f.fieldErrors.displayName}>
        <Input id="name" required autoComplete="name" value={v.displayName} onChange={set("displayName")} autoFocus />
      </Field>
      <Field label="Username" htmlFor="username" error={f.fieldErrors.username} hint="Used for @mentions">
        <Input
          id="username"
          required
          value={v.username}
          onChange={(e) => {
            setTouchedUser(true);
            set("username")(e);
          }}
          className="font-mono"
        />
      </Field>
      <Field label="Work email" htmlFor="email" error={f.fieldErrors.email}>
        <Input id="email" type="email" autoComplete="email" required value={v.email} onChange={set("email")} />
      </Field>
      <Field label="Password" htmlFor="password" error={f.fieldErrors.password} hint="10+ characters, mixing letters with numbers or symbols">
        <Input id="password" type="password" autoComplete="new-password" required value={v.password} onChange={set("password")} />
      </Field>
      <ErrorLine error={f.error} />
      <Button type="submit" variant="primary" loading={f.loading} className="w-full justify-center">
        Create account
      </Button>
    </form>
  );
}

export function ForgotForm() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const f = useForm();
  if (sent)
    return (
      <p className="text-sm text-fg-muted">
        If an account exists for <span className="font-medium text-fg">{email}</span>, a reset link is on its way. It expires in one hour.
      </p>
    );
  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        f.submit(async () => {
          await api("POST", "/api/auth/forgot-password", { email });
          setSent(true);
        });
      }}
    >
      <Field label="Email" htmlFor="email">
        <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
      </Field>
      <ErrorLine error={f.error} />
      <Button type="submit" variant="primary" loading={f.loading} className="w-full justify-center">
        Send reset link
      </Button>
    </form>
  );
}

export function ResetForm({ token }: { token: string }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const f = useForm();
  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        f.submit(async () => {
          await api("POST", "/api/auth/reset-password", { token, password });
          toast.success("Password updated. Sign in with your new password.");
          router.push("/login");
        });
      }}
    >
      <Field label="New password" htmlFor="password" error={f.fieldErrors.password} hint="10+ characters, mixing letters with numbers or symbols">
        <Input id="password" type="password" autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} autoFocus />
      </Field>
      <ErrorLine error={f.error} />
      <Button type="submit" variant="primary" loading={f.loading} className="w-full justify-center">
        Update password
      </Button>
    </form>
  );
}

export function VerifyEmail({ token }: { token: string }) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "ok" | "error">("idle");
  const [msg, setMsg] = useState("");
  return state === "ok" ? (
    <div className="grid gap-3 text-sm">
      <p className="text-fg">Your email is verified.</p>
      <Button variant="primary" onClick={() => router.push("/dashboard")} className="justify-center">
        Continue to Forgebase
      </Button>
    </div>
  ) : (
    <div className="grid gap-3 text-sm">
      <p className="text-fg-muted">Confirm your email address to finish setting up your account.</p>
      {state === "error" ? <ErrorLine error={msg} /> : null}
      <Button
        variant="primary"
        className="justify-center"
        onClick={async () => {
          try {
            await api("POST", "/api/auth/verify-email", { token });
            setState("ok");
            router.refresh();
          } catch (e) {
            setMsg((e as Error).message);
            setState("error");
          }
        }}
      >
        Verify email
      </Button>
    </div>
  );
}

export function AcceptInvite({ token, orgName }: { token: string; orgName: string }) {
  const router = useRouter();
  const f = useForm();
  return (
    <div className="grid gap-3">
      <ErrorLine error={f.error} />
      <Button
        variant="primary"
        loading={f.loading}
        className="justify-center"
        onClick={() =>
          f.submit(async () => {
            const r = await api<{ organization: { slug: string } }>("POST", `/api/v1/invitations/${token}/accept`);
            toast.success(`Welcome to ${orgName}`);
            router.push(`/org/${r.organization.slug}`);
            router.refresh();
          })
        }
      >
        Join {orgName}
      </Button>
    </div>
  );
}
