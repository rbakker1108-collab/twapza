import { LANGUAGES, useI18n, type Lang } from "../i18n";

export function LanguageSwitcher() {
  const { lang, setLang, t } = useI18n();
  return (
    <label className="relative flex items-center">
      <span className="sr-only">{t("Language")}</span>
      <svg viewBox="0 0 24 24" className="pointer-events-none absolute start-2.5 h-4 w-4 text-muted" aria-hidden>
        <path
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm-9-9h18M12 3c2.5 2.6 3.8 5.6 3.8 9S14.5 18.4 12 21c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3Z"
        />
      </svg>
      <select
        value={lang}
        onChange={(e) => setLang(e.target.value as Lang)}
        className="appearance-none rounded-lg border border-line bg-surface-2 py-1.5 ps-8 pe-3 text-sm text-ink-soft hover:border-line-strong"
      >
        {LANGUAGES.map((l) => (
          <option key={l.code} value={l.code}>
            {l.name}
          </option>
        ))}
      </select>
    </label>
  );
}
