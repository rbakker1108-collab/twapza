import { Link } from "react-router-dom";

import { useT } from "../i18n";

/** "Needs the Creator plan · Upgrade": shown next to features the current plan doesn't include. */
export function UpgradeNote({ plan, className = "" }: { plan: "creator" | "pro"; className?: string }) {
  const t = useT();
  return (
    <p className={`text-xs text-muted ${className}`}>
      <span className="me-1 rounded bg-brand-500/15 px-1.5 py-0.5 font-semibold text-brand-300">
        {plan === "pro" ? t("Pro") : t("Creator")}
      </span>
      {plan === "pro" ? t("Needs the Pro plan.") : t("Needs the Creator plan.")}{" "}
      <Link to="/account#plans" className="font-medium text-brand-400 underline-offset-2 hover:underline">
        {t("Upgrade")}
      </Link>
    </p>
  );
}
