import { useParams } from "react-router-dom";

import { useI18n } from "../i18n";
import { CHOOSE_TWAPZA, COMPARISONS, COMPARISONS_CHECKED, TWAPZA_STRENGTHS } from "./content";
import { Link } from "./links";
import { PageHero, PrimaryButton, Section } from "./ui";

/** "November 2026" in the page's language (UTC, so the server and the browser agree). */
export function checkedMonth(lang: string) {
  return new Intl.DateTimeFormat(lang, { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(COMPARISONS_CHECKED));
}

export function CompareIndexPage() {
  const { t } = useI18n();
  return (
    <>
      <PageHero
        title={t("Compare Twapza")}
        text={t("How Twapza compares with other AI clipping tools: what each one does best and who it suits.")}
      />
      <Section className="py-12">
        <div className="grid gap-5 md:grid-cols-3">
          {COMPARISONS.map((c) => (
            <Link
              key={c.slug}
              to={`/compare/${c.slug}`}
              className="group flex flex-col rounded-2xl border border-line bg-surface p-6 transition hover:border-brand-500/60"
            >
              <p className="text-xs font-medium uppercase tracking-wider text-brand-400">{t("Comparison")}</p>
              <h2 className="mt-3 text-xl font-semibold group-hover:text-brand-300">{t("Twapza vs {name}", { name: c.name })}</h2>
              <p className="mt-2 flex-1 text-muted">
                {t("{name} and Twapza both turn long videos into Shorts with AI. Here is how they differ in pricing, languages and features, and who each one suits.", { name: c.name })}
              </p>
              <span className="mt-4 text-sm font-medium text-brand-400">{t("Read the comparison")} →</span>
            </Link>
          ))}
        </div>
      </Section>
    </>
  );
}

function Checklist({ items }: { items: string[] }) {
  const { t } = useI18n();
  return (
    <ul className="space-y-3">
      {items.map((item) => (
        <li key={item} className="flex gap-3">
          <span aria-hidden className="mt-0.5 text-brand-400">✓</span>
          <span className="text-ink-soft">{t(item)}</span>
        </li>
      ))}
    </ul>
  );
}

export function ComparisonPage() {
  const { t, lang } = useI18n();
  const { slug } = useParams();
  const c = COMPARISONS.find((x) => x.slug === slug);
  if (!c) {
    return (
      <Section className="text-center">
        <p className="text-muted">{t("This comparison doesn't exist.")}</p>
        <Link to="/compare" className="mt-4 inline-block text-brand-400 hover:underline">
          {t("All comparisons")}
        </Link>
      </Section>
    );
  }
  const name = c.name;
  return (
    <article className="mx-auto max-w-3xl px-4 py-16">
      <Link to="/compare" className="text-sm text-muted hover:text-ink">
        ← {t("All comparisons")}
      </Link>
      <p className="mt-8 text-xs font-medium uppercase tracking-wider text-brand-400">{t("Comparison")}</p>
      <h1 className="mt-3 text-4xl font-semibold tracking-tight">{t("Twapza vs {name}", { name })}</h1>
      <p className="mt-6 text-lg leading-relaxed text-ink-soft">{t(c.intro)}</p>

      <h2 className="mt-12 text-2xl font-semibold">{t("At a glance")}</h2>
      {/* Phones: one card per row, so both answers stay visible. */}
      <dl className="mt-4 space-y-3 sm:hidden">
        {c.rows.map((row) => (
          <div key={row.label} className="rounded-2xl border border-line bg-surface p-4 text-sm">
            <dt className="font-medium text-ink">{t(row.label)}</dt>
            <dd className="mt-2 text-ink-soft">
              <span className="font-semibold text-brand-300">Twapza:</span> {t(row.twapza)}
            </dd>
            <dd className="mt-1 text-ink-soft">
              <span className="font-semibold text-ink">{name}:</span> {t(row.them)}
            </dd>
          </div>
        ))}
      </dl>
      <div className="mt-4 hidden overflow-hidden rounded-2xl border border-line sm:block">
        <table className="w-full text-start text-sm">
          <thead className="bg-surface-2 text-ink">
            <tr>
              <th scope="col" className="w-1/4 px-4 py-3 text-start font-medium">
                <span className="sr-only">{t("Feature")}</span>
              </th>
              <th scope="col" className="px-4 py-3 text-start font-semibold text-brand-300">Twapza</th>
              <th scope="col" className="px-4 py-3 text-start font-semibold">{name}</th>
            </tr>
          </thead>
          <tbody>
            {c.rows.map((row) => (
              <tr key={row.label} className="border-t border-line align-top">
                <th scope="row" className="px-4 py-3 text-start font-medium text-ink">{t(row.label)}</th>
                <td className="px-4 py-3 text-ink-soft">{t(row.twapza)}</td>
                <td className="px-4 py-3 text-ink-soft">{t(row.them)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="mt-12 text-2xl font-semibold">{t("Where Twapza stands out")}</h2>
      <div className="mt-4">
        <Checklist items={TWAPZA_STRENGTHS} />
      </div>

      <div className="mt-12 grid gap-5 sm:grid-cols-2">
        <div className="rounded-2xl border border-line bg-surface p-6">
          <h2 className="mb-4 text-lg font-semibold">{t("Choose {name} if…", { name })}</h2>
          <Checklist items={c.chooseThem} />
        </div>
        <div className="rounded-2xl border border-brand-500/40 bg-surface p-6">
          <h2 className="mb-4 text-lg font-semibold">{t("Choose Twapza if…")}</h2>
          <Checklist items={CHOOSE_TWAPZA} />
        </div>
      </div>

      <p className="mt-10 text-sm text-faint">
        {t("We make Twapza, so we are not neutral, but we have tried to be fair. The details about {name} come from its own website and public reviews, checked in {date}. They may have changed since, so check {name}'s website for the latest features and prices.", { name, date: checkedMonth(lang) })}{" "}
        <a href={c.site} rel="noopener nofollow" target="_blank" className="text-muted underline-offset-2 hover:underline">
          {t("Visit {name}", { name })}
        </a>
      </p>

      <div className="mt-12 rounded-2xl border border-line bg-surface p-6 text-center">
        <p className="mb-4 font-medium">{t("Try Twapza on your own video. The free plan needs no credit card.")}</p>
        <PrimaryButton to="/signup">{t("Start for free")}</PrimaryButton>
      </div>
    </article>
  );
}
