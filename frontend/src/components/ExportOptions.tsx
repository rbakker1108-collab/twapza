import type { ExportSettings, Project } from "../api/client";

export const DEFAULT_EXPORT: ExportSettings = { aspect: "9:16", vertical_fit: "crop", upscale_1080: true };

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
        checked ? "border-indigo-600 bg-indigo-50" : "border-slate-300 bg-white hover:border-slate-400"
      } ${disabled ? "cursor-not-allowed opacity-60" : ""}`}
    >
      <span className="flex items-center gap-2 font-medium">
        <input type="radio" className="accent-indigo-600" checked={checked} onChange={onSelect} disabled={disabled} />
        {title}
      </span>
      <span className="pl-5 text-slate-500">{hint}</span>
    </label>
  );
}

export function ExportOptions({ project, value, onChange, disabled }: Props) {
  const set = (patch: Partial<ExportSettings>) => onChange({ ...value, ...patch });
  const vertical = value.aspect === "9:16";

  return (
    <fieldset className="space-y-3" disabled={disabled}>
      <legend className="mb-2 text-sm font-medium">Download format</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        <Choice
          checked={vertical}
          onSelect={() => set({ aspect: "9:16" })}
          title="Vertical 9:16"
          hint="1080×1920 for YouTube Shorts, TikTok and Reels"
        />
        <Choice
          checked={!vertical}
          onSelect={() => set({ aspect: "original" })}
          title="Original"
          hint={project.width ? `Same shape as your video (${project.width}×${project.height})` : "Same shape as your video"}
        />
      </div>

      {vertical ? (
        <div className="grid gap-2 sm:grid-cols-2">
          <Choice
            checked={value.vertical_fit === "crop"}
            onSelect={() => set({ vertical_fit: "crop" })}
            title="Crop to center"
            hint="Fills the screen; best for one person talking"
          />
          <Choice
            checked={value.vertical_fit === "blur"}
            onSelect={() => set({ vertical_fit: "blur" })}
            title="Fit with blurred background"
            hint="Nothing cut off; best for screens, slides or groups"
          />
        </div>
      ) : (
        canUpscale(project) && (
          <label
            className="flex items-center gap-2 text-sm"
            title="Makes downloads 1080p so they look cleaner on platforms that expect HD. It can't add detail that isn't in the original."
          >
            <input
              type="checkbox"
              className="h-4 w-4 accent-indigo-600"
              checked={value.upscale_1080}
              onChange={(e) => set({ upscale_1080: e.target.checked })}
            />
            Upscale downloads to 1080p <span className="text-slate-500">(source is {shortSide(project)}p)</span>
          </label>
        )
      )}
    </fieldset>
  );
}
