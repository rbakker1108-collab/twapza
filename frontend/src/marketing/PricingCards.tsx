import { Link } from "react-router-dom";

import { useI18n } from "../i18n";
import { PLANS, price } from "./plans";
import { Icon } from "./ui";

export function PricingCards({ yearly }: { yearly: boolean }) {
  const { t, lang } = useI18n();
  return (
    <div className="grid gap-5 md:grid-cols-3">
      {PLANS.map((plan) => {
        const amount = yearly ? plan.yearly : plan.monthly;
        return (
          <div
            key={plan.id}
            data-testid={`plan-${plan.id}`}
            className={`relative flex flex-col rounded-2xl border p-6 ${
              plan.popular ? "border-brand-500 bg-gradient-to-b from-brand-500/10 to-surface" : "border-line bg-surface"
            }`}
          >
            {plan.popular && (
              <span className="absolute -top-3 start-6 rounded-full bg-brand-500 px-3 py-0.5 text-xs font-semibold text-black">
                {t("Most popular")}
              </span>
            )}
            <h3 className="text-lg font-semibold">{t(plan.name)}</h3>
            <p className="mt-1 text-sm text-muted">{t(plan.blurb)}</p>
            <p className="mt-5 flex items-baseline gap-1">
              <span className="text-4xl font-semibold tracking-tight">{price(amount, lang)}</span>
              <span className="text-sm text-muted">{t("/ month")}</span>
            </p>
            <p className="h-5 text-xs text-faint">
              {amount > 0 && yearly ? t("billed yearly ({total})", { total: price(amount * 12, lang) }) : ""}
            </p>
            <ul className="mt-5 flex-1 space-y-2.5 text-sm">
              {plan.features.map((f) => (
                <li key={f} className="flex gap-2">
                  <Icon name="check" className="mt-0.5 h-4 w-4 shrink-0 text-brand-400" />
                  <span className="text-ink-soft">{t(f)}</span>
                </li>
              ))}
            </ul>
            <Link
              to="/app"
              className={`mt-6 rounded-xl px-4 py-2.5 text-center font-semibold transition ${
                plan.popular ? "bg-brand-500 text-black hover:bg-brand-400" : "border border-line-strong hover:bg-surface-2"
              }`}
            >
              {amount === 0 ? t("Start for free") : t("Get {plan}", { plan: t(plan.name) })}
            </Link>
          </div>
        );
      })}
    </div>
  );
}
