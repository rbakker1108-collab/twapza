/**
 * Search-engine details for the website pages: title, description, canonical URL, language
 * alternates (hreflang), share preview (Open Graph) and structured data (JSON-LD). Used by the
 * pre-render step (scripts/prerender.mjs writes them into every page's HTML) and in the browser
 * (useDocumentHead updates title/description/canonical when navigating).
 */
import { isRtl, LANGUAGES, msg, translate, type Lang } from "../i18n";
import { COMPARISONS, FAQ, GUIDES } from "./content";
import { CONTACT_EMAIL } from "./legal/types";
import { localize, sitePaths } from "./locale";
import { PLANS } from "./plans";

export const SITE_URL = "https://www.twapza.io";
export const OG_IMAGE = `${SITE_URL}/og-image.png`;

interface Meta {
  title: string;
  description: string;
}

const COMPARE_TITLE = msg("{name} alternative: Twapza vs {name} compared");

const HOME_TITLE = msg("Twapza: turn long videos into viral Shorts with AI");

const PAGES: Record<string, Meta> = {
  "/": {
    title: HOME_TITLE,
    description: msg("Paste a YouTube link or upload a video. Twapza finds the best moments, adds animated captions and hooks, and gives you clips ready for Shorts, TikTok and Reels."),
  },
  "/how-it-works": {
    title: msg("How Twapza works, step by step"),
    description: msg("From long video to finished Short: add a video, let AI find the best moments, adjust your clip, style the captions and download it with a title and description."),
  },
  "/features": {
    title: msg("AI clipping features: highlights, captions and hooks"),
    description: msg("AI highlights with a virality score, animated captions in any language, hook text, cold opens, pause and filler-word removal, and a drag-and-drop clip editor."),
  },
  "/solutions": {
    title: msg("Twapza for podcasters, YouTubers, educators and streamers"),
    description: msg("How podcasters, YouTubers, coaches, streamers and clippers turn their long videos into Shorts, TikToks and Reels with Twapza."),
  },
  "/pricing": {
    title: msg("Pricing: start free, upgrade when you post more"),
    description: msg("Start free with 60 minutes of video per month. Creator and Pro add more minutes, longer videos, no watermark and the clip editor."),
  },
  "/resources": {
    title: msg("Guides for better Shorts"),
    description: msg("Short, practical guides on hooks, the best length for Shorts, captions and more, so your clips get watched."),
  },
  "/compare": {
    title: msg("Compare Twapza"),
    description: msg("How Twapza compares with other AI clipping tools: what each one does best and who it suits."),
  },
  "/coming-soon": {
    title: msg("Coming soon to Twapza"),
    description: msg("The features we are working on next, and how to reach us with ideas or questions."),
  },
  "/privacy": {
    title: msg("Privacy policy"),
    description: msg("How Twapza handles your account, your videos and your data. Videos are deleted automatically after 24 hours."),
  },
  "/terms": {
    title: msg("Terms of service"),
    description: msg("The terms for using Twapza, its free plan and its paid subscriptions."),
  },
};

/** Title and description of a website page (path without language prefix), or null. */
export function pageMeta(path: string, lang: Lang): Meta | null {
  const tr = (text: string) => translate(lang, text);
  const guide = /^\/resources\/([^/]+)$/.exec(path);
  if (guide) {
    const g = GUIDES.find((x) => x.slug === guide[1]);
    return g ? { title: `${tr(g.title)} | Twapza`, description: tr(g.summary) } : null;
  }
  const compare = /^\/compare\/([^/]+)$/.exec(path);
  if (compare) {
    const c = COMPARISONS.find((x) => x.slug === compare[1]);
    if (!c) return null;
    return {
      title: `${translate(lang, COMPARE_TITLE, { name: c.name })} | Twapza`,
      description: translate(lang, "{name} and Twapza both turn long videos into Shorts with AI. Here is how they differ in pricing, languages and features, and who each one suits.", { name: c.name }),
    };
  }
  const page = PAGES[path];
  if (!page) return null;
  return { title: path === "/" ? tr(page.title) : `${tr(page.title)} | Twapza`, description: tr(page.description) };
}

export const defaultMeta = (lang: Lang): Meta => pageMeta("/", lang)!;

export const absoluteUrl = (path: string, lang: Lang) => SITE_URL + localize(path, lang);

const LOCALES: Record<Lang, string> = { en: "en_US", nl: "nl_NL", es: "es_ES", de: "de_DE", fr: "fr_FR", ar: "ar_AR" };

const escape = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Structured data (schema.org) for a page. */
export function structuredData(path: string, lang: Lang): object[] {
  const tr = (text: string) => translate(lang, text);
  const url = absoluteUrl(path, lang);
  const org = { "@type": "Organization", name: "Twapza", url: SITE_URL, logo: `${SITE_URL}/logo.png`, email: CONTACT_EMAIL };
  const app = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "Twapza",
    url: absoluteUrl("/", lang),
    applicationCategory: "MultimediaApplication",
    operatingSystem: "Web",
    description: tr(PAGES["/"].description),
    inLanguage: lang,
    offers: PLANS.map((p) => ({
      "@type": "Offer",
      name: tr(p.name),
      description: tr(p.blurb),
      price: String(p.monthly),
      priceCurrency: "USD",
      url: absoluteUrl("/pricing", lang),
    })),
    publisher: org,
  };
  if (path === "/") {
    return [
      { "@context": "https://schema.org", "@type": "WebSite", name: "Twapza", url: absoluteUrl("/", lang), inLanguage: lang },
      { "@context": "https://schema.org", ...org },
      app,
      {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        inLanguage: lang,
        mainEntity: FAQ.map((f) => ({
          "@type": "Question",
          name: tr(f.q),
          acceptedAnswer: { "@type": "Answer", text: tr(f.a) },
        })),
      },
    ];
  }
  if (path === "/pricing") return [app];
  const guide = /^\/resources\/([^/]+)$/.exec(path);
  const g = guide && GUIDES.find((x) => x.slug === guide[1]);
  if (g) {
    return [
      {
        "@context": "https://schema.org",
        "@type": "Article",
        headline: tr(g.title),
        description: tr(g.summary),
        inLanguage: lang,
        url,
        mainEntityOfPage: url,
        image: OG_IMAGE,
        author: org,
        publisher: org,
      },
      {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Twapza", item: absoluteUrl("/", lang) },
          { "@type": "ListItem", position: 2, name: tr("Resources"), item: absoluteUrl("/resources", lang) },
          { "@type": "ListItem", position: 3, name: tr(g.title), item: url },
        ],
      },
    ];
  }
  const compare = /^\/compare\/([^/]+)$/.exec(path);
  const c = compare && COMPARISONS.find((x) => x.slug === compare[1]);
  if (c) {
    return [
      {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Twapza", item: absoluteUrl("/", lang) },
          { "@type": "ListItem", position: 2, name: tr("Compare Twapza"), item: absoluteUrl("/compare", lang) },
          { "@type": "ListItem", position: 3, name: translate(lang, "Twapza vs {name}", { name: c.name }), item: url },
        ],
      },
    ];
  }
  return [];
}

/** The <head> tags for a pre-rendered page (replaces the <!--seo--> block in index.html). */
export function headHtml(path: string, lang: Lang): string {
  const meta = pageMeta(path, lang) ?? defaultMeta(lang);
  const url = absoluteUrl(path, lang);
  const lines = [
    `<title>${escape(meta.title)}</title>`,
    `<meta name="description" content="${escape(meta.description)}" />`,
    `<link rel="canonical" href="${url}" />`,
    ...LANGUAGES.map((l) => `<link rel="alternate" hreflang="${l.code}" href="${absoluteUrl(path, l.code)}" />`),
    `<link rel="alternate" hreflang="x-default" href="${absoluteUrl(path, "en")}" />`,
    `<meta property="og:type" content="${path.startsWith("/resources/") ? "article" : "website"}" />`,
    `<meta property="og:site_name" content="Twapza" />`,
    `<meta property="og:title" content="${escape(meta.title)}" />`,
    `<meta property="og:description" content="${escape(meta.description)}" />`,
    `<meta property="og:url" content="${url}" />`,
    `<meta property="og:image" content="${OG_IMAGE}" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta property="og:locale" content="${LOCALES[lang]}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    ...structuredData(path, lang).map(
      // "<" is escaped so no text can close the script tag early.
      (data) => `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, "\\u003c")}</script>`,
    ),
  ];
  return lines.join("\n    ");
}

/** The <html> attributes for a page in a language. */
export const htmlAttrs = (lang: Lang) => `lang="${lang}" dir="${isRtl(lang) ? "rtl" : "ltr"}"`;

/** sitemap.xml with every website page in every language (each listing its alternates). */
export function sitemapXml(): string {
  const entries = sitePaths().flatMap((path) =>
    LANGUAGES.map((l) => {
      const alternates = [
        ...LANGUAGES.map((a) => `    <xhtml:link rel="alternate" hreflang="${a.code}" href="${absoluteUrl(path, a.code)}"/>`),
        `    <xhtml:link rel="alternate" hreflang="x-default" href="${absoluteUrl(path, "en")}"/>`,
      ];
      return `  <url>\n    <loc>${absoluteUrl(path, l.code)}</loc>\n${alternates.join("\n")}\n  </url>`;
    }),
  );
  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">`,
    ...entries,
    `</urlset>`,
    "",
  ].join("\n");
}
