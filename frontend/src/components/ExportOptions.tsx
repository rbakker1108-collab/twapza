import { useRef } from "react";

import type { CaptionSettings, ExportSettings, Project } from "../api/client";
import { msg, useT } from "../i18n";
import { CaptionOptions, DEFAULT_CAPTIONS } from "./CaptionOptions";

export const DEFAULT_EXPORT: ExportSettings = {
  aspect: "9:16",
  vertical_fit: "blur",
  upscale_1080: true,
  captions: DEFAULT_CAPTIONS,
  hook_text: false,
  cold_open: false,
  cut_pauses: false,
  hook_full: false,
  cut_fillers: false,
  progress_bar: false,
};

type Boost = "hook_text" | "cold_open" | "cut_pauses" | "cut_fillers" | "progress_bar";

const BOOSTS: { key: Boost; title: string; hint: string }[] = [
  {
    key: "hook_text",
    title: msg("Hook text"),
    hint: msg("Bold text at the top. Write or pick it in the clip editor."),
  },
  {
    key: "cold_open",
    title: msg("Cold open"),
    hint: msg("Starts with the clip's most gripping line as a 2–5 second teaser, then plays the clip."),
  },
  {
    key: "cut_pauses",
    title: msg("Cut pauses"),
    hint: msg("Removes silences between words for snappier pacing (jump cuts)."),
  },
  {
    key: "cut_fillers",
    title: msg("Remove filler words"),
    hint: msg("Cuts out “um”, “uh”, “ehm” and the hesitation around them."),
  },
  {
    key: "progress_bar",
    title: msg("Progress bar"),
    hint: msg("A thin bar along the top that fills up as the clip plays."),
  },
];

/** Shorter side of the source in pixels, or 0 if unknown. */
export const shortSide = (p: Project) => Math.min(p.width ?? 0, p.height ?? 0);
export const canUpscale = (p: Project) => shortSide(p) > 0 && shortSide(p) < 1080;

interface Props {
  project: Project;
  value: ExportSettings;
  onChange: (next: ExportSettings) => void;
  disabled?: boolean;
}

function Choice({ checked, onSelect, disabled, title, hint }: {
  checked: boolean; onSelect: () => void; disabled?: boolean; title: string; hint: string;
}) {
  return (
    <label
      className={`flex cursor-pointer flex-col rounded-lg border px-3 py-2 text-sm transition ${
        checked ? "border-brand-500 bg-brand-500/10" : "border-line-strong bg-surface-2 hover:border-faint"
      } ${disabled ? "cursor-not-allowed opacity-60" : ""}`}
    >
      <span className="flex items-center gap-2 font-medium">
        <input type="radio" className="accent-brand-500" checked={checked} onChange={onSelect} disabled={disabled} />
        {title}
      </span>
      <span className="ps-5 text-muted">{hint}</span>
    </label>
  );
}

export function ExportOptions({ project, value, onChange, disabled }: Props) {
  const t = useT();
  const set = (patch: Partial<ExportSettings>) => onChange({ ...value, ...patch });
  const vertical = value.aspect === "9:16";
  // Remember the caption style while captions are switched off.
  const lastCaptions = useRef<CaptionSettings>(value.captions ?? DEFAULT_CAPTIONS);
  const setCaptions = (next: CaptionSettings | null) => {
    if (next) lastCaptions.current = next;
    set({ captions: next });
  };

  return (
    <fieldset className="space-y-3" disabled={disabled}>
      <legend className="mb-2 text-sm font-medium">{t("Download format")}</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        <Choice
          checked={vertical}
          onSelect={() => set({ aspect: "9:16" })}
          title={t("Vertical 9:16")}
          hint={t("1080×1920 for YouTube Shorts, TikTok and Reels")}
        />
        <Choice
          checked={!vertical}
          onSelect={() => set({ aspect: "original" })}
          title={t("Original")}
          hint={project.width ? t("Same shape as your video ({size})", { size: `${project.width}×${project.height}` }) : t("Same shape as your video")}
        />
      </div>

      {vertical ? (
        <div className="grid gap-2 sm:grid-cols-3">
          <Choice
            checked={value.vertical_fit === "blur"}
            onSelect={() => set({ vertical_fit: "blur" })}
            title={t("Fit with blurred background")}
            hint={t("Whole video visible, scaled to fit")}
          />
          <Choice
            checked={value.vertical_fit === "bars"}
            onSelect={() => set({ vertical_fit: "bars" })}
            title={t("Fit with black bars")}
            hint={t("Whole video visible on black")}
          />
          <Choice
            checked={value.vertical_fit === "crop"}
            onSelect={() => set({ vertical_fit: "crop" })}
            title={t("Crop to center")}
            hint={t("Fills the screen; cuts off the sides")}
          />
        </div>
      ) : (
        canUpscale(project) && (
          <label
            className="flex items-center gap-2 text-sm"
            title={t("Makes downloads 1080p so they look cleaner on platforms that expect HD. It can't add detail that isn't in the original.")}
          >
            <input
              type="checkbox"
              className="h-4 w-4 accent-brand-500"
              checked={value.upscale_1080}
              onChange={(e) => set({ upscale_1080: e.target.checked })}
            />
            {t("Upscale downloads to 1080p")} <span className="text-muted">{t("(source is {n}p)", { n: shortSide(project) })}</span>
          </label>
        )
      )}

      <div className="space-y-2 border-t border-line pt-4">
        <p className="text-sm font-medium">
          {t("Boost retention")} <span className="font-normal text-muted">{t("(optional, applied when you download)")}</span>
        </p>
        <div className="grid gap-2 sm:grid-cols-3">
          {BOOSTS.map(({ key, title, hint }) => (
            <label
              key={key}
              className={`flex cursor-pointer flex-col rounded-lg border px-3 py-2 text-sm transition ${
                value[key] ? "border-brand-500 bg-brand-500/10" : "border-line-strong bg-surface-2 hover:border-faint"
              }`}
            >
              <span className="flex items-center gap-2 font-medium">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-brand-500"
                  checked={value[key]}
                  onChange={(e) => set({ [key]: e.target.checked })}
                />
                {t(title)}
              </span>
              <span className="ps-6 text-muted">{t(hint)}</span>
            </label>
          ))}
        </div>
        {value.hook_text && (
          <div className="flex flex-wrap items-center gap-4 ps-1 text-sm" role="radiogroup" aria-label={t("Show the hook text")}>
            <span className="text-muted">{t("Show the hook text:")}</span>
            <label className="flex items-center gap-1.5">
              <input type="radio" className="accent-brand-500" checked={!value.hook_full} onChange={() => set({ hook_full: false })} />
              {t("First 3 seconds")}
            </label>
            <label className="flex items-center gap-1.5">
              <input type="radio" className="accent-brand-500" checked={value.hook_full} onChange={() => set({ hook_full: true })} />
              {t("Whole clip")}
            </label>
          </div>
        )}
      </div>

      <div className="space-y-3 border-t border-line pt-4">
        <label className="flex items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            className="h-4 w-4 accent-brand-500"
            checked={value.captions !== null}
            onChange={(e) => setCaptions(e.target.checked ? lastCaptions.current : null)}
          />
          {t("Subtitles")} <span className="font-normal text-muted">{t("(burned in, word-by-word highlight)")}</span>
        </label>
        {value.captions && (
          <CaptionOptions value={value.captions} onChange={setCaptions} vertical={vertical || !project.width || (project.height ?? 0) > project.width} />
        )}
      </div>
    </fieldset>
  );
}
