import { useEffect, useState } from "react";

import { api, type Clip, type ExportSettings, type Job, type Project } from "../api/client";
import { useT } from "../i18n";
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
  /** Lets the clip editor change the shared download settings. */
  onSettingsChange?: (settings: ExportSettings) => void;
}

export function HighlightsPanel({ project, settings, aiEnabled, model, maxLength, onSettingsChange }: Props) {
  const t = useT();
  const [clips, setClips] = useState<Clip[]>([]);
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [short, setShort] = useState(false);
  const [focus, setFocus] = useState("");
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
    if (done.status === "failed") setError(done.error ?? t("Finding highlights failed."));
    else setClips(await api.listClips(project.id, "ai"));
    setJob(null);
  }

  async function start() {
    setError(null);
    try {
      await follow(await api.createAiClips(project.id, short, focus));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("Finding highlights failed."));
      setJob(null);
    }
  }

  return (
    <section className="space-y-5">
      <div className="space-y-4 rounded-2xl border border-line bg-surface p-5">
        <div>
          <h2 className="text-lg font-semibold">{t("AI highlights")}</h2>
          <p className="text-sm text-muted">
            {t("Claude reads the transcript and picks the strongest standalone moments (15–90 seconds): strong hooks, emotional peaks, surprising statements, humour and clear takeaways. They're refined with audio energy and scene changes, then ranked.")}
          </p>
        </div>

        {aiEnabled && (
          <label className="block max-w-xl space-y-1 text-sm">
            <span className="font-medium">
              {t("Look for")} <span className="font-normal text-muted">{t("(optional)")}</span>
            </span>
            <input
              type="text"
              value={focus}
              maxLength={300}
              disabled={running}
              onChange={(e) => setFocus(e.target.value)}
              placeholder={t("e.g. funny moments, money tips, the story about the jungle")}
              className="w-full rounded-lg border border-line-strong bg-surface-2 px-3 py-2"
            />
          </label>
        )}

        {aiEnabled ? (
          <div className="flex flex-wrap items-center gap-4">
            <button
              type="button"
              onClick={start}
              disabled={running}
              className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-black transition hover:bg-brand-400 disabled:cursor-wait disabled:bg-surface-3 disabled:text-faint"
            >
              {clips.length ? t("Find highlights again") : t("Find highlights")}
            </button>
            <label
              className="flex items-center gap-2 text-sm"
              title={t("Aims for 20–45 second moments that end on a punchline, reveal or question, so the Short replays smoothly.")}
            >
              <input
                type="checkbox"
                className="h-4 w-4 accent-brand-500"
                checked={short}
                disabled={running}
                onChange={(e) => setShort(e.target.checked)}
              />
              {t("Short & loopable")} <span className="text-muted">(20–45 s)</span>
            </label>
          </div>
        ) : (
          <div className="rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-300">
            {t("To use AI highlights, add your Claude API key to the .env file (ANTHROPIC_API_KEY=…) and restart Twapza.")}
          </div>
        )}

        {running && job && <JobProgress job={job} />}
        {error && (
          <p role="alert" className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">
            {error}
          </p>
        )}
        {model && aiEnabled && <p className="text-xs text-faint">{t("Model: {model}", { model })}</p>}
      </div>

      {clips.length > 0 && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted">
              {clips.length === 1 ? t("1 highlight, best first") : t("{n} highlights, best first", { n: clips.length })}
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
                project={project}
                onSettingsChange={onSettingsChange}
                onChange={(next) => setClips((all) => all.map((c) => (c.id === next.id ? next : c)))}
              />
            ))}
          </div>
        </>
      )}
    </section>
  );
}
