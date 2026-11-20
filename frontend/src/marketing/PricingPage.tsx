import { useState } from "react";

import { msg, useT } from "../i18n";
import { PricingCards } from "./PricingCards";
import { PageHero, Section } from "./ui";

const QUESTIONS = [
  { q: msg("What counts as a minute?"), a: msg("The length of the videos you upload or import. Finding clips, editing and downloading don't use extra minutes.") },
  { q: msg("Can I cancel anytime?"), a: msg("Yes. Plans are monthly or yearly, and you can cancel whenever you like.") },
  { q: msg("Is there a free plan?"), a: msg("Yes. The free plan lets you try every core feature on your own videos, with a small watermark.") },
  { q: msg("Do unused minutes roll over?"), a: msg("No, your minutes reset at the start of every billing month.") },
];

export function PricingPage() {
  const t = useT();
  const [yearly, setYearly] = useState(true);
  return (
    <>
      <PageHero title={t("Simple pricing for every creator")} text={t("Start for free. Upgrade when you post more.")} />
      <Section className="py-10">
        <div className="mb-10 flex justify-center">
          <div role="radiogroup" aria-label={t("Billing period")} className="inline-flex gap-1 rounded-xl bg-surface-2 p-1 text-sm">
            {[false, true].map((y) => (
              <button
                key={String(y)}
                type="button"
                role="radio"
                aria-checked={yearly === y}
                onClick={() => setYearly(y)}
                className={`rounded-lg px-4 py-2 font-medium transition ${yearly === y ? "bg-surface-3 text-ink" : "text-muted hover:text-ink"}`}
              >
                {y ? t("Yearly") : t("Monthly")}
                {y && <span className="ms-2 rounded-full bg-brand-500/15 px-2 py-0.5 text-xs text-brand-300">{t("save 20%")}</span>}
              </button>
            ))}
          </div>
        </div>
        <PricingCards yearly={yearly} />
        <p className="mt-6 text-center text-sm text-faint">{t("Prices in US dollars. Need more minutes or a team plan? Get in touch.")}</p>
      </Section>
      <Section className="pt-6">
        <div className="mx-auto max-w-3xl divide-y divide-line rounded-2xl border border-line bg-surface">
          {QUESTIONS.map((f) => (
            <details key={f.q} className="group p-5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium">
                {t(f.q)}
                <span className="text-brand-400 transition group-open:rotate-45">+</span>
              </summary>
              <p className="mt-3 text-muted">{t(f.a)}</p>
            </details>
          ))}
        </div>
      </Section>
    </>
  );
}
