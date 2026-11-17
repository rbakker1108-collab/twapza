import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";

import { api, type Account, type BillingPeriod, type PlanId } from "../api/client";
import { choosePlan, isPaying, PAYING_STATUSES, useAuth } from "../auth/AuthProvider";
import { useI18n } from "../i18n";
import { PLANS, price } from "../marketing/plans";

const card = "rounded-2xl border border-line bg-surface p-6";
const input = "w-full rounded-xl border border-line-strong bg-surface-2 px-4 py-2.5 text-ink";
const secondary = "rounded-xl border border-line-strong px-4 py-2 text-sm font-medium transition hover:bg-surface-2 disabled:opacity-60";
const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

/** "pro_yearly" etc. for the current subscription, to notice when it changes. */
const subscriptionKey = (a: Account | null) =>
  a?.subscription?.status ? `${a.subscription.plan}_${a.subscription.period}_${a.subscription.status}` : null;

export function AccountPage() {
  const { t, lang } = useI18n();
  const { account, setAccount, refresh, logout } = useAuth();
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const upgraded = params.get("upgraded") === "1";
  const startPlan = useRef(subscriptionKey(account));
  const [waiting, setWaiting] = useState(upgraded);

  // Back from Creem: the plan switches once Creem's webhook arrives (seconds).
  useEffect(() => {
    if (!upgraded) return;
    let tries = 0;
    const timer = window.setInterval(async () => {
      tries += 1;
      const me = await refresh();
      const now = subscriptionKey(me);
      if ((me && me.plan.id !== "free" && now !== startPlan.current) || tries >= 15) {
        window.clearInterval(timer);
        setWaiting(false);
      }
    }, 2000);
    return () => window.clearInterval(timer);
  }, [upgraded, refresh]);

  useEffect(() => {
    if (location.hash === "#plans") document.getElementById("plans")?.scrollIntoView();
  }, [location.hash]);

  if (!account) return null;
  const date = (iso: string) => new Date(iso).toLocaleDateString(lang, { dateStyle: "long" });
  const sub = account.subscription;
  const used = Math.min(account.usage.used_minutes, account.usage.limit_minutes);
  const pct = account.usage.limit_minutes ? (used / account.usage.limit_minutes) * 100 : 0;
  const planName = PLANS.find((p) => p.id === account.plan.id)?.name ?? account.plan.id;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">{t("Your account")}</h1>
          <p className="mt-1 text-muted">{account.email}</p>
        </div>
        <button
          type="button"
          className={secondary}
          onClick={async () => {
            await logout();
            navigate("/", { replace: true });
          }}
        >
          {t("Log out")}
        </button>
      </div>

      {upgraded && (
        <div role="status" className="flex items-start justify-between gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
          <span>
            {waiting
              ? t("Thanks for your payment! Your plan is being activated, this takes a few seconds…")
              : t("Thanks! Your {plan} plan is active.", { plan: t(planName) })}
          </span>
          <button type="button" onClick={() => setParams({}, { replace: true })} aria-label={t("Close")}>×</button>
        </div>
      )}

      <section className={card}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm text-muted">{t("Current plan")}</p>
            <p className="mt-1 text-2xl font-semibold">{t(planName)}</p>
            <SubscriptionLine account={account} date={date} />
          </div>
          {sub?.status && sub.status !== "manual" && account.billing_enabled && (
            <PortalButton />
          )}
        </div>
        <div className="mt-6">
          <div className="flex justify-between text-sm">
            <span>{t("Video minutes this month")}</span>
            <span className="text-muted">
              {t("{used} of {limit} min", { used: Math.round(used), limit: account.usage.limit_minutes })}
            </span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-3" role="progressbar"
            aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
            <div className={`h-full rounded-full ${pct >= 90 ? "bg-red-500" : "bg-brand-500"}`} style={{ width: `${pct}%` }} />
          </div>
          <p className="mt-2 text-xs text-faint">
            {t("Resets on {date}. Videos up to {n} min on your plan.", {
              date: date(account.usage.resets_at), n: account.plan.max_video_minutes })}{" "}
            {t("Up to {n} AI requests per day (finding highlights, writing descriptions).", { n: account.plan.ai_per_day })}
          </p>
        </div>
      </section>

      <PlanPicker account={account} onChange={setAccount} />
      <ChangePassword />
      <DeleteAccount onDeleted={() => { setAccount(null); navigate("/", { replace: true }); }} />
    </div>
  );
}

function SubscriptionLine({ account, date }: { account: Account; date: (iso: string) => string }) {
  const { t } = useI18n();
  const sub = account.subscription;
  if (!sub?.status || (account.plan.id === "free" && !sub.ends_at)) return null;
  if (sub.status === "manual") return <p className="mt-1 text-sm text-muted">{t("Given to you by the Twapza team.")}</p>;
  if (sub.status === "past_due")
    return <p className="mt-1 text-sm text-amber-300">{t("Your last payment failed. Update your payment method to keep your plan.")}</p>;
  if (sub.ends_at && PAYING_STATUSES.includes(sub.status))
    return <p className="mt-1 text-sm text-muted">{t("Cancelled: your plan ends on {date}.", { date: date(sub.ends_at) })}</p>;
  if (sub.renews_at && ["active", "trialing"].includes(sub.status))
    return <p className="mt-1 text-sm text-muted">{t("Renews on {date}.", { date: date(sub.renews_at) })}</p>;
  return null;
}

function PortalButton() {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="text-end">
      <button
        type="button"
        className={secondary}
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            window.location.assign((await api.billingPortal()).url);
          } catch (err) {
            setError(message(err));
            setBusy(false);
          }
        }}
      >
        {t("Manage subscription")}
      </button>
      <p className="mt-1 text-xs text-faint">{t("Payment method, invoices, cancel")}</p>
      {error && <p role="alert" className="mt-1 text-xs text-red-400">{error}</p>}
    </div>
  );
}

function PlanPicker({ account, onChange }: { account: Account; onChange: (a: Account) => void }) {
  const { t, lang } = useI18n();
  const [period, setPeriod] = useState<BillingPeriod>(account.subscription?.period ?? "yearly");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const sub = account.subscription;
  const paying = sub?.status && PAYING_STATUSES.includes(sub.status) ? sub : null;

  async function pick(plan: PlanId) {
    setBusy(plan);
    setError(null);
    try {
      if (isPaying(account)) {
        const name = t(PLANS.find((p) => p.id === plan)?.name ?? plan);
        if (!window.confirm(t("Switch to {plan} now? The price difference is charged right away.", { plan: name }))) return;
      }
      const updated = await choosePlan(account, plan, period); // new subscription: goes to Creem
      if (updated) onChange(updated);
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <section id="plans" className={`${card} scroll-mt-24`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">{t("Plans")}</h2>
        <div role="group" aria-label={t("Billing period")} className="flex rounded-xl border border-line bg-surface-2 p-1 text-sm">
          {(["monthly", "yearly"] as const).map((p) => (
            <button key={p} type="button" aria-pressed={period === p} onClick={() => setPeriod(p)}
              className={`rounded-lg px-3 py-1 ${period === p ? "bg-surface-3 text-ink" : "text-muted"}`}>
              {p === "monthly" ? t("Monthly") : t("Yearly")}
            </button>
          ))}
        </div>
      </div>
      {!account.billing_enabled && (
        <p className="mt-3 rounded-lg bg-surface-2 px-3 py-2 text-sm text-muted">{t("Paid plans can't be bought on this server yet.")}</p>
      )}
      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        {PLANS.map((plan) => {
          const current = account.plan.id === plan.id && (plan.id === "free" || paying?.period === period || sub?.status === "manual");
          const amount = period === "yearly" ? plan.yearly : plan.monthly;
          let action: ReactNode = null;
          if (current) action = <span className="text-sm font-medium text-brand-300">{t("Current plan")}</span>;
          else if (plan.id === "free") action = paying ? <span className="text-xs text-faint">{t("Cancel in Manage subscription")}</span> : null;
          else if (account.billing_enabled && sub?.status !== "manual")
            action = (
              <button type="button" disabled={busy !== null} onClick={() => pick(plan.id as PlanId)}
                className="w-full rounded-lg bg-brand-500 px-3 py-2 text-sm font-semibold text-black transition hover:bg-brand-400 disabled:opacity-60">
                {busy === plan.id ? t("One moment…") : paying ? t("Switch to {plan}", { plan: t(plan.name) }) : t("Get {plan}", { plan: t(plan.name) })}
              </button>
            );
          return (
            <div key={plan.id} data-testid={`account-plan-${plan.id}`}
              className={`flex flex-col gap-3 rounded-xl border p-4 ${current ? "border-brand-500 bg-brand-500/5" : "border-line"}`}>
              <div>
                <p className="font-semibold">{t(plan.name)}</p>
                <p className="text-sm text-muted">
                  {price(amount, lang)} {t("/ month")}
                </p>
              </div>
              <p className="flex-1 text-xs text-muted">{t(plan.features[0])}</p>
              {action}
            </div>
          );
        })}
      </div>
      {error && <p role="alert" className="mt-3 text-sm text-red-400">{error}</p>}
      <p className="mt-4 text-xs text-faint">{t("Payments are handled by Creem, which sells as merchant of record. Prices exclude VAT/sales tax, which is added at checkout where it applies.")}</p>
    </section>
  );
}

function ChangePassword() {
  const { t } = useI18n();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "done">("idle");
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setState("busy");
    setError(null);
    try {
      await api.changePassword(current, next);
      setCurrent("");
      setNext("");
      setState("done");
    } catch (err) {
      setError(message(err));
      setState("idle");
    }
  }

  return (
    <section className={card}>
      <h2 className="text-lg font-semibold">{t("Change password")}</h2>
      <form onSubmit={submit} className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-sm">
          <span className="text-ink-soft">{t("Current password")}</span>
          <input type="password" required autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} className={input} />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-ink-soft">{t("New password")}</span>
          <input type="password" required minLength={8} autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} className={input} />
        </label>
        <div className="flex items-center gap-3 sm:col-span-2">
          <button type="submit" disabled={state === "busy"} className={secondary}>{t("Save new password")}</button>
          {state === "done" && <span role="status" className="text-sm text-emerald-300">✓ {t("Password changed. Other devices are logged out.")}</span>}
          {error && <span role="alert" className="text-sm text-red-400">{error}</span>}
        </div>
      </form>
    </section>
  );
}

function DeleteAccount({ onDeleted }: { onDeleted: () => void }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.deleteAccount(password);
      onDeleted();
    } catch (err) {
      setError(message(err));
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl border border-red-500/30 p-6">
      <h2 className="text-lg font-semibold">{t("Delete account")}</h2>
      <p className="mt-1 text-sm text-muted">
        {t("Deletes your account, projects and clips for good, and cancels your subscription.")}
      </p>
      {open ? (
        <form onSubmit={submit} className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="flex-1 space-y-1 text-sm">
            <span className="text-ink-soft">{t("Type your password to confirm")}</span>
            <input type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className={input} />
          </label>
          <button type="submit" disabled={busy} className="rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-500 disabled:opacity-60">
            {t("Delete my account")}
          </button>
        </form>
      ) : (
        <button type="button" onClick={() => setOpen(true)} className={`${secondary} mt-4 border-red-500/40 text-red-300`}>
          {t("Delete account…")}
        </button>
      )}
      {error && <p role="alert" className="mt-2 text-sm text-red-400">{error}</p>}
    </section>
  );
}
