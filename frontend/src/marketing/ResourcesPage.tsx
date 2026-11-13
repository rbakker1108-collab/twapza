import { Link, useParams } from "react-router-dom";

import { useT } from "../i18n";
import { GUIDES } from "./content";
import { PageHero, PrimaryButton, Section } from "./ui";

export function ResourcesPage() {
  const t = useT();
  return (
    <>
      <PageHero title={t("Guides for better Shorts")} text={t("Short, practical guides on hooks, length and captions, based on what works on Shorts today.")} />
      <Section className="py-12">
        <div className="grid gap-5 md:grid-cols-3">
          {GUIDES.map((g) => (
            <Link key={g.slug} to={`/resources/${g.slug}`} className="group flex flex-col rounded-2xl border border-line bg-surface p-6 transition hover:border-brand-500/60">
              <p className="text-xs font-medium uppercase tracking-wider text-brand-400">{t("Guide · {n} min read", { n: g.minutes })}</p>
              <h2 className="mt-3 text-xl font-semibold group-hover:text-brand-300">{t(g.title)}</h2>
              <p className="mt-2 flex-1 text-muted">{t(g.summary)}</p>
              <span className="mt-4 text-sm font-medium text-brand-400">{t("Read the guide")} →</span>
            </Link>
          ))}
        </div>
      </Section>
    </>
  );
}

export function GuidePage() {
  const t = useT();
  const { slug } = useParams();
  const guide = GUIDES.find((g) => g.slug === slug);
  if (!guide) {
    return (
      <Section className="text-center">
        <p className="text-muted">{t("This guide doesn't exist.")}</p>
        <Link to="/resources" className="mt-4 inline-block text-brand-400 hover:underline">
          {t("All guides")}
        </Link>
      </Section>
    );
  }
  return (
    <article className="mx-auto max-w-2xl px-4 py-16">
      <Link to="/resources" className="text-sm text-muted hover:text-ink">
        ← {t("All guides")}
      </Link>
      <p className="mt-8 text-xs font-medium uppercase tracking-wider text-brand-400">{t("Guide · {n} min read", { n: guide.minutes })}</p>
      <h1 className="mt-3 text-4xl font-semibold tracking-tight">{t(guide.title)}</h1>
      <p className="mt-4 text-xl text-muted">{t(guide.summary)}</p>
      <div className="mt-10 space-y-5 text-lg leading-relaxed text-ink-soft">
        {guide.body.map((p) => (
          <p key={p}>{t(p)}</p>
        ))}
      </div>
      <div className="mt-12 rounded-2xl border border-line bg-surface p-6 text-center">
        <p className="mb-4 font-medium">{t("Put it into practice with your own videos.")}</p>
        <PrimaryButton to="/app">{t("Start for free")}</PrimaryButton>
      </div>
    </article>
  );
}
