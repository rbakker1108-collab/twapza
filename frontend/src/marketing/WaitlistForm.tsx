import { useState, type FormEvent } from "react";

import { api } from "../api/client";
import { useI18n } from "../i18n";

/** "Get early access": stores the address so we can email people when Twapza launches. */
export function WaitlistForm() {
  const { t, lang } = useI18n();
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "done">("idle");
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setState("sending");
    setError(null);
    try {
      await api.joinWaitlist(email, lang);
      setState("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("Something went wrong. Please try again."));
      setState("idle");
    }
  }

  if (state === "done") {
    return (
      <p role="status" className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-emerald-300">
        ✓ {t("You're on the list. We'll email you when Twapza opens.")}
      </p>
    );
  }
  return (
    <form onSubmit={submit} className="space-y-2">
      <div className="flex flex-col gap-2 sm:flex-row">
        <label className="sr-only" htmlFor="waitlist-email">
          {t("Email address")}
        </label>
        <input
          id="waitlist-email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={t("you@example.com")}
          className="min-w-0 flex-1 rounded-xl border border-line-strong bg-surface-2 px-4 py-3"
        />
        <button
          type="submit"
          disabled={state === "sending"}
          className="rounded-xl bg-brand-500 px-5 py-3 font-semibold text-black transition hover:bg-brand-400 disabled:opacity-60"
        >
          {state === "sending" ? t("Sending…") : t("Get early access")}
        </button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-red-400">
          {error}
        </p>
      )}
      <p className="text-xs text-faint">{t("We only use your email to tell you when Twapza launches. No spam, unsubscribe anytime.")}</p>
    </form>
  );
}
