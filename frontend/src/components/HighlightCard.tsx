import { useState } from "react";

import { api, type Clip, type ExportSettings, type Job } from "../api/client";
import { formatDuration } from "../lib/format";
import { isFinished, runAndDownload } from "../lib/jobs";
import { ClipPlayer } from "./ClipPlayer";
import { TrimControls } from "./TrimControls";

interface Props {
  clip: Clip;
  rank: number;
  proxyUrl: string;
  videoDuration: number;
  settings: ExportSettings;
  maxLength?: number;
  onChange: (clip: Clip) => void;
}

export function scoreTone(score: number) {
  if (score >= 80) return "bg-emerald-100 text-emerald-800";
  if (score >= 60) return "bg-amber-100 text-amber-800";
  return "bg-slate-200 text-slate-700";
}

export function HighlightCard({ clip, rank, proxyUrl, videoDuration, settings, maxLength, onChange }: Props) {
  const [trimming, setTrimming] = useState(false);
  const [draft, setDraft] = useState<{ start: number; end: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState<string | null>(null);
  const exporting = !!job && !isFinished(job);
  const vertical = settings.aspect === "9:16";
  const trimmed =
    clip.suggested_start != null &&
    (Math.abs(clip.start - clip.suggested_start) > 0.05 || Math.abs(clip.end - (clip.suggested_end ?? clip.end)) > 0.05);

  async function save(start: number, end: number) {
    setSaving(true);
    setError(null);
    try {
      onChange(await api.trimClip(clip.id, start, end));
      setTrimming(false);
      setDraft(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Saving the trim failed.");
    } finally {
      setSaving(false);
    }
  }

  async function download() {
    setError(null);
    try {
      await runAndDownload(() => api.exportClip(clip.id, settings), setJob);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed.");
    } finally {
      setJob(null);
    }
  }

  const playStart = draft?.start ?? clip.start;
  const playEnd = draft?.end ?? clip.end;

  return (
    <article className="flex flex-col gap-4 rounded-xl bg-white p-4 shadow-sm sm:flex-row">
      <div className={vertical ? "w-full shrink-0 sm:w-44" : "w-full shrink-0 sm:w-72"}>
        <ClipPlayer
          key={`${playStart}-${playEnd}`}
          src={proxyUrl}
          start={playStart}
          end={playEnd}
          poster={clip.thumbnail_url}
          frame={vertical ? settings.vertical_fit : "original"}
        />
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex items-start gap-3">
          <span className="text-sm font-medium text-slate-400">#{rank}</span>
          <h3 className="min-w-0 flex-1 text-base font-semibold">{clip.title ?? `Highlight ${rank}`}</h3>
          {clip.score != null && (
            <span
              className={`shrink-0 rounded-full px-2.5 py-0.5 text-sm font-semibold tabular-nums ${scoreTone(clip.score)}`}
              title="How likely this moment is to work as a short (AI score blended with audio energy)"
            >
              {Math.round(clip.score)}
            </span>
          )}
        </div>
        {clip.hook && <p className="text-sm italic text-slate-700">“{clip.hook}”</p>}
        {clip.reason && <p className="text-sm text-slate-600">{clip.reason}</p>}
        <p className="text-sm text-slate-500 tabular-nums">
          {formatDuration(clip.start)}–{formatDuration(clip.end)} · {Math.round(clip.duration)}s
          {trimmed && <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-xs">trimmed</span>}
        </p>

        {trimming && (
          <TrimControls
            start={clip.start}
            end={clip.end}
            suggestedStart={clip.suggested_start}
            suggestedEnd={clip.suggested_end}
            videoDuration={videoDuration}
            maxLength={maxLength}
            saving={saving}
            onDraftChange={(start, end) => setDraft({ start, end })}
            onSave={save}
            onCancel={() => {
              setTrimming(false);
              setDraft(null);
            }}
          />
        )}

        {error && (
          <p role="alert" className="text-sm text-red-700">
            {error}
          </p>
        )}

        <div className="mt-auto flex flex-wrap gap-2 pt-1">
          {!trimming && (
            <button
              type="button"
              onClick={() => setTrimming(true)}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium hover:bg-slate-50"
            >
              Trim
            </button>
          )}
          <button
            type="button"
            onClick={download}
            disabled={exporting || trimming}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium hover:bg-slate-50 disabled:opacity-60"
          >
            {exporting ? `Rendering… ${Math.round(job?.progress ?? 0)}%` : "Download"}
          </button>
        </div>
      </div>
    </article>
  );
}
