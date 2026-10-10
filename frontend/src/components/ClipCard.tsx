import { useState } from "react";

import { api, type Clip, type ExportSettings, type Job } from "../api/client";
import { formatDuration } from "../lib/format";
import { runAndDownload } from "../lib/jobs";
import { ClipPlayer } from "./ClipPlayer";

interface Props {
  clip: Clip;
  proxyUrl: string;
  settings?: ExportSettings;
}

export function ClipCard({ clip, proxyUrl, settings }: Props) {
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState<string | null>(null);
  const busy = !!job && job.status !== "succeeded" && job.status !== "failed";

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

  return (
    <article className="flex flex-col gap-3 rounded-xl bg-white p-3 shadow-sm">
      <ClipPlayer
        src={proxyUrl}
        start={clip.start}
        end={clip.end}
        poster={clip.thumbnail_url}
        frame={settings?.aspect === "9:16" ? settings.vertical_fit : "original"}
      />
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="font-medium">Clip {clip.index}</span>
        <span className="text-slate-500 tabular-nums">
          {formatDuration(clip.start)}–{formatDuration(clip.end)} · {Math.round(clip.duration)}s
        </span>
      </div>
      {clip.text && <p className="line-clamp-3 text-sm text-slate-600">{clip.text}</p>}
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      <button
        type="button"
        onClick={download}
        disabled={busy}
        className="mt-auto rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium transition hover:bg-slate-50 disabled:cursor-wait disabled:opacity-70"
      >
        {busy ? `Rendering… ${Math.round(job?.progress ?? 0)}%` : "Download"}
      </button>
      {clip.text && (
        <a
          href={api.subtitlesUrl(clip.id)}
          download
          className="text-center text-sm text-indigo-700 hover:underline"
          title="Subtitle file to upload to YouTube or TikTok"
        >
          Subtitles (.srt)
        </a>
      )}
    </article>
  );
}
