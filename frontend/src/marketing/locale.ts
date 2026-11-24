/**
 * Language URLs for the public website: English lives at the plain address (/features), the other
 * languages under a prefix (/nl/features, /ar). Only the pages in SITE_PATHS (and the guides) get a
 * prefix; the app (/app, /projects, /account) and the login pages keep one address and use the
 * language picked in the menu.
 */
import { LANGUAGES, type Lang } from "../i18n";
import { COMPARISONS, GUIDES } from "./content";

/** Languages that get a URL prefix (English is the plain address). */
export const PREFIXED_LANGS = LANGUAGES.map((l) => l.code).filter((c) => c !== "en") as Exclude<Lang, "en">[];

/** The website pages that exist in every language (and are pre-rendered for search engines). */
export const SITE_PATHS = [
  "/",
  "/how-it-works",
  "/features",
  "/solutions",
  "/pricing",
  "/resources",
  "/compare",
  "/coming-soon",
  "/privacy",
  "/terms",
] as const;

/** Every pre-rendered page path (without language prefix), guides included. */
export function sitePaths(): string[] {
  return [...SITE_PATHS, ...GUIDES.map((g) => `/resources/${g.slug}`), ...COMPARISONS.map((c) => `/compare/${c.slug}`)];
}

/** True for a path (without prefix) that exists in every language. */
export function isLocalizedPath(path: string): boolean {
  return (SITE_PATHS as readonly string[]).includes(path) || /^\/(resources|compare)\/[^/]+$/.test(path);
}

/** Splits "/nl/features" into { lang: "nl", path: "/features" } ("/features" -> English). */
export function splitLang(pathname: string): { lang: Lang; path: string } {
  const match = /^\/([a-z]{2})(\/.*)?$/.exec(pathname);
  if (match && (PREFIXED_LANGS as string[]).includes(match[1])) {
    const rest = match[2] && match[2] !== "/" ? match[2].replace(/\/$/, "") : "/";
    return { lang: match[1] as Lang, path: rest };
  }
  return { lang: "en", path: pathname.length > 1 ? pathname.replace(/\/$/, "") : "/" };
}

/** The URL of a website page in a language: localize("/pricing#faq", "nl") -> "/nl/pricing#faq".
 *  Paths that aren't website pages (/signup, /app, …) are returned unchanged. */
export function localize(to: string, lang: Lang): string {
  const cut = to.search(/[?#]/);
  const path = (cut === -1 ? to : to.slice(0, cut)) || "/";
  const rest = cut === -1 ? "" : to.slice(cut);
  if (lang === "en" || !isLocalizedPath(path)) return to;
  return `/${lang}${path === "/" ? "" : path}${rest}`;
}
