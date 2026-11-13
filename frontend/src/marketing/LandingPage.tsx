import { Link } from "react-router-dom";

import { useI18n } from "../i18n";
import { AUDIENCES, FAQ, FEATURES, STEPS } from "./content";
import { PricingCards } from "./PricingCards";
import { ProductMock } from "./ProductMock";
import { Heading, IconBadge, PrimaryButton, SecondaryButton, Section } from "./ui";
import { WaitlistForm } from "./WaitlistForm";

export function LandingPage() {
  const { t } = useI18n();
  return (
    <>
      {/* Hero */}
      <div className="relative overflow-hidden">
        <div aria-hidden className="pointer-events-none absolute inset-x-0 -top-40 -z-10 mx-auto h-[28rem] max-w-3xl rounded-full bg-brand-500/15 blur-3xl" />
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 pt-16 pb-20 lg:grid-cols-2 lg:pt-24">
          <div className="text-center lg:text-start">
            <span className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-xs font-medium text-ink-soft">
              <span className="h-1.5 w-1.5 rounded-full bg-brand-500" />
              {t("AI clipping for creators")}
            </span>
            <h1 className="mt-5 text-4xl font-semibold tracking-tight sm:text-6xl">
              {t("Turn long videos into")} <span className="text-gradient-brand">{t("viral Shorts")}</span>
            </h1>
            <p className="mx-auto mt-5 max-w-xl text-lg text-muted lg:mx-0">
              {t("Paste a YouTube link or upload a video. Twapza finds the best moments, adds animated captions and hooks, and gives you clips ready for Shorts, TikTok and Reels.")}
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3 lg:justify-start">
              <PrimaryButton to="/app">{t("Start for free")}</PrimaryButton>
              <SecondaryButton to="/#how">{t("See how it works")}</SecondaryButton>
            </div>
            <p className="mt-4 text-sm text-faint">
              {t("No credit card needed · Captions in dozens of languages · Files deleted after 24 hours")}
            </p>
          </div>
          <ProductMock />
        </div>
      </div>

      {/* How it works */}
      <Section id="how">
        <Heading eyebrow={t("How it works")} title={t("From long video to Shorts in four steps")} />
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

      {/* Features */}
      <Section id="features">
        <Heading
          eyebrow={t("Features")}
          title={t("Everything a Short needs to perform")}
          text={t("Built around what makes Shorts work: a strong hook, fast pacing and captions people can follow without sound.")}
        />
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((f) => (
            <div key={f.title} className="rounded-2xl border border-line bg-surface p-5 transition hover:border-line-strong">
              <IconBadge name={f.icon} />
              <h3 className="mt-4 font-semibold">{t(f.title)}</h3>
              <p className="mt-1.5 text-sm text-muted">{t(f.text)}</p>
            </div>
          ))}
        </div>
        <div className="mt-8 text-center">
          <SecondaryButton to="/features">{t("Explore all features")}</SecondaryButton>
        </div>
      </Section>

      {/* Solutions */}
      <Section>
        <Heading eyebrow={t("Solutions")} title={t("Made for every kind of creator")} />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {AUDIENCES.map((a) => (
            <Link key={a.title} to={`/solutions#${a.icon}`} className="rounded-2xl border border-line bg-surface p-5 transition hover:border-brand-500/60">
              <IconBadge name={a.icon} />
              <h3 className="mt-4 font-semibold">{t(a.title)}</h3>
            </Link>
          ))}
        </div>
      </Section>

      {/* Pricing */}
      <Section id="pricing">
        <Heading eyebrow={t("Pricing")} title={t("Simple plans, cancel anytime")} text={t("Start for free. Upgrade when you post more.")} />
        <PricingCards yearly={false} />
      </Section>

      {/* FAQ */}
      <Section id="faq">
        <Heading title={t("Questions and answers")} />
        <div className="mx-auto max-w-3xl divide-y divide-line rounded-2xl border border-line bg-surface">
          {FAQ.map((f) => (
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

      {/* Waitlist */}
      <Section id="early-access">
        <div className="relative overflow-hidden rounded-3xl border border-brand-500/30 bg-gradient-to-br from-brand-500/20 via-surface to-surface p-8 sm:p-12">
          <div className="mx-auto max-w-xl text-center">
            <h2 className="text-3xl font-semibold tracking-tight">{t("Be the first to try Twapza")}</h2>
            <p className="mt-3 text-muted">{t("We're opening Twapza to creators step by step. Leave your email and get early access, with launch pricing.")}</p>
            <div className="mt-6 text-start">
              <WaitlistForm />
            </div>
          </div>
        </div>
      </Section>
    </>
  );
}
