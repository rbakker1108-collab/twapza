import { headHtml, htmlAttrs, LANGS, render, sitemapXml } from "../entry-server";
import { isLocalizedPath, localize, sitePaths, splitLang } from "./locale";
import { pageMeta, structuredData } from "./seo";

describe("language URLs", () => {
  it("prefixes website pages only", () => {
    expect(localize("/", "nl")).toBe("/nl");
    expect(localize("/pricing#faq", "de")).toBe("/de/pricing#faq");
    expect(localize("/resources/hooks", "ar")).toBe("/ar/resources/hooks");
    expect(localize("/signup?plan=pro", "nl")).toBe("/signup?plan=pro");
    expect(localize("/app", "fr")).toBe("/app");
    expect(localize("/pricing", "en")).toBe("/pricing");
  });

  it("reads the language from the URL", () => {
    expect(splitLang("/nl")).toEqual({ lang: "nl", path: "/" });
    expect(splitLang("/nl/")).toEqual({ lang: "nl", path: "/" });
    expect(splitLang("/es/resources/hooks")).toEqual({ lang: "es", path: "/resources/hooks" });
    expect(splitLang("/features/")).toEqual({ lang: "en", path: "/features" });
    expect(splitLang("/")).toEqual({ lang: "en", path: "/" });
    expect(splitLang("/xx/features")).toEqual({ lang: "en", path: "/xx/features" });
    expect(isLocalizedPath("/login")).toBe(false);
  });
});

describe("search engine details", () => {
  it("has a title and description for every page in every language", () => {
    for (const path of sitePaths()) {
      for (const lang of LANGS) {
        const meta = pageMeta(path, lang);
        expect(meta?.title, `${lang} ${path}`).toBeTruthy();
        expect(meta!.description.length, `${lang} ${path}`).toBeGreaterThan(50);
      }
    }
    expect(pageMeta("/nl-only", "nl")).toBeNull();
  });

  it("writes canonical, language alternates and structured data", () => {
    const head = headHtml("/pricing", "nl");
    expect(head).toContain('<link rel="canonical" href="https://www.twapza.io/nl/pricing" />');
    for (const lang of LANGS) expect(head).toContain(`hreflang="${lang}"`);
    expect(head).toContain('hreflang="x-default" href="https://www.twapza.io/pricing"');
    expect(head).toContain("Prijzen");
    const ld = [...head.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
    expect(ld[0]).toMatchObject({ "@type": "SoftwareApplication", inLanguage: "nl" });
    expect(ld[0].offers).toHaveLength(3);
    expect(htmlAttrs("ar")).toBe('lang="ar" dir="rtl"');
  });

  it("describes the FAQ on the home page and guides as articles", () => {
    const types = structuredData("/", "en").map((d) => (d as { "@type": string })["@type"]);
    expect(types).toEqual(["WebSite", "Organization", "SoftwareApplication", "FAQPage"]);
    expect(structuredData("/resources/hooks", "de")[0]).toMatchObject({ "@type": "Article", inLanguage: "de" });
  });

  it("lists every page in every language in the sitemap", () => {
    const xml = sitemapXml();
    expect(xml.match(/<url>/g)).toHaveLength(sitePaths().length * LANGS.length);
    expect(xml).toContain("<loc>https://www.twapza.io/fr/resources/captions</loc>");
    expect(xml).toContain("<loc>https://www.twapza.io/</loc>");
  });
});

describe("pre-rendering", () => {
  it("renders a page in the language of its URL, with language links", () => {
    const html = render("/nl/pricing", "nl");
    expect(html).toContain("<main");
    expect(html).toContain('href="/nl/features"');
    expect(html).toContain('href="/signup');
    expect(render("/", "en")).toContain("viral Shorts");
  });
});
