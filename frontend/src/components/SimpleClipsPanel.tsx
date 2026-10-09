import { useEffect, useState } from "react";

import { api, type Clip, type ExportSettings, type Job, type Project } from "../api/client";
import { isFinished, runAndDownload, watchJob } from "../lib/jobs";
import { ClipCard } from "./ClipCard";
import { canUpscale, DEFAULT_EXPORT, ExportOptions } from "./ExportOptions";
import { ProgressBar } from "./ProgressBar";

interface Props {
  project: Project;
  minSeconds?: number;
  maxSeconds?: number;
}

const DEFAULT_LENGTH = 60;

export function SimpleClipsPanel({ project, minSeconds = 15, maxSeconds = 180 }: Props) {
  const [length, setLength] = useState(DEFAULT_LENGTH);
  const [clips, setClips] = useState<Clip[]>([]);
  const [genJob, setGenJob] = useState<Job | null>(null);
  const [zipJob, setZipJob] = useState<Job | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [options, setOptions] = useState<ExportSettings>(DEFAULT_EXPORT);
  const settings: ExportSettings = { ...options, upscale_1080: canUpscale(project) && options.upscale_1080 };
  const vertical = settings.aspect === "9:16";

  const generating = !!genJob && !isFinished(genJob);
  const zipping = !!zipJob && !isFinished(zipJob);

  useEffect(() => {
    api.listClips(project.id, "simple").then(setClips).catch(() => {});
    // Resume watching a generation job that is still running (e.g. after a reload).
    const running = [...project.jobs]
      .reverse()
      .find((j) => j.type === "simple_clips" && !isFinished(j));
    if (running) follow(running);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id]);

  async function follow(job: Job) {
    setGenJob(job);
    const done = await watchJob(job.id, setGenJob);
    if (done.status === "failed") setError(done.error ?? "Generating clips failed.");
    else setClips(await api.listClips(project.id, "simple"));
    setGenJob(null);
  }

  async function generate() {
    setError(null);
    try {
      await follow(await api.createSimpleClips(project.id, length));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generating clips failed.");
      setGenJob(null);
    }
  }

  async function downloadAll() {
    setError(null);
    try {
      await runAndDownload(() => api.exportZip(project.id, "simple", settings), setZipJob);
    } catch (err) {
      setError(err instanceof Error ? err.message : "ZIP export failed.");
    } finally {
      setZipJob(null);
    }
  }

  const estimate = project.duration ? Math.max(1, Math.round(project.duration / length)) : null;

  return (
    <section className="space-y-5">
      <div className="space-y-4 rounded-xl bg-white p-5 shadow-sm">
        <div>
          <h2 className="text-lg font-semibold">Simple clips</h2>
          <p className="text-sm text-slate-600">
            Split the whole video into clips of about the same length. Cuts land on natural pauses
            and sentence ends (within 5 seconds of the target).
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <label htmlFor="clip-length" className="text-sm font-medium">
            Clip length
          </label>
          <input
            id="clip-length"
            type="range"
            min={minSeconds}
            max={maxSeconds}
            step={5}
            value={length}
            disabled={generating}
            onChange={(e) => setLength(Number(e.target.value))}
            className="w-56 accent-indigo-600"
          />
          <span className="w-28 text-sm tabular-nums text-slate-700">
            {length}s{estimate ? ` (~${estimate} clips)` : ""}
          </span>
          <button
            type="button"
            onClick={generate}
            disabled={generating}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-500 disabled:cursor-wait disabled:bg-slate-300"
          >
            {clips.length ? "Regenerate clips" : "Generate clips"}
          </button>
        </div>
        {generating && (
          <ProgressBar value={genJob?.progress ?? 0} label={genJob?.message ?? "Waiting for a worker…"} />
        )}
        {error && (
          <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}
      </div>

      {clips.length > 0 && (
        <>
          <div className="rounded-xl bg-white p-5 shadow-sm">
            <ExportOptions project={project} value={options} onChange={setOptions} disabled={zipping} />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-slate-600">{clips.length} {clips.length === 1 ? "clip" : "clips"}</p>
            <div className="flex flex-wrap items-center gap-4">
              {zipping && (
                <span className="text-sm text-slate-600">
                  {zipJob?.message ?? "Preparing"} · {Math.round(zipJob?.progress ?? 0)}%
                </span>
              )}
              <button
                type="button"
                onClick={downloadAll}
                disabled={zipping || generating}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium transition hover:bg-slate-50 disabled:cursor-wait disabled:opacity-70"
              >
                Download all (ZIP)
              </button>
            </div>
          </div>
          <div
            className={`grid gap-4 ${vertical ? "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4" : "sm:grid-cols-2 lg:grid-cols-3"}`}
          >
            {clips.map((clip) => (
              <ClipCard key={clip.id} clip={clip} proxyUrl={api.proxyUrl(project.id)} settings={settings} />
            ))}
          </div>
        </>
      )}
    </section>
  );
}
