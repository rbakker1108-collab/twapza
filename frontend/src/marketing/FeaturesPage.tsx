import { msg, useT } from "../i18n";
import { Heading, IconBadge, PageHero, PrimaryButton, Section } from "./ui";

const GROUPS = [
  {
    title: msg("Find the moments"),
    items: [
      { icon: "spark", title: msg("AI highlights with a virality score"), text: msg("Claude reads the full transcript and picks standalone moments with a strong hook and a payoff, refined with audio energy and scene changes.") },
      { icon: "zap", title: msg("Look for anything"), text: msg("Tell the AI what you want, like “funny moments” or “money tips”, and it only picks matching moments.") },
      { icon: "play", title: msg("Short and loopable"), text: msg("Ask for 20 to 45 second moments that end on a line leading back to the start.") },
      { icon: "scissors", title: msg("Simple clips"), text: msg("Split a whole video into clips of the same length, cut on natural pauses.") },
    ],
  },
  {
    title: msg("Make them yours"),
    items: [
      { icon: "edit", title: msg("Clip editor"), text: msg("See the clip with its captions, hook and texts exactly as it will download, and change anything before you render.") },
      { icon: "text", title: msg("Your own texts"), text: msg("Drag texts onto the video, choose font, size, colour and style, and set when they appear.") },
      { icon: "captions", title: msg("Animated captions"), text: msg("Word-by-word highlight, four fonts, your colours and position. Fix any wrong word in one click.") },
      { icon: "hook", title: msg("Hook text"), text: msg("A bold title at the top for the first seconds or the whole clip, written by you or suggested by AI.") },
    ],
  },
  {
    title: msg("Keep viewers watching"),
    items: [
      { icon: "play", title: msg("Cold open"), text: msg("Start with the clip's most gripping line as a short teaser, then play the clip.") },
      { icon: "scissors", title: msg("Cut pauses"), text: msg("Remove silences between words for snappy jump cuts.") },
      { icon: "mic", title: msg("Remove filler words"), text: msg("Cut out “um”, “uh” and the hesitation around them.") },
      { icon: "chart", title: msg("Progress bar"), text: msg("A thin bar along the top that fills up as the clip plays.") },
    ],
  },
  {
    title: msg("Publish with confidence"),
    items: [
      { icon: "video", title: msg("Vertical 1080×1920"), text: msg("Whole frame on a blurred background, black bars or a centre crop, or keep the original shape.") },
      { icon: "text", title: msg("Titles, descriptions and hashtags"), text: msg("AI copy written for the Shorts feed, with the credit to the original creator added automatically.") },
      { icon: "download", title: msg("Subtitle files and ZIP"), text: msg("Download an .srt file for YouTube or TikTok, or all clips of a video at once.") },
      { icon: "lock", title: msg("Private by default"), text: msg("Your original is never changed and everything is deleted after 24 hours.") },
    ],
  },
];

export function FeaturesPage() {
  const t = useT();
  return (
    <>
      <PageHero
        title={t("Everything you need to go from long video to viral Short")}
        text={t("Twapza does the heavy lifting with AI, and gives you an editor for the finishing touches.")}
      />
      {GROUPS.map((g) => (
        <Section key={g.title} className="py-12">
          <Heading title={t(g.title)} center={false} />
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {g.items.map((f) => (
              <div key={f.title} className="rounded-2xl border border-line bg-surface p-5">
                <IconBadge name={f.icon} />
                <h3 className="mt-4 font-semibold">{t(f.title)}</h3>
                <p className="mt-1.5 text-sm text-muted">{t(f.text)}</p>
              </div>
            ))}
          </div>
        </Section>
      ))}
      <Section className="text-center">
        <PrimaryButton to="/app">{t("Start for free")}</PrimaryButton>
      </Section>
    </>
  );
}
