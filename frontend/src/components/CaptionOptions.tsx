import type { CaptionFont, CaptionSettings } from "../api/client";
import { useT } from "../i18n";

export const DEFAULT_CAPTIONS: CaptionSettings = {
  font: "montserrat",
  text_color: "#FFFFFF",
  highlight_color: "#FFD400",
  outline_color: "#000000",
  size: "medium",
  position: "bottom",
  words_per_line: 3,
  uppercase: true,
};

// Mirrors backend/twapza/captions/style.py (FONTS, EM_PER_ASS_SIZE) and ass.py (SIZE_FACTOR, margins).
// `em`: CSS em per unit of ASS font size (libass sizes fonts by ascent+descent), so the
// browser previews show text at the size it gets in the download.
export const CAPTION_FONTS: Record<CaptionFont, { label: string; css: string; scale: number; em: number }> = {
  montserrat: { label: "Montserrat", css: "Twapza Montserrat", scale: 1.0, em: 0.643 },
  poppins: { label: "Poppins", css: "Twapza Poppins", scale: 1.0, em: 0.564 },
  anton: { label: "Anton", css: "Twapza Anton", scale: 1.1, em: 0.576 },
  bebas: { label: "Bebas Neue", css: "Twapza Bebas", scale: 1.25, em: 0.771 },
};
/** Arabic letters fall back to the same Arabic font the export uses (captions/style.py ARABIC_FONT). */
export const ARABIC_FALLBACK = '"Noto Sans Arabic Variable", sans-serif';
const SIZE_FACTOR = { small: 0.06, medium: 0.075, large: 0.095 };


/** Small 9:16 frame previewing font, colours, size, position and words per line. */
export function CaptionPreview({ value, vertical }: { value: CaptionSettings; vertical: boolean }) {
  const t = useT();
  const SAMPLE = t("This is how it looks on your clip").toUpperCase().split(/\s+/);
  const width = vertical ? 144 : 256;
  const height = vertical ? 256 : 144;
  const short = Math.min(width, height);
  const font = CAPTION_FONTS[value.font];
  const words = SAMPLE.slice(0, value.words_per_line).map((w) => (value.uppercase ? w : w.toLowerCase()));
  const active = Math.min(1, words.length - 1);
  const placement = {
    bottom: { bottom: `${height * (vertical ? 0.2 : 0.08)}px` },
    middle: { top: "50%", transform: "translateY(-50%)" },
    top: { top: `${height * (vertical ? 0.12 : 0.06)}px` },
  }[value.position];
  const outline = Math.max(1, short * 0.006);

  return (
    <div
      data-testid="caption-preview"
      className="relative shrink-0 overflow-hidden rounded-lg bg-gradient-to-b from-slate-500 via-slate-700 to-slate-900"
      style={{ width, height }}
    >
      <div
        className="absolute inset-x-0 px-[6%] text-center leading-tight"
        style={{
          ...placement,
          fontFamily: `"${font.css}", ${ARABIC_FALLBACK}`,
                      fontWeight: 800,
          fontSize: `${short * SIZE_FACTOR[value.size] * font.scale * font.em}px`,
          color: value.text_color,
          WebkitTextStroke: `${outline}px ${value.outline_color}`,
          paintOrder: "stroke fill",
        }}
      >
        {words.map((w, i) => (
          <span key={i} style={i === active ? { color: value.highlight_color } : undefined}>
            {w}
            {i < words.length - 1 ? " " : ""}
          </span>
        ))}
      </div>
    </div>
  );
}

interface Props {
  value: CaptionSettings;
  onChange: (next: CaptionSettings) => void;
  vertical: boolean;
}

const selectClass = "rounded-lg border border-line-strong bg-surface-2 px-2 py-1.5 text-sm";

export function CaptionOptions({ value, onChange, vertical }: Props) {
  const t = useT();
  const set = (patch: Partial<CaptionSettings>) => onChange({ ...value, ...patch });

  return (
    <div className="flex flex-col gap-4 sm:flex-row">
      <CaptionPreview value={value} vertical={vertical} />
      <div className="grid flex-1 grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-3">
        <label className="flex flex-col gap-1">
          {t("Font")}
          <select className={selectClass} value={value.font} onChange={(e) => set({ font: e.target.value as CaptionFont })}>
            {Object.entries(CAPTION_FONTS).map(([id, f]) => (
              <option key={id} value={id}>{f.label}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          {t("Size")}
          <select className={selectClass} value={value.size} onChange={(e) => set({ size: e.target.value as CaptionSettings["size"] })}>
            <option value="small">{t("Small")}</option>
            <option value="medium">{t("Medium")}</option>
            <option value="large">{t("Large")}</option>
          </select>
        </label>
        <label className="flex flex-col gap-1">
          {t("Position")}
          <select className={selectClass} value={value.position} onChange={(e) => set({ position: e.target.value as CaptionSettings["position"] })}>
            <option value="bottom">{t("Bottom")}</option>
            <option value="middle">{t("Middle")}</option>
            <option value="top">{t("Top")}</option>
          </select>
        </label>
        <label className="flex flex-col gap-1">
          {t("Text colour")}
          <input type="color" className="h-9 w-full cursor-pointer rounded border border-line-strong" value={value.text_color}
            onChange={(e) => set({ text_color: e.target.value.toUpperCase() })} />
        </label>
        <label className="flex flex-col gap-1">
          {t("Highlight colour")}
          <input type="color" className="h-9 w-full cursor-pointer rounded border border-line-strong" value={value.highlight_color}
            onChange={(e) => set({ highlight_color: e.target.value.toUpperCase() })} />
        </label>
        <label className="flex flex-col gap-1">
          {t("Outline colour")}
          <input type="color" className="h-9 w-full cursor-pointer rounded border border-line-strong" value={value.outline_color}
            onChange={(e) => set({ outline_color: e.target.value.toUpperCase() })} />
        </label>
        <label className="flex flex-col gap-1">
          {t("Words on screen")}
          <input type="number" min={1} max={8} className={selectClass} value={value.words_per_line}
            onChange={(e) => set({ words_per_line: Math.min(8, Math.max(1, Number(e.target.value) || 1)) })} />
        </label>
        <label className="col-span-2 flex items-center gap-2 self-end pb-2">
          <input type="checkbox" className="h-4 w-4 accent-brand-500" checked={value.uppercase}
            onChange={(e) => set({ uppercase: e.target.checked })} />
          {t("UPPERCASE")}
        </label>
      </div>
    </div>
  );
}
