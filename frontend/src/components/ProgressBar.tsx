import { useT } from "../i18n";
import { serverText } from "../i18n/server";

interface Props {
  value: number; // 0-100
  label?: string | null;
  tone?: "default" | "error";
}

export function ProgressBar({ value, label, tone = "default" }: Props) {
  const t = useT();
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div>
      <div className="mb-1 flex justify-between text-sm text-muted">
        <span>{label ? serverText(t, label) : null}</span>
        <span>{Math.round(pct)}%</span>
      </div>
      <div
        className="h-2 overflow-hidden rounded-full bg-surface-3"
        role="progressbar"
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className={`h-full rounded-full transition-[width] duration-300 ${
            tone === "error" ? "bg-red-500" : "bg-brand-500"
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
