import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { api, type Job, type Project, type PublicConfig } from "../api/client";
import { ProgressBar } from "../components/ProgressBar";
import { ClipsWorkspace } from "../components/ClipsWorkspace";
import { CreditEditor } from "../components/CreditEditor";
import { JobProgress } from "../components/JobProgress";
import { useJob } from "../hooks/useJob";
import { useI18n } from "../i18n";
import { formatBytes, formatDuration } from "../lib/format";

const isDone = (job: Job) => job.status === "succeeded" || job.status === "failed" || job.status === "canceled";

const latest = (jobs: Job[], type: string) => [...jobs].reverse().find((j) => j.type === type) ?? null;

function TranscriptStatus({ job, hasAudio }: { job: Job | null; hasAudio: boolean | null }) {
  const { t } = useI18n();
  if (hasAudio === false) return <p className="text-sm text-muted">{t("No audio track: clips will be cut at exact intervals.")}</p>;
  if (!job) return null;
  if (job.status === "succeeded") return <p className="text-sm text-emerald-400">✓ {t("Subtitles ready")}</p>;
  if (job.status === "canceled")
    return <p className="text-sm text-muted">{t("Transcription was canceled. It will run again when you generate clips.")}</p>;
  if (job.status === "failed")
    return <p className="text-sm text-red-400">{t("Transcription failed: {error}. Generating clips will retry it.", { error: job.error ?? "" })}</p>;
  return (
    <div className="max-w-md">
      <ProgressBar value={job.progress} label={job.status === "queued" ? t("Subtitles queued") : t("Creating subtitles…")} />
    </div>
  );
}

type StepState = "done" | "active" | "todo";

/** Upload → Preview & subtitles → Find clips → Edit & download. */
export function Steps({ steps }: { steps: { label: string; state: StepState }[] }) {
  return (
    <ol className="flex flex-wrap items-center gap-x-2 gap-y-2 text-sm" aria-label="Progress">
      {steps.map((s, i) => (
        <li key={s.label} className="flex items-center gap-2" aria-current={s.state === "active" ? "step" : undefined}>
          <span
            className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
              s.state === "done"
                ? "bg-brand-500 text-black"
                : s.state === "active"
                  ? "border-2 border-brand-500 text-brand-400"
                  : "border border-line-strong text-faint"
            }`}
          >
            {s.state === "done" ? "✓" : i + 1}
          </span>
          <span className={s.state === "todo" ? "text-faint" : s.state === "active" ? "font-medium text-ink" : "text-ink-soft"}>
            {s.label}
          </span>
          {i < steps.length - 1 && <span className="mx-1 h-px w-6 bg-line-strong sm:w-10" aria-hidden />}
        </li>
      ))}
    </ol>
  );
}

export function ProjectPage() {
  const { t, lang } = useI18n();
  const { projectId = "" } = useParams();
  const [project, setProject] = useState<Project | null>(null);
  const [config, setConfig] = useState<PublicConfig | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const importJob = useJob(project ? latest(project.jobs, "import") : null);
  const ingest = useJob(project ? latest(project.jobs, "ingest") : null);
  const transcribe = useJob(project ? latest(project.jobs, "transcribe") : null);

  const reload = () =>
    api
      .getProject(projectId)
      .then(setProject)
      .catch((err) => setLoadError(err.message));

  useEffect(() => {
    reload();
    api.config().then(setConfig).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  // Refresh once ingest finishes (metadata + the transcription job it queued).
  useEffect(() => {
    if (ingest && (ingest.status === "succeeded" || ingest.status === "failed") && project?.status !== "ready") {
      reload();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ingest?.status]);

  // Refresh once a YouTube import finishes (title, size and the ingest job it queued).
  useEffect(() => {
    if (importJob && isDone(importJob) && !project?.jobs.some((j) => j.type === "ingest")) reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [importJob?.status]);

  if (loadError) {
    return (
      <div className="mx-auto max-w-xl space-y-4">
        <p className="rounded-lg bg-red-500/10 px-3 py-2 text-red-400">{loadError}</p>
        <Link to="/app" className="text-brand-400 hover:underline">
          {t("Upload another video")}
        </Link>
      </div>
    );
  }
  if (!project) return <p className="text-muted">{t("Loading…")}</p>;

  const importing = !!importJob && !ingest && !isDone(importJob);
  const failed =
    project.status === "failed" || ingest?.status === "failed" ||
    (!ingest && !!importJob && (importJob.status === "failed" || importJob.status === "canceled"));
  const failure =
    ingest?.error ?? (importJob?.status === "canceled" ? t("Import was canceled.") : importJob?.error) ?? project.error;
  const ready = project.status === "ready";
  const subtitlesDone = project.has_audio === false || transcribe?.status === "succeeded";
  const steps: { label: string; state: StepState }[] = [
    { label: t("Upload"), state: "done" },
    { label: t("Preview & subtitles"), state: ready && subtitlesDone ? "done" : failed ? "todo" : "active" },
    { label: t("Find clips"), state: ready ? "active" : "todo" },
    { label: t("Edit & download"), state: "todo" },
  ];

  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <Steps steps={steps} />
        <div className="space-y-1">
          <h1 className="break-all text-2xl font-semibold tracking-tight sm:text-3xl">{project.filename}</h1>
          <p className="text-sm text-muted">
            {project.size_bytes > 0 ? formatBytes(project.size_bytes) : project.source_url ? t("YouTube import") : ""}
            {project.duration != null && ` · ${formatDuration(project.duration)}`}
            {project.width != null && ` · ${project.width}×${project.height}`}
            {" · "}
            {t("deleted on {date}", { date: new Date(project.expires_at).toLocaleString(lang, { dateStyle: "medium", timeStyle: "short" }) })}
          </p>
          {project.source_url && (
            <p className="text-sm">
              <a href={project.source_url} target="_blank" rel="noreferrer" className="text-brand-400 hover:underline" dir="ltr">
                {project.source_url}
              </a>
            </p>
          )}
          {ready && <TranscriptStatus job={transcribe} hasAudio={project.has_audio} />}
        </div>
      </div>

      {ready ? (
        <>
          <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
            <video
              src={api.proxyUrl(project.id)}
              controls
              preload="metadata"
              className="aspect-video w-full rounded-2xl border border-line bg-black"
            />
            <CreditEditor project={project} onSaved={(p) => setProject({ ...project, ...p, jobs: project.jobs })} />
          </div>
          <ClipsWorkspace project={project} config={config} />
        </>
      ) : failed ? (
        <div className="space-y-3 rounded-2xl border border-line bg-surface p-6">
          <p className="font-medium text-red-400">{project.source_url && !ingest ? t("Import failed") : t("Processing failed")}</p>
          <p className="text-sm text-muted">{failure}</p>
          <Link to="/app" className="text-brand-400 hover:underline">
            {project.source_url ? t("Try again") : t("Try another file")}
          </Link>
        </div>
      ) : importing && importJob ? (
        <div className="rounded-2xl border border-line bg-surface p-6">
          <JobProgress job={importJob} fallbackLabel={t("Downloading from YouTube")} />
        </div>
      ) : (
        <div className="rounded-2xl border border-line bg-surface p-6">
          <ProgressBar value={ingest?.progress ?? 0} label={ingest?.message ?? t("Waiting for a worker…")} />
        </div>
      )}
    </div>
  );
}
