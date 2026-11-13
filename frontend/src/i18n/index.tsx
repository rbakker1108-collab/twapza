/**
 * Interface translations. Strings are written in English in the components and wrapped in
 * t("…") (or msg("…") for constants translated later); each language file maps the English
 * text to its translation. src/i18n/i18n.test.ts checks every language has every string.
 * Placeholders use {name}: t("Clip {n}", { n: 3 }).
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import ar from "./ar";
import de from "./de";
import es from "./es";
import fr from "./fr";
import nl from "./nl";

export const LANGUAGES = [
  { code: "en", name: "English" },
  { code: "nl", name: "Nederlands" },
  { code: "es", name: "Español" },
  { code: "de", name: "Deutsch" },
  { code: "fr", name: "Français" },
  { code: "ar", name: "العربية", rtl: true },
] as const;

export type Lang = (typeof LANGUAGES)[number]["code"];
export type Vars = Record<string, string | number>;

export const DICTIONARIES: Record<Exclude<Lang, "en">, Record<string, string>> = { nl, es, de, fr, ar };
const STORAGE_KEY = "twapza.lang";

/** Marks a constant string for translation (it is translated where it is shown, with t()). */
export const msg = (text: string) => text;

export function format(text: string, vars?: Vars): string {
  return vars ? text.replace(/\{(\w+)\}/g, (all, key) => (key in vars ? String(vars[key]) : all)) : text;
}

export function translate(lang: Lang, text: string, vars?: Vars): string {
  const dict = lang === "en" ? undefined : DICTIONARIES[lang];
  return format(dict?.[text] ?? text, vars);
}

export function isRtl(lang: Lang) {
  return LANGUAGES.some((l) => l.code === lang && "rtl" in l && l.rtl);
}

function detect(): Lang {
  const known = LANGUAGES.map((l) => l.code as string);
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && known.includes(saved)) return saved as Lang;
  } catch {
    /* storage blocked */
  }
  const wanted = typeof navigator !== "undefined" ? navigator.languages ?? [navigator.language] : [];
  for (const tag of wanted) {
    const code = tag?.slice(0, 2).toLowerCase();
    if (code && known.includes(code)) return code as Lang;
  }
  return "en";
}

interface I18n {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (text: string, vars?: Vars) => string;
}

const I18nContext = createContext<I18n>({ lang: "en", setLang: () => {}, t: (text, vars) => format(text, vars) });

export function I18nProvider({ children, initial }: { children: ReactNode; initial?: Lang }) {
  const [lang, setLangState] = useState<Lang>(() => initial ?? detect());

  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* not remembered */
    }
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = isRtl(lang) ? "rtl" : "ltr";
  }, [lang]);

  const value = useMemo<I18n>(
    () => ({ lang, setLang, t: (text, vars) => translate(lang, text, vars) }),
    [lang, setLang],
  );
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export const useI18n = () => useContext(I18nContext);
export const useT = () => useContext(I18nContext).t;
