import { useParams } from "react-router-dom";

import { useT } from "../i18n";
import { AUDIENCES, GUIDES, STEPS } from "./content";
import { HeroLinkBox } from "./HeroLinkBox";
import { Link } from "./links";
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
              <Link to={`/solutions/${a.slug}`} className="inline-block text-sm font-medium text-brand-400 hover:underline">
                {t("Learn more")} →
              </Link>
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
        <PrimaryButton to="/signup">{t("Start for free")}</PrimaryButton>
      </Section>
    </>
  );
}

export function SolutionPage() {
  const t = useT();
  const { slug } = useParams();
  const a = AUDIENCES.find((x) => x.slug === slug);
  if (!a) {
    return (
      <Section className="text-center">
        <p className="text-muted">{t("This page doesn't exist.")}</p>
        <Link to="/solutions" className="mt-4 inline-block text-brand-400 hover:underline">
          {t("Solutions")}
        </Link>
      </Section>
    );
  }
  const guide = GUIDES.find((g) => g.slug === a.guide);
  return (
    <>
      <div className="relative mx-auto max-w-3xl px-4 pt-20 pb-6 text-center">
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 -z-10 mx-auto h-64 max-w-lg rounded-full bg-brand-500/15 blur-3xl" />
        <div className="flex justify-center">
          <IconBadge name={a.icon} />
        </div>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl">{t("Twapza for {name}", { name: t(a.title) })}</h1>
        <p className="mt-4 text-lg text-muted">{t(a.text)}</p>
        <div className="mt-8 text-start [&>div]:mx-auto">
          <HeroLinkBox />
        </div>
      </div>

      <Section className="py-12">
        <ul className="mx-auto grid max-w-4xl gap-4 md:grid-cols-3">
          {a.points.map((p) => (
            <li key={p} className="flex gap-2.5 rounded-2xl border border-line bg-surface p-5">
              <Icon name="check" className="mt-0.5 h-5 w-5 shrink-0 text-brand-400" />
              <span className="text-ink-soft">{t(p)}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section className="py-12">
        <h2 className="mb-8 text-center text-3xl font-semibold tracking-tight">{t("How it works")}</h2>
        <ol className="grid gap-5 md:grid-cols-4">
          {STEPS.map((s, i) => (
            <li key={s.title} className="relative rounded-2xl border border-line bg-surface p-5">
              <span className="absolute end-5 top-5 text-sm font-semibold text-faint">0{i + 1}</span>
              <IconBadge name={s.icon} />
              <h3 className="mt-4 font-semibold">{t(s.title)}</h3>
              <p className="mt-1.5 text-sm text-muted">{t(s.text)}</p>
            </li>
          ))}
        </ol>
        {guide && (
          <Link
            to={`/resources/${guide.slug}`}
            className="mx-auto mt-10 block max-w-2xl rounded-2xl border border-line bg-surface p-6 transition hover:border-brand-500/60"
          >
            <p className="text-xs font-medium uppercase tracking-wider text-brand-400">{t("Guide · {n} min read", { n: guide.minutes })}</p>
            <p className="mt-2 text-lg font-semibold">{t(guide.title)}</p>
            <p className="mt-1 text-muted">{t(guide.summary)}</p>
          </Link>
        )}
      </Section>
    </>
  );
}
