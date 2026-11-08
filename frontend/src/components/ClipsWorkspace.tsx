import { useState } from "react";

import type { ExportSettings, Project, PublicConfig } from "../api/client";
import { canUpscale, DEFAULT_EXPORT, ExportOptions } from "./ExportOptions";
import { HighlightsPanel } from "./HighlightsPanel";
import { SimpleClipsPanel } from "./SimpleClipsPanel";

type Tab = "ai" | "simple";

const STORAGE_KEY = "twapza.downloadSettings";

/** The last-used download settings (format, caption style, options), like a brand template. */
export function loadSavedSettings(): ExportSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_EXPORT;
    const saved = JSON.parse(raw) as Partial<ExportSettings>;
    return { ...DEFAULT_EXPORT, ...saved, captions: saved.captions === undefined ? DEFAULT_EXPORT.captions : saved.captions };
  } catch {
    return DEFAULT_EXPORT;
  }
}

function saveSettings(settings: ExportSettings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    /* private mode / storage full: settings just aren't remembered */
  }
}

interface Props {
  project: Project;
  config: PublicConfig | null;
}

/** Download format (shared) + the two ways of making clips. */
export function ClipsWorkspace({ project, config }: Props) {
  const [tab, setTab] = useState<Tab>("ai");
  const [options, setOptionsState] = useState<ExportSettings>(loadSavedSettings);
  const setOptions = (next: ExportSettings) => {
    setOptionsState(next);
    saveSettings(next);
  };
  const settings: ExportSettings = { ...options, upscale_1080: canUpscale(project) && options.upscale_1080 };

  const tabClass = (t: Tab) =>
    `rounded-lg px-4 py-2 text-sm font-medium transition ${
      tab === t ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"
    }`;

  return (
    <div className="space-y-5">
      <div className="rounded-xl bg-white p-5 shadow-sm">
        <ExportOptions project={project} value={options} onChange={setOptions} />
      </div>

      <div role="tablist" className="inline-flex gap-1 rounded-xl bg-slate-200/70 p-1">
        <button role="tab" aria-selected={tab === "ai"} className={tabClass("ai")} onClick={() => setTab("ai")}>
          AI highlights
        </button>
        <button role="tab" aria-selected={tab === "simple"} className={tabClass("simple")} onClick={() => setTab("simple")}>
          Simple clips
        </button>
      </div>

      {/* Both stay mounted so switching tabs keeps running jobs and clip lists. */}
      <div hidden={tab !== "ai"}>
        <HighlightsPanel
          project={project}
          settings={settings}
          aiEnabled={config?.ai_enabled ?? false}
          model={config?.claude_model}
          maxLength={config?.max_clip_seconds}
        />
      </div>
      <div hidden={tab !== "simple"}>
        <SimpleClipsPanel
          project={project}
          settings={settings}
          minSeconds={config?.min_clip_seconds}
          maxSeconds={config?.max_clip_seconds}
        />
      </div>
    </div>
  );
}
