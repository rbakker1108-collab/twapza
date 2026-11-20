/// <reference types="node" />
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { DICTIONARIES, LANGUAGES, format, translate } from ".";

/** Every English text wrapped in t("…") or msg("…") in the app's source. */
export function sourceStrings(dir = join(__dirname, "..")): Set<string> {
  const found = new Set<string>();
  const walk = (d: string) => {
    for (const name of readdirSync(d)) {
      const path = join(d, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) && !path.includes("/i18n/") || name === "server.ts") {
        const code = readFileSync(path, "utf8");
        for (const m of code.matchAll(/\b(?:t|msg)\(\s*"((?:[^"\\]|\\.)*)"/g)) found.add(JSON.parse(`"${m[1]}"`));
      }
    }
  };
  walk(dir);
  return found;
}

const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe("translations", () => {
  const strings = sourceStrings();

  it("finds the app's texts", () => {
    expect(strings.size).toBeGreaterThan(150);
    expect(strings).toContain("Find highlights");
  });

  it.each(Object.keys(DICTIONARIES))("%s has every text, with the same placeholders", (lang) => {
    const dict = DICTIONARIES[lang as keyof typeof DICTIONARIES];
    const missing = [...strings].filter((s) => !(s in dict));
    expect(missing).toEqual([]);
    for (const s of strings) expect(placeholders(dict[s]), `${lang}: ${s}`).toEqual(placeholders(s));
    const unused = Object.keys(dict).filter((k) => !strings.has(k));
    expect(unused).toEqual([]);
  });

  it("formats and falls back to English", () => {
    expect(format("Clip {n} of {total}", { n: 2, total: 5 })).toBe("Clip 2 of 5");
    expect(translate("en", "Find highlights")).toBe("Find highlights");
    expect(translate("nl", "Not a known text {x}", { x: 1 })).toBe("Not a known text 1");
    expect(LANGUAGES.find((l) => l.code === "ar")).toMatchObject({ rtl: true });
  });
});
