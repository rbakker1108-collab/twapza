import { useEffect, useRef, useState } from "react";
import { Link } from "./links";

import { msg, useT } from "../i18n";
import { CONTACT_EMAIL } from "./legal/types";
import { Icon, PageHero, PrimaryButton, Section } from "./ui";

/**
 * Step-by-step guide with real screenshots and screen recordings of the app
 * (`public/how-it-works/`, made from a demo project; see CLAUDE.md "Website").
 */
const MEDIA = "/how-it-works";

type Media = { kind: "image"; src: string } | { kind: "video"; src: string; poster: string };

const STEPS: { id: string; title: string; text: string; tips: string[]; media: Media; alt: string }[] = [
  {
    id: "add",
    title: msg("Add your video"),
    text: msg("Paste the link to a YouTube video you posted, or upload an mp4, mov or mkv file. Tick the box to confirm the video is yours (or that you may use it)."),
    tips: [
      msg("Long videos are fine: podcasts, streams and webinars of up to 3 hours, depending on your plan."),
      msg("A big upload can be paused; choose the same file again to continue where it stopped."),
    ],
    media: { kind: "image", src: `${MEDIA}/upload.jpg` },
    alt: msg("The start screen with the upload form"),
  },
  {
    id: "prepare",
    title: msg("Twapza prepares it"),
    text: msg("Twapza builds a preview and writes subtitles for every word. For an hour-long video this takes a few minutes; you can leave the page and come back."),
    tips: [
      msg("The steps at the top always show where you are."),
      msg("Captions work in dozens of languages; the language is recognised automatically."),
    ],
    media: { kind: "image", src: `${MEDIA}/project-ready.jpg` },
    alt: msg("A project with its preview and the steps at the top"),
  },
  {
    id: "format",
    title: msg("Choose how your clips look"),
    text: msg("Pick the format once: vertical 9:16 for Shorts, TikTok and Reels (with a blurred background, black bars or a crop), and the style of your subtitles. Twapza remembers it for next time."),
    tips: [
      msg("Not sure? Keep the defaults: vertical, blurred background, bold subtitles."),
      msg("Optional boosts like hook text, cold open and cutting pauses can be switched on here or later in the editor."),
    ],
    media: { kind: "image", src: `${MEDIA}/format.jpg` },
    alt: msg("Download format and subtitle style options"),
  },
  {
    id: "find",
    title: msg("Find the best moments"),
    text: msg("Click “Find highlights” and the AI picks the strongest moments, best first, each with a score, a title and the line it opens with. Want something specific? Type it under “Look for”, like “funny moments” or “money tips”."),
    tips: [
      msg("“Short & loopable” looks for 20–45 second moments that replay smoothly."),
      msg("Prefer clips of equal length? Use the “Simple clips” tab instead."),
      msg("Click a clip to play it, or “Trim” to move its start and end."),
    ],
    media: { kind: "video", src: `${MEDIA}/find-highlights.mp4`, poster: `${MEDIA}/find-highlights-poster.jpg` },
    alt: msg("Finding highlights and scrolling through the results"),
  },
  {
    id: "edit",
    title: msg("Make it yours in the editor"),
    text: msg("Click “Edit & download” on a clip. The preview plays with the subtitles exactly as they'll look. Add a hook title, place your own texts by dragging them, and fix any word the subtitles got wrong."),
    tips: [
      msg("Hook & text: a bold title at the top, and texts like “Link in bio”."),
      msg("Fix captions: correct a name or a word; the fix applies to every clip of the video."),
      msg("Format & style: change the format or subtitle style for this download."),
    ],
    media: { kind: "video", src: `${MEDIA}/edit-clip.mp4`, poster: `${MEDIA}/edit-clip-poster.jpg` },
    alt: msg("The clip editor: hook text, dragging a text, the format tab"),
  },
  {
    id: "post",
    title: msg("Download and post"),
    text: msg("Click “Download” and you get a finished vertical video. Under “Description” you'll find a ready-to-paste description with hashtags and title ideas for YouTube, TikTok or Instagram."),
    tips: [
      msg("“Quick download” skips the editor and uses your current settings."),
      msg("Need a separate subtitle file? Download the .srt next to the clip."),
      msg("On Pro, “Download all (ZIP)” gets every clip at once."),
    ],
    media: { kind: "image", src: `${MEDIA}/description.jpg` },
    alt: msg("A clip with its description, hashtags and title ideas"),
  },
];

const GOOD_TO_KNOW: { q: string; a: string }[] = [
  {
    q: msg("How long do my videos stay in Twapza?"),
    a: msg("24 hours. After that the video and its clips are deleted automatically, so download the clips you want to keep."),
  },
  {
    q: msg("What uses my monthly minutes?"),
    a: msg("Only adding a video: its length counts once. Finding clips, editing and downloading are free. You can see what's left on your account page."),
  },
  {
    q: msg("Why are some options locked?"),
    a: msg("Some features are part of the Creator or Pro plan, like the editor extras and downloading all clips at once. Locked options show which plan they need."),
  },
  {
    q: msg("The subtitles have a mistake. What now?"),
    a: msg("Open the clip in the editor and use the “Fix captions” tab. Your fix is used in every clip of that video."),
  },
];

/** Plays only while on screen (and not at all for people who prefer reduced motion). */
function DemoVideo({ src, poster, label }: { src: string; poster: string; label: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  // Read after the first render, so the pre-rendered HTML and the browser's first render match.
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    setReduced(Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches));
  }, []);
  useEffect(() => {
    const video = ref.current;
    if (!video || reduced || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) video.play().catch(() => {});
      else video.pause();
    }, { threshold: 0.4 });
    observer.observe(video);
    return () => observer.disconnect();
  }, [reduced]);
  return (
    <video
      ref={ref}
      src={src}
      poster={poster}
      muted
      loop
      playsInline
      preload="metadata"
      controls={reduced}
      aria-label={label}
      className="w-full"
    />
  );
}

function Frame({ media, alt }: { media: Media; alt: string }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-2xl shadow-black/40">
      {media.kind === "image" ? (
        <img src={media.src} alt={alt} loading="lazy" className="w-full" />
      ) : (
        <DemoVideo src={media.src} poster={media.poster} label={alt} />
      )}
    </div>
  );
}

export function HowItWorksPage() {
  const t = useT();
  return (
    <>
      <PageHero
        title={t("How Twapza works")}
        text={t("From a long video to finished Shorts in a few minutes. Here's every step, with what you'll see on the screen.")}
      />

      {/* The result first: what you end up with */}
      <Section className="py-6">
        <div className="grid items-center gap-8 rounded-3xl border border-line bg-surface p-6 sm:p-8 md:grid-cols-[1fr_auto]">
          <div className="space-y-4">
            <p className="text-sm font-semibold uppercase tracking-wide text-brand-400">{t("What you get")}</p>
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">{t("A finished vertical clip, ready to post")}</h2>
            <p className="text-muted">
              {t("This clip was made with Twapza from a 3-minute podcast episode: the AI picked the moment, added a hook title, word-by-word subtitles and a progress bar.")}
            </p>
            <ol className="flex flex-wrap gap-2 pt-2 text-sm">
              {STEPS.map((s, i) => (
                <li key={s.id}>
                  <a href={`#${s.id}`} className="inline-flex items-center gap-2 rounded-full border border-line-strong px-3 py-1.5 hover:bg-surface-2">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-brand-500 text-xs font-bold text-black">{i + 1}</span>
                    {t(s.title)}
                  </a>
                </li>
              ))}
            </ol>
          </div>
          <div className="mx-auto w-48 overflow-hidden rounded-[1.75rem] border-4 border-surface-3 bg-black shadow-2xl shadow-brand-500/10 sm:w-56" dir="ltr">
            <DemoVideo src={`${MEDIA}/result-clip.mp4`} poster={`${MEDIA}/result-clip-poster.jpg`} label={t("Example clip made with Twapza")} />
          </div>
        </div>
      </Section>

      <Section className="space-y-20 py-16">
        {STEPS.map((s, i) => (
          <article
            key={s.id}
            id={s.id}
            className={`grid scroll-mt-24 items-center gap-8 lg:grid-cols-[2fr_3fr] ${i % 2 ? "lg:[&>*:first-child]:order-2" : ""}`}
          >
            <div className="space-y-4">
              <p className="flex items-center gap-3 text-sm font-semibold text-brand-400">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-500 text-black">{i + 1}</span>
                {t("Step {n} of {total}", { n: i + 1, total: STEPS.length })}
              </p>
              <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">{t(s.title)}</h2>
              <p className="text-muted">{t(s.text)}</p>
              <ul className="space-y-2 pt-1">
                {s.tips.map((tip) => (
                  <li key={tip} className="flex gap-2.5 text-sm">
                    <Icon name="check" className="mt-0.5 h-4 w-4 shrink-0 text-brand-400" />
                    <span className="text-ink-soft">{t(tip)}</span>
                  </li>
                ))}
              </ul>
            </div>
            <Frame media={s.media} alt={t(s.alt)} />
          </article>
        ))}
      </Section>

      <Section className="pb-12">
        <div className="mx-auto max-w-3xl">
          <h2 className="text-center text-2xl font-semibold tracking-tight">{t("Good to know")}</h2>
          <div className="mt-6 divide-y divide-line rounded-2xl border border-line bg-surface">
            {GOOD_TO_KNOW.map((f) => (
              <details key={f.q} className="group p-5">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium">
                  {t(f.q)}
                  <span className="text-brand-400 transition group-open:rotate-45">+</span>
                </summary>
                <p className="mt-3 text-muted">{t(f.a)}</p>
              </details>
            ))}
          </div>
          <p className="mt-6 text-center text-sm text-muted">
            {t("Still stuck? Email us at")}{" "}
            <a href={`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent("Help with Twapza")}`} className="text-brand-400 hover:underline">
              {CONTACT_EMAIL}
            </a>
          </p>
        </div>
      </Section>

      <Section className="pb-20 text-center">
        <h2 className="text-2xl font-semibold tracking-tight">{t("Try it with your own video")}</h2>
        <p className="mx-auto mt-2 max-w-xl text-muted">{t("The free plan includes 60 minutes of video per month. No credit card needed.")}</p>
        <div className="mt-6 flex justify-center gap-3">
          <PrimaryButton to="/signup">{t("Start for free")}</PrimaryButton>
          <Link to="/pricing" className="inline-flex items-center rounded-xl border border-line-strong px-5 py-3 font-medium hover:bg-surface-2">
            {t("See plans")}
          </Link>
        </div>
      </Section>
    </>
  );
}
