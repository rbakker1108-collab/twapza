import { useEffect, useState } from "react";

import { api, type Clip, type ExportSettings, type Job, type Project } from "../api/client";
import { useT } from "../i18n";
import { isFinished, watchJob } from "../lib/jobs";
import { ClipCard } from "./ClipCard";
import { DownloadAllButton } from "./DownloadAllButton";
import { JobProgress } from "./JobProgress";

interface Props {
  project: Project;
  settings: ExportSettings;
  minSeconds?: number;
  maxSeconds?: number;
  onSettingsChange?: (settings: ExportSettings) => void;
}

const DEFAULT_LENGTH = 60;

export function SimpleClipsPanel({ project, settings, minSeconds = 15, maxSeconds = 180, onSettingsChange }: Props) {
  const t = useT();
  const [length, setLength] = useState(DEFAULT_LENGTH);
  const [clips, setClips] = useState<Clip[]>([]);
  const [genJob, setGenJob] = useState<Job | null>(null);
  const [error, setError] = useState<string | null>(null);
  const vertical = settings.aspect === "9:16";
  const generating = !!genJob && !isFinished(genJob);

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
    if (done.status === "failed") setError(done.error ?? t(t("Generating clips failed.")));
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

  const estimate = project.duration ? Math.max(1, Math.round(project.duration / length)) : null;

  return (
    <section className="space-y-5">
      <div className="space-y-4 rounded-2xl border border-line bg-surface p-5">
        <div>
          <h2 className="text-lg font-semibold">{t("Simple clips")}</h2>
          <p className="text-sm text-muted">
            {t("Split the whole video into clips of about the same length. Cuts land on natural pauses and sentence ends (within 5 seconds of the target).")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <label htmlFor="clip-length" className="text-sm font-medium">
            {t("Clip length")}
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
            className="w-56 accent-brand-500"
          />
          <span className="w-28 text-sm tabular-nums text-ink-soft">
            {length}s{estimate ? ` ${t("(~{n} clips)", { n: estimate })}` : ""}
          </span>
          <button
            type="button"
            onClick={generate}
            disabled={generating}
            className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-black transition hover:bg-brand-400 disabled:cursor-wait disabled:bg-surface-3 disabled:text-faint"
          >
            {clips.length ? t("Regenerate clips") : t("Generate clips")}
          </button>
        </div>
        {generating && genJob && <JobProgress job={genJob} />}
        {error && (
          <p role="alert" className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">
            {error}
          </p>
        )}
      </div>

      {clips.length > 0 && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted">{clips.length === 1 ? t("1 clip") : t("{n} clips", { n: clips.length })}</p>
            <DownloadAllButton
              projectId={project.id}
              source="simple"
              settings={settings}
              disabled={generating}
              onError={setError}
            />
          </div>
          <div
            className={`grid gap-4 ${vertical ? "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4" : "sm:grid-cols-2 lg:grid-cols-3"}`}
          >
            {clips.map((clip) => (
              <ClipCard
                key={clip.id}
                clip={clip}
                proxyUrl={api.proxyUrl(project.id)}
                settings={settings}
                project={project}
                onSettingsChange={onSettingsChange}
              />
            ))}
          </div>
        </>
      )}
    </section>
  );
}
