import { useT } from "../i18n";
import { AUDIENCES } from "./content";
import { Icon, IconBadge, PageHero, PrimaryButton, Section } from "./ui";

export function SolutionsPage() {
  const t = useT();
  return (
    <>
      <PageHero
        title={t("Shorts for every kind of creator")}
        text={t("Whatever you make, Twapza turns your long videos into Shorts that bring new viewers back to you.")}
      />
      <Section className="space-y-6 py-12">
        {AUDIENCES.map((a, i) => (
          <article
            key={a.title}
            id={a.icon}
            className={`grid scroll-mt-24 items-center gap-6 rounded-3xl border border-line bg-surface p-6 sm:p-8 md:grid-cols-2 ${i % 2 ? "md:[&>*:first-child]:order-2" : ""}`}
          >
            <div className="space-y-3">
              <IconBadge name={a.icon} />
              <h2 className="text-2xl font-semibold tracking-tight">{t(a.title)}</h2>
              <p className="text-muted">{t(a.text)}</p>
            </div>
            <ul className="space-y-3 rounded-2xl bg-surface-2 p-5">
              {a.points.map((p) => (
                <li key={p} className="flex gap-2.5">
                  <Icon name="check" className="mt-0.5 h-5 w-5 shrink-0 text-brand-400" />
                  <span className="text-ink-soft">{t(p)}</span>
                </li>
              ))}
            </ul>
          </article>
        ))}
      </Section>
      <Section className="text-center">
        <PrimaryButton to="/app">{t("Start for free")}</PrimaryButton>
      </Section>
    </>
  );
}
