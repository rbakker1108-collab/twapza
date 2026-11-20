// Writes a ready-made HTML file for every website page in every language (dist/features/index.html,
// dist/nl/features/index.html, …), plus sitemap.xml. Runs after `vite build` and
// `vite build --ssr src/entry-server.tsx`. The plain app shell is kept as dist/spa.html (nginx serves
// it for the app and unknown paths).
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
const ssr = await import(pathToFileURL(join(root, "dist-ssr", "entry-server.js")).href);

const template = readFileSync(join(dist, "index.html"), "utf8");
const SEO = /<!--seo-->[\s\S]*?<!--\/seo-->/;
if (!SEO.test(template) || !template.includes('<div id="root"></div>')) {
  throw new Error("index.html needs the <!--seo--> … <!--/seo--> block and an empty #root");
}

// The app shell: not for search results (app pages, login pages and unknown addresses).
writeFileSync(
  join(dist, "spa.html"),
  template.replace("<!--seo-->", '<meta name="robots" content="noindex" />\n    <!--seo-->'),
);

let count = 0;
for (const path of ssr.sitePaths()) {
  for (const lang of ssr.LANGS) {
    const url = ssr.localize(path, lang);
    const body = ssr.render(url, lang);
    if (!body.includes("<main")) throw new Error(`${url} rendered without content`);
    const html = template
      .replace(/<html[^>]*>/, `<html ${ssr.htmlAttrs(lang)}>`)
      .replace(SEO, ssr.headHtml(path, lang))
      .replace('<div id="root"></div>', `<div id="root">${body}</div>`);
    const file = url === "/" ? join(dist, "index.html") : join(dist, url.slice(1), "index.html");
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, html);
    count += 1;
  }
}
writeFileSync(join(dist, "sitemap.xml"), ssr.sitemapXml());
rmSync(join(root, "dist-ssr"), { recursive: true, force: true });
console.log(`prerendered ${count} pages + sitemap.xml`);
