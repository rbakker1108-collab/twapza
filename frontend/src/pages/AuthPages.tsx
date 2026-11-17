import { useState, type FormEvent, type ReactNode } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";

import { api, type BillingPeriod, type PlanId } from "../api/client";
import { choosePlan, useAuth } from "../auth/AuthProvider";
import { useI18n, useT } from "../i18n";

const input = "w-full rounded-xl border border-line-strong bg-surface-2 px-4 py-3 text-ink placeholder:text-faint";
const primary =
  "w-full rounded-xl bg-brand-500 px-4 py-3 font-semibold text-black transition hover:bg-brand-400 disabled:opacity-60";

/** Only follow ?next= to our own pages. */
function safeNext(next: string | null): string {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/app";
}

function AuthCard({ title, subtitle, children }: { title: string; subtitle?: ReactNode; children: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-md px-4 py-16 sm:py-24">
      <div className="rounded-2xl border border-line bg-surface p-6 shadow-2xl shadow-black/40 sm:p-8">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-2 text-sm text-muted">{subtitle}</p>}
        <div className="mt-6">{children}</div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium text-ink-soft">{label}</span>
      {children}
    </label>
  );
}

function ErrorText({ error }: { error: string | null }) {
  return error ? (
    <p role="alert" className="text-sm text-red-400">
      {error}
    </p>
  ) : null;
}

const message = (err: unknown, fallback: string) => (err instanceof Error ? err.message : fallback);

export function LoginPage() {
  const t = useT();
  const { account, setAccount } = useAuth();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const next = safeNext(params.get("next"));

  if (account && !busy) return <Navigate to={next} replace />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      setAccount(await api.login(email, password));
      navigate(next, { replace: true });
    } catch (err) {
      setError(message(err, t("Something went wrong. Please try again.")));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthCard
      title={t("Log in to Twapza")}
      subtitle={
        <>
          {t("New here?")}{" "}
          <Link to={`/signup${params.toString() ? `?${params}` : ""}`} className="text-brand-400 hover:underline">
            {t("Create a free account")}
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        <Field label={t("Email address")}>
          <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className={input} />
        </Field>
        <Field label={t("Password")}>
          <input type="password" required autoComplete="current-password" value={password}
            onChange={(e) => setPassword(e.target.value)} className={input} />
        </Field>
        <ErrorText error={error} />
        <button type="submit" disabled={busy} className={primary}>
          {busy ? t("Logging in…") : t("Log in")}
        </button>
        <p className="text-center text-sm">
          <Link to="/forgot-password" className="text-muted hover:text-ink">
            {t("Forgot your password?")}
          </Link>
        </p>
      </form>
    </AuthCard>
  );
}

export function SignupPage() {
  const { t, lang } = useI18n();
  const { account, setAccount } = useAuth();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const plan = params.get("plan") as PlanId | null;
  const period = (params.get("period") === "monthly" ? "monthly" : "yearly") as BillingPeriod;
  const paid = plan === "creator" || plan === "pro";

  if (account && !busy) return <Navigate to={paid ? "/account#plans" : safeNext(params.get("next"))} replace />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const created = await api.signup(email, password, lang);
      setAccount(created);
      if (paid && created.billing_enabled) {
        try {
          await choosePlan(created, plan, period); // goes to the checkout page
          return;
        } catch {
          navigate("/account#plans", { replace: true });
          return;
        }
      }
      navigate(safeNext(params.get("next")), { replace: true });
    } catch (err) {
      setError(message(err, t("Something went wrong. Please try again.")));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthCard
      title={t("Create your Twapza account")}
      subtitle={
        <>
          {t("Already have an account?")}{" "}
          <Link to={`/login${params.toString() ? `?${params}` : ""}`} className="text-brand-400 hover:underline">
            {t("Log in")}
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        <Field label={t("Email address")}>
          <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className={input} />
        </Field>
        <Field label={t("Password")}>
          <input type="password" required minLength={8} autoComplete="new-password" value={password}
            onChange={(e) => setPassword(e.target.value)} className={input} />
        </Field>
        <p className="text-xs text-faint">{t("At least 8 characters.")}</p>
        <ErrorText error={error} />
        <button type="submit" disabled={busy} className={primary}>
          {busy ? t("Creating account…") : paid ? t("Create account and continue to payment") : t("Create free account")}
        </button>
        <p className="text-center text-xs text-faint">{t("Free plan: 60 minutes of video per month, no credit card needed.")}</p>
        <p className="text-center text-xs text-faint">
          {t("By creating an account, you agree to:")}{" "}
          <Link to="/terms" className="text-muted underline-offset-2 hover:underline">{t("Terms of service")}</Link>
          {" · "}
          <Link to="/privacy" className="text-muted underline-offset-2 hover:underline">{t("Privacy policy")}</Link>
        </p>
      </form>
    </AuthCard>
  );
}

export function ForgotPasswordPage() {
  const t = useT();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.forgotPassword(email);
      setSent(true);
    } catch (err) {
      setError(message(err, t("Something went wrong. Please try again.")));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthCard title={t("Reset your password")} subtitle={t("We'll email you a link to choose a new password.")}>
      {sent ? (
        <p role="status" className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
          {t("If there is an account with this email, a reset link is on its way. Check your inbox (and spam folder).")}
        </p>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <Field label={t("Email address")}>
            <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className={input} />
          </Field>
          <ErrorText error={error} />
          <button type="submit" disabled={busy} className={primary}>
            {busy ? t("Sending…") : t("Send reset link")}
          </button>
        </form>
      )}
      <p className="mt-4 text-center text-sm">
        <Link to="/login" className="text-muted hover:text-ink">
          {t("Back to log in")}
        </Link>
      </p>
    </AuthCard>
  );
}

export function ResetPasswordPage() {
  const t = useT();
  const { setAccount } = useAuth();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const token = params.get("token") ?? "";

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      setAccount(await api.resetPassword(token, password));
      navigate("/app", { replace: true });
    } catch (err) {
      setError(message(err, t("Something went wrong. Please try again.")));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthCard title={t("Choose a new password")}>
      <form onSubmit={submit} className="space-y-4">
        <Field label={t("New password")}>
          <input type="password" required minLength={8} autoComplete="new-password" value={password}
            onChange={(e) => setPassword(e.target.value)} className={input} />
        </Field>
        <p className="text-xs text-faint">{t("At least 8 characters.")}</p>
        <ErrorText error={error} />
        <button type="submit" disabled={busy || !token} className={primary}>
          {busy ? t("Saving…") : t("Save new password")}
        </button>
      </form>
    </AuthCard>
  );
}
