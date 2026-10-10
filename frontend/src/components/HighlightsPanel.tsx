import { useEffect, useState } from "react";

import { api, type Clip, type ExportSettings, type Job, type Project } from "../api/client";
import { isFinished, watchJob } from "../lib/jobs";
import { DownloadAllButton } from "./DownloadAllButton";
import { HighlightCard } from "./HighlightCard";
import { JobProgress } from "./JobProgress";

interface Props {
  project: Project;
  settings: ExportSettings;
  aiEnabled: boolean;
  model?: string;
  maxLength?: number;
}

export function HighlightsPanel({ project, settings, aiEnabled, model, maxLength }: Props) {
  const [clips, setClips] = useState<Clip[]>([]);
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState<string | null>(null);
  const running = !!job && !isFinished(job);

  useEffect(() => {
    api.listClips(project.id, "ai").then(setClips).catch(() => {});
    const active = [...project.jobs].reverse().find((j) => j.type === "ai_clips" && !isFinished(j));
    if (active) follow(active);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id]);

  async function follow(next: Job) {
    setJob(next);
    const done = await watchJob(next.id, setJob);
    if (done.status === "failed") setError(done.error ?? "Finding highlights failed.");
    else setClips(await api.listClips(project.id, "ai"));
    setJob(null);
  }

  async function start() {
    setError(null);
    try {
      await follow(await api.createAiClips(project.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Finding highlights failed.");
      setJob(null);
    }
  }

  return (
    <section className="space-y-5">
      <div className="space-y-4 rounded-xl bg-white p-5 shadow-sm">
        <div>
          <h2 className="text-lg font-semibold">AI highlights</h2>
          <p className="text-sm text-slate-600">
            Claude reads the transcript and picks the strongest standalone moments (15–90 seconds):
            strong hooks, emotional peaks, surprising statements, humour and clear takeaways. They're
            refined with audio energy and scene changes, then ranked.
          </p>
        </div>

        {aiEnabled ? (
          <button
            type="button"
            onClick={start}
            disabled={running}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-500 disabled:cursor-wait disabled:bg-slate-300"
          >
            {clips.length ? "Find highlights again" : "Find highlights"}
          </button>
        ) : (
          <div className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
            To use AI highlights, add your Claude API key to the <code>.env</code> file
            (<code>ANTHROPIC_API_KEY=…</code>) and restart Twapza.
          </div>
        )}

        {running && job && <JobProgress job={job} />}
        {error && (
          <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}
        {model && aiEnabled && <p className="text-xs text-slate-400">Model: {model}</p>}
      </div>

      {clips.length > 0 && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-slate-600">
              {clips.length} {clips.length === 1 ? "highlight" : "highlights"}, best first
            </p>
            <DownloadAllButton projectId={project.id} source="ai" settings={settings} disabled={running} onError={setError} />
          </div>
          <div className="space-y-4">
            {clips.map((clip, i) => (
              <HighlightCard
                key={clip.id}
                clip={clip}
                rank={i + 1}
                proxyUrl={api.proxyUrl(project.id)}
                videoDuration={project.duration ?? clip.end}
                settings={settings}
                maxLength={maxLength}
                onChange={(next) => setClips((all) => all.map((c) => (c.id === next.id ? next : c)))}
              />
            ))}
          </div>
        </>
      )}
    </section>
  );
}
