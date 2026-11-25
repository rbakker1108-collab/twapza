import { useParams } from "react-router-dom";

import { useT } from "../i18n";
import { FAQ, STEPS, TOOLS } from "./content";
import { HeroLinkBox } from "./HeroLinkBox";
import { Link } from "./links";
import { IconBadge, PageHero, Section } from "./ui";

export function ToolsIndexPage() {
  const t = useT();
  return (
    <>
      <PageHero
        title={t("Tools for making Shorts")}
        text={t("Everything Twapza does, one job at a time: pick what you want to make.")}
      />
      <Section className="py-12">
        <div className="grid gap-5 md:grid-cols-3">
          {TOOLS.map((tool) => (
            <Link
              key={tool.slug}
              to={`/tools/${tool.slug}`}
              className="group flex flex-col rounded-2xl border border-line bg-surface p-6 transition hover:border-brand-500/60"
            >
              <h2 className="text-xl font-semibold group-hover:text-brand-300">{t(tool.name)}</h2>
              <p className="mt-2 flex-1 text-muted">{t(tool.intro)}</p>
              <span className="mt-4 text-sm font-medium text-brand-400">{t("Learn more")} →</span>
            </Link>
          ))}
        </div>
      </Section>
    </>
  );
}

export function ToolPage() {
  const t = useT();
  const { slug } = useParams();
  const tool = TOOLS.find((x) => x.slug === slug);
  if (!tool) {
    return (
      <Section className="text-center">
        <p className="text-muted">{t("This page doesn't exist.")}</p>
        <Link to="/tools" className="mt-4 inline-block text-brand-400 hover:underline">
          {t("All tools")}
        </Link>
      </Section>
    );
  }
  return (
    <>
      <div className="relative mx-auto max-w-3xl px-4 pt-20 pb-6 text-center">
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 -z-10 mx-auto h-64 max-w-lg rounded-full bg-brand-500/15 blur-3xl" />
        <p className="text-sm font-semibold uppercase tracking-wider text-brand-400">{t(tool.name)}</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">{t(tool.heading)}</h1>
        <p className="mt-4 text-lg text-muted">{t(tool.intro)}</p>
        <div className="mt-8 text-start [&>div]:mx-auto">
          <HeroLinkBox />
        </div>
      </div>

      <Section className="py-12">
        <div className="grid gap-5 md:grid-cols-3">
          {tool.points.map((p) => (
            <div key={p.title} className="rounded-2xl border border-line bg-surface p-6">
              <h2 className="text-lg font-semibold">{t(p.title)}</h2>
              <p className="mt-2 text-muted">{t(p.text)}</p>
            </div>
          ))}
        </div>
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
      </Section>

      <Section className="py-12">
        <div className="mx-auto max-w-3xl divide-y divide-line rounded-2xl border border-line bg-surface">
          {FAQ.map((f) => (
            <details key={f.q} className="group p-5">
              <summary className="cursor-pointer list-none font-medium">{t(f.q)}</summary>
              <p className="mt-2 text-muted">{t(f.a)}</p>
            </details>
          ))}
        </div>
        <div className="mt-10 text-center">
          <p className="mb-3 text-sm font-medium text-ink">{t("More tools")}</p>
          <div className="flex flex-wrap justify-center gap-x-6 gap-y-2">
            {TOOLS.filter((x) => x.slug !== tool.slug).map((x) => (
              <Link key={x.slug} to={`/tools/${x.slug}`} className="text-brand-400 hover:underline">
                {t(x.name)}
              </Link>
            ))}
          </div>
        </div>
      </Section>
    </>
  );
}
