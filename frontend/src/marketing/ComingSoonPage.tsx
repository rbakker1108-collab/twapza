import { msg, useT } from "../i18n";
import { CONTACT_EMAIL } from "./legal/types";
import { IconBadge, PageHero, Section } from "./ui";

type Status = "building" | "planned";

/** Features that are being worked on. Move an item out of here once it ships. */
const UPCOMING: { icon: string; title: string; text: string; status: Status }[] = [
  {
    icon: "video",
    title: msg("AI reframe"),
    text: msg("The vertical crop follows whoever is speaking, so faces stay in the frame without black bars."),
    status: "building",
  },
  {
    icon: "spark",
    title: msg("Your logo and stickers"),
    text: msg("Put your own logo, images and emoji stickers on every clip."),
    status: "building",
  },
  {
    icon: "captions",
    title: msg("Keyword captions"),
    text: msg("Important words light up in a different colour, so the message lands even faster."),
    status: "planned",
  },
  {
    icon: "mic",
    title: msg("Background music"),
    text: msg("Add your own music; it gets quieter automatically whenever someone speaks."),
    status: "planned",
  },
  {
    icon: "chart",
    title: msg("Square and 4:5 formats"),
    text: msg("Clips for Instagram feed and LinkedIn, next to the vertical 9:16 format."),
    status: "planned",
  },
  {
    icon: "globe",
    title: msg("Captions in more scripts"),
    text: msg("Captions for Chinese, Japanese, Korean, Russian and more, with fonts made for them."),
    status: "planned",
  },
  {
    icon: "lock",
    title: msg("Log in with Google"),
    text: msg("Sign in with one click, without a separate password."),
    status: "planned",
  },
];

export function ComingSoonPage() {
  const t = useT();
  const mail = (subject: string) => `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}`;
  return (
    <>
      <PageHero
        title={t("Coming soon to Twapza")}
        text={t("We're building Twapza together with creators. Here's what we're working on now and what's next.")}
      />
      <Section className="py-12">
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {UPCOMING.map((f) => (
            <article key={f.title} className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-6">
              <div className="flex items-start justify-between gap-3">
                <IconBadge name={f.icon} />
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                    f.status === "building" ? "bg-brand-500/15 text-brand-300" : "bg-surface-3 text-muted"
                  }`}
                >
                  {f.status === "building" ? t("In development") : t("Planned")}
                </span>
              </div>
              <h2 className="text-lg font-semibold">{t(f.title)}</h2>
              <p className="text-muted">{t(f.text)}</p>
            </article>
          ))}
        </div>
      </Section>
      <Section id="contact" className="pb-20">
        <div className="mx-auto max-w-2xl rounded-3xl border border-brand-500/30 bg-gradient-to-br from-brand-500/15 via-surface to-surface p-8 text-center sm:p-10">
          <h2 className="text-2xl font-semibold tracking-tight">{t("Ideas, tips or something not working?")}</h2>
          <p className="mt-3 text-muted">
            {t("We read every message. Tell us what you'd like to see in Twapza, or let us know when something doesn't work as it should.")}
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <a
              href={mail("Idea for Twapza")}
              className="rounded-xl bg-brand-500 px-5 py-3 font-semibold text-black transition hover:bg-brand-400"
            >
              {t("Send an idea")}
            </a>
            <a
              href={mail("Problem with Twapza")}
              className="rounded-xl border border-line-strong px-5 py-3 font-medium transition hover:bg-surface-2"
            >
              {t("Report a problem")}
            </a>
          </div>
          <p className="mt-4 text-sm text-faint">
            <a href={`mailto:${CONTACT_EMAIL}`} className="hover:text-ink">{CONTACT_EMAIL}</a>
          </p>
        </div>
      </Section>
    </>
  );
}
