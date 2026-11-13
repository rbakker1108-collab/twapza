import { useT } from "../i18n";

/** A drawn (not screenshot) preview of a finished Short, for the hero. Purely decorative. */
export function ProductMock() {
  const t = useT();
  return (
    <div className="relative mx-auto w-full max-w-md" dir="ltr" aria-hidden>
      <div className="absolute -inset-10 -z-10 rounded-full bg-brand-500/20 blur-3xl" />
      <div className="relative mx-auto aspect-[9/16] w-60 overflow-hidden rounded-[2rem] border-4 border-surface-3 bg-gradient-to-b from-zinc-700 via-zinc-800 to-zinc-950 shadow-2xl shadow-black/60 sm:w-64">
        <div className="absolute inset-x-0 top-0 h-1.5 bg-black/50">
          <div className="h-full w-2/5 bg-brand-500" />
        </div>
        <div className="absolute inset-x-6 top-14 text-center">
          <span className="box-decoration-clone rounded bg-black/80 px-2 py-1 text-sm font-extrabold leading-relaxed text-white">
            {t("He quit his job for THIS")}
          </span>
        </div>
        <div className="absolute inset-x-0 top-1/3 flex justify-center">
          <div className="h-28 w-28 rounded-full bg-gradient-to-br from-brand-300/70 to-brand-700/60 blur-[1px]" />
        </div>
        <div className="absolute inset-x-4 bottom-[22%] text-center text-lg font-black uppercase tracking-tight text-white [paint-order:stroke_fill] [-webkit-text-stroke:5px_#000]">
          {t("and that changed")} <span className="text-brand-400">{t("everything")}</span>
        </div>
      </div>
      <div className="absolute -start-2 top-10 rounded-2xl border border-line bg-surface/95 px-3 py-2 shadow-xl sm:-start-6">
        <p className="text-xs text-muted">{t("Virality score")}</p>
        <p className="text-2xl font-semibold text-emerald-300">92</p>
      </div>
      <div className="absolute -end-2 top-1/2 rounded-2xl border border-line bg-surface/95 px-3 py-2 shadow-xl sm:-end-6">
        <p className="text-xs text-muted">{t("Clips found")}</p>
        <p className="text-2xl font-semibold text-ink">14</p>
      </div>
      <div className="absolute -start-2 bottom-8 flex items-center gap-2 rounded-2xl border border-line bg-surface/95 px-3 py-2 text-sm shadow-xl sm:-start-8">
        <span className="h-2 w-2 rounded-full bg-brand-500" />
        {t("Captions in dozens of languages")}
      </div>
    </div>
  );
}
