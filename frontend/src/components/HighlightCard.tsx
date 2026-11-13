import { useState } from "react";

import { api, type Clip, type ExportSettings, type Job, type Project } from "../api/client";
import { formatDuration } from "../lib/format";
import { useT } from "../i18n";
import { isFinished, runAndDownload } from "../lib/jobs";
import { ClipPlayer } from "./ClipPlayer";
import { ClipEditor } from "./ClipEditor";
import { DescriptionPanel } from "./DescriptionPanel";
import { TrimControls } from "./TrimControls";

interface Props {
  clip: Clip;
  rank: number;
  proxyUrl: string;
  videoDuration: number;
  settings: ExportSettings;
  maxLength?: number;
  /** Source width / height (for the editor's "original" format preview). */
  project?: Project;
  onSettingsChange?: (settings: ExportSettings) => void;
  onChange: (clip: Clip) => void;
}

export function scoreTone(score: number) {
  if (score >= 80) return "bg-emerald-500/15 text-emerald-300";
  if (score >= 60) return "bg-amber-500/15 text-amber-300";
  return "bg-surface-3 text-ink-soft";
}

export function HighlightCard({ clip, rank, proxyUrl, videoDuration, settings, maxLength, project, onSettingsChange, onChange }: Props) {
  const t = useT();
  const [editing, setEditing] = useState(false);
  const [trimming, setTrimming] = useState(false);
  const [describing, setDescribing] = useState(false);
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
      setError(err instanceof Error ? err.message : t("Saving the trim failed."));
    } finally {
      setSaving(false);
    }
  }

  async function download() {
    setError(null);
    try {
      await runAndDownload(() => api.exportClip(clip.id, settings), setJob);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("Export failed."));
    } finally {
      setJob(null);
    }
  }

  const playStart = draft?.start ?? clip.start;
  const playEnd = draft?.end ?? clip.end;

  return (
    <article className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-4 transition hover:border-line-strong sm:flex-row">
      <div className={vertical ? "w-full shrink-0 sm:w-44" : "w-full shrink-0 sm:w-72"}>
        <ClipPlayer
          key={`${playStart}-${playEnd}`}
          src={proxyUrl}
          start={playStart}
          end={playEnd}
          poster={clip.thumbnail_url}
          frame={vertical ? settings.vertical_fit : "original"}
          hookText={settings.hook_text ? clip.title : null}
        />
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex items-start gap-3">
          <span className="text-sm font-medium text-faint">#{rank}</span>
          <h3 className="min-w-0 flex-1 text-base font-semibold">{clip.title ?? t("Highlight {n}", { n: rank })}</h3>
          {clip.score != null && (
            <span
              className={`shrink-0 rounded-full px-2.5 py-0.5 text-sm font-semibold tabular-nums ${scoreTone(clip.score)}`}
              title={t("How likely this moment is to work as a short (AI score blended with audio energy)")}
            >
              {Math.round(clip.score)}
            </span>
          )}
        </div>
        {clip.hook && <p className="text-sm italic text-ink-soft">“{clip.hook}”</p>}
        {clip.reason && <p className="text-sm text-muted">{clip.reason}</p>}
        <p className="text-sm text-muted tabular-nums">
          {formatDuration(clip.start)}–{formatDuration(clip.end)} · {Math.round(clip.duration)}s
          {trimmed && <span className="ms-2 rounded bg-surface-2 px-1.5 py-0.5 text-xs">{t("trimmed")}</span>}
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
          <p role="alert" className="text-sm text-red-400">
            {error}
          </p>
        )}

        <div className="mt-auto flex flex-wrap gap-2 pt-1">
          <button
            type="button"
            onClick={() => setEditing(true)}
            disabled={trimming || !project}
            className="rounded-lg bg-brand-500 px-3 py-1.5 text-sm font-medium text-black hover:bg-brand-400 disabled:bg-surface-3 disabled:text-faint"
          >
            {t("Edit & download")}{clip.overlays.length === 1 ? ` · ${t("1 text")}` : clip.overlays.length > 1 ? ` · ${t("{n} texts", { n: clip.overlays.length })}` : ""}
          </button>
          {!trimming && (
            <button
              type="button"
              onClick={() => setTrimming(true)}
              className="rounded-lg border border-line-strong px-3 py-1.5 text-sm font-medium hover:bg-surface-2"
            >
              {t("Trim")}
            </button>
          )}
          <button
            type="button"
            onClick={download}
            disabled={exporting || trimming}
            title={t("Download right away with the current settings and edits")}
            className="rounded-lg border border-line-strong px-3 py-1.5 text-sm font-medium hover:bg-surface-2 disabled:opacity-60"
          >
            {exporting ? t("Rendering… {n}%", { n: Math.round(job?.progress ?? 0) }) : t("Quick download")}
          </button>
          <button
            type="button"
            onClick={() => setDescribing(!describing)}
            aria-expanded={describing}
            className="rounded-lg border border-line-strong px-3 py-1.5 text-sm font-medium hover:bg-surface-2"
          >
            {t("Description")}
          </button>
          {clip.text && (
            <a
              href={api.subtitlesUrl(clip.id, settings)}
              download
              className="self-center px-1 text-sm text-brand-400 hover:underline"
              title={t("Subtitle file to upload to YouTube or TikTok")}
            >
              {t("Subtitles (.srt)")}
            </a>
          )}
        </div>
        {describing && <DescriptionPanel
            key={`${clip.start}-${clip.end}`}
            clipId={clip.id}
            currentTitle={clip.title}
            onTitleChange={onChange}
          />}
      </div>
      {editing && project && (
        <ClipEditor
          clip={clip}
          project={project}
          settings={settings}
          onSettingsChange={onSettingsChange}
          onClose={() => setEditing(false)}
          onSaved={onChange}
        />
      )}
    </article>
  );
}
