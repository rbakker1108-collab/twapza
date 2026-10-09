import { useState } from "react";

import { api, type ClipSource, type ExportSettings, type Job } from "../api/client";
import { isFinished, runAndDownload } from "../lib/jobs";

interface Props {
  projectId: string;
  source: ClipSource;
  settings: ExportSettings;
  disabled?: boolean;
  onError: (message: string) => void;
}

/** Renders every clip of `source` with `settings` and downloads them as one ZIP. */
export function DownloadAllButton({ projectId, source, settings, disabled, onError }: Props) {
  const [job, setJob] = useState<Job | null>(null);
  const busy = !!job && !isFinished(job);

  async function run() {
    try {
      await runAndDownload(() => api.exportZip(projectId, source, settings), setJob);
    } catch (err) {
      onError(err instanceof Error ? err.message : "ZIP export failed.");
    } finally {
      setJob(null);
    }
  }

  return (
    <div className="flex items-center gap-3">
      {busy && (
        <span className="text-sm text-slate-600">
          {job?.message ?? "Preparing"} · {Math.round(job?.progress ?? 0)}%
        </span>
      )}
      <button
        type="button"
        onClick={run}
        disabled={busy || disabled}
        className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium transition hover:bg-slate-50 disabled:cursor-wait disabled:opacity-70"
      >
        Download all (ZIP)
      </button>
    </div>
  );
}
