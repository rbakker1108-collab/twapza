/**
 * Server-side rendering of the website pages, used only by scripts/prerender.mjs at build time
 * (built with `vite build --ssr`). Each page in each language becomes a static HTML file that
 * search engines and link previews can read without running JavaScript.
 */
import { StrictMode } from "react";
import { renderToString } from "react-dom/server";
import { StaticRouter } from "react-router-dom";

import { App } from "./App";
import { AuthProvider } from "./auth/AuthProvider";
import { I18nProvider, LANGUAGES, type Lang } from "./i18n";
import { localize, sitePaths } from "./marketing/locale";
import { headHtml, htmlAttrs, sitemapXml } from "./marketing/seo";

export { headHtml, htmlAttrs, localize, sitemapXml, sitePaths };
export const LANGS: Lang[] = LANGUAGES.map((l) => l.code);

export function render(url: string, lang: Lang): string {
  return renderToString(
    <StrictMode>
      <I18nProvider initial={lang}>
        <AuthProvider>
          <StaticRouter location={url}>
            <App />
          </StaticRouter>
        </AuthProvider>
      </I18nProvider>
    </StrictMode>,
  );
}
