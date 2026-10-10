import type { CaptionFont, CaptionSettings } from "../api/client";

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

// Mirrors backend/twapza/captions/style.py (FONTS) and ass.py (SIZE_FACTOR, margins).
export const CAPTION_FONTS: Record<CaptionFont, { label: string; css: string; scale: number }> = {
  montserrat: { label: "Montserrat", css: "Twapza Montserrat", scale: 1.0 },
  poppins: { label: "Poppins", css: "Twapza Poppins", scale: 1.0 },
  anton: { label: "Anton", css: "Twapza Anton", scale: 1.1 },
  bebas: { label: "Bebas Neue", css: "Twapza Bebas", scale: 1.25 },
};
const SIZE_FACTOR = { small: 0.06, medium: 0.075, large: 0.095 };
const SAMPLE = ["THIS", "IS", "HOW", "IT", "LOOKS", "ON", "YOUR", "CLIP"];

/** Small 9:16 frame previewing font, colours, size, position and words per line. */
export function CaptionPreview({ value, vertical }: { value: CaptionSettings; vertical: boolean }) {
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
          fontFamily: `"${font.css}", sans-serif`,
          fontSize: `${short * SIZE_FACTOR[value.size] * font.scale}px`,
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

const selectClass = "rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm";

export function CaptionOptions({ value, onChange, vertical }: Props) {
  const set = (patch: Partial<CaptionSettings>) => onChange({ ...value, ...patch });

  return (
    <div className="flex flex-col gap-4 sm:flex-row">
      <CaptionPreview value={value} vertical={vertical} />
      <div className="grid flex-1 grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-3">
        <label className="flex flex-col gap-1">
          Font
          <select className={selectClass} value={value.font} onChange={(e) => set({ font: e.target.value as CaptionFont })}>
            {Object.entries(CAPTION_FONTS).map(([id, f]) => (
              <option key={id} value={id}>{f.label}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          Size
          <select className={selectClass} value={value.size} onChange={(e) => set({ size: e.target.value as CaptionSettings["size"] })}>
            <option value="small">Small</option>
            <option value="medium">Medium</option>
            <option value="large">Large</option>
          </select>
        </label>
        <label className="flex flex-col gap-1">
          Position
          <select className={selectClass} value={value.position} onChange={(e) => set({ position: e.target.value as CaptionSettings["position"] })}>
            <option value="bottom">Bottom</option>
            <option value="middle">Middle</option>
            <option value="top">Top</option>
          </select>
        </label>
        <label className="flex flex-col gap-1">
          Text colour
          <input type="color" className="h-9 w-full cursor-pointer rounded border border-slate-300" value={value.text_color}
            onChange={(e) => set({ text_color: e.target.value.toUpperCase() })} />
        </label>
        <label className="flex flex-col gap-1">
          Highlight colour
          <input type="color" className="h-9 w-full cursor-pointer rounded border border-slate-300" value={value.highlight_color}
            onChange={(e) => set({ highlight_color: e.target.value.toUpperCase() })} />
        </label>
        <label className="flex flex-col gap-1">
          Outline colour
          <input type="color" className="h-9 w-full cursor-pointer rounded border border-slate-300" value={value.outline_color}
            onChange={(e) => set({ outline_color: e.target.value.toUpperCase() })} />
        </label>
        <label className="flex flex-col gap-1">
          Words on screen
          <input type="number" min={1} max={8} className={selectClass} value={value.words_per_line}
            onChange={(e) => set({ words_per_line: Math.min(8, Math.max(1, Number(e.target.value) || 1)) })} />
        </label>
        <label className="col-span-2 flex items-center gap-2 self-end pb-2">
          <input type="checkbox" className="h-4 w-4 accent-indigo-600" checked={value.uppercase}
            onChange={(e) => set({ uppercase: e.target.checked })} />
          UPPERCASE
        </label>
      </div>
    </div>
  );
}
