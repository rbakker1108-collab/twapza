import { useEffect } from "react";

import type { Lang } from "../i18n";
import { absoluteUrl, defaultMeta, pageMeta } from "./seo";

function setTag(selector: string, create: () => HTMLElement, attr: string, value: string) {
  let el = document.head.querySelector<HTMLElement>(selector);
  if (!el) {
    el = create();
    document.head.appendChild(el);
  }
  el.setAttribute(attr, value);
}

const meta = (key: "name" | "property", name: string) => () => {
  const el = document.createElement("meta");
  el.setAttribute(key, name);
  return el;
};

/** Keeps title, description, canonical URL and share preview in step with the current website
 *  page (pre-rendered pages already have them; this covers navigating inside the site). */
export function useDocumentHead(path: string | null, lang: Lang) {
  useEffect(() => {
    const m = (path && pageMeta(path, lang)) || defaultMeta(lang);
    document.title = m.title;
    setTag('meta[name="description"]', meta("name", "description"), "content", m.description);
    setTag('meta[property="og:title"]', meta("property", "og:title"), "content", m.title);
    setTag('meta[property="og:description"]', meta("property", "og:description"), "content", m.description);
    if (path) {
      const url = absoluteUrl(path, lang);
      setTag('link[rel="canonical"]', () => Object.assign(document.createElement("link"), { rel: "canonical" }), "href", url);
      setTag('meta[property="og:url"]', meta("property", "og:url"), "content", url);
    }
  }, [path, lang]);
}
