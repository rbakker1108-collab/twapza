/** Progress messages the backend sends (in English), so the progress bars can show them translated. */
import { msg, type Vars } from ".";

// Fixed messages: listed so the translation test checks every language has them.
export const SERVER_MESSAGES = [
  msg("Building preview"), msg("Creating ZIP"), msg("Creating thumbnails"), msg("Detecting scene changes"),
  msg("Done"), msg("Downloading from YouTube"), msg("Extracting audio"), msg("Finding cut points"),
  msg("Inspecting video"), msg("Loading transcript"), msg("Looking up the video"), msg("Measuring audio energy"),
  msg("Ranking moments"), msg("Rendering clip"), msg("Transcribing (only needed once)"), msg("Transcribing"),
  msg("Canceled"),
];

const PATTERNS: [RegExp, string, (m: RegExpMatchArray) => Vars][] = [
  [/^Claude is reviewing (\d+) part\(s\) of the video$/, msg("Claude is reviewing {n} part(s) of the video"), (m) => ({ n: m[1] })],
  [/^Rendering clip (\d+) of (\d+)$/, msg("Rendering clip {n} of {total}"), (m) => ({ n: m[1], total: m[2] })],
];

export function serverText(t: (text: string, vars?: Vars) => string, text: string): string {
  for (const [re, key, vars] of PATTERNS) {
    const m = text.match(re);
    if (m) return t(key, vars(m));
  }
  return t(text);
}
