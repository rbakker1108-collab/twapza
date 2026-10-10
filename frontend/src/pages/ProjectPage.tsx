import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { api, type Job, type Project, type PublicConfig } from "../api/client";
import { ProgressBar } from "../components/ProgressBar";
import { ClipsWorkspace } from "../components/ClipsWorkspace";
import { JobProgress } from "../components/JobProgress";
import { useJob } from "../hooks/useJob";
import { formatBytes, formatDuration } from "../lib/format";

const isDone = (job: Job) => job.status === "succeeded" || job.status === "failed" || job.status === "canceled";

const latest = (jobs: Job[], type: string) => [...jobs].reverse().find((j) => j.type === type) ?? null;

function TranscriptStatus({ job, hasAudio }: { job: Job | null; hasAudio: boolean | null }) {
  if (hasAudio === false) return <p className="text-sm text-slate-500">No audio track: clips will be cut at exact intervals.</p>;
  if (!job) return null;
  if (job.status === "succeeded") return <p className="text-sm text-emerald-700">✓ Transcript ready</p>;
  if (job.status === "canceled")
    return <p className="text-sm text-slate-500">Transcription was canceled. It will run again when you generate clips.</p>;
  if (job.status === "failed")
    return <p className="text-sm text-red-700">Transcription failed: {job.error}. Generating clips will retry it.</p>;
  return (
    <div className="max-w-md">
      <ProgressBar value={job.progress} label={job.status === "queued" ? "Transcription queued" : (job.message ?? "Transcribing")} />
    </div>
  );
}

export function ProjectPage() {
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
        <p className="rounded-lg bg-red-50 px-3 py-2 text-red-700">{loadError}</p>
        <Link to="/" className="text-indigo-600 hover:underline">
          Upload another video
        </Link>
      </div>
    );
  }
  if (!project) return <p className="text-slate-500">Loading…</p>;

  const importing = !!importJob && !ingest && !isDone(importJob);
  const failed =
    project.status === "failed" || ingest?.status === "failed" ||
    (!ingest && !!importJob && (importJob.status === "failed" || importJob.status === "canceled"));
  const failure =
    ingest?.error ?? (importJob?.status === "canceled" ? "Import was canceled." : importJob?.error) ?? project.error;
  const ready = project.status === "ready";

  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold break-all">{project.filename}</h1>
        <p className="text-sm text-slate-500">
          {project.size_bytes > 0 ? formatBytes(project.size_bytes) : project.source_url ? "YouTube import" : ""}
          {project.duration != null && ` · ${formatDuration(project.duration)}`}
          {project.width != null && ` · ${project.width}×${project.height}`}
          {" · expires "}
          {new Date(project.expires_at).toLocaleString()}
        </p>
        {project.source_url && (
          <p className="text-sm">
            <a href={project.source_url} target="_blank" rel="noreferrer" className="text-indigo-700 hover:underline">
              {project.source_url}
            </a>
          </p>
        )}
        {ready && <TranscriptStatus job={transcribe} hasAudio={project.has_audio} />}
      </div>

      {ready ? (
        <>
          <video
            src={api.proxyUrl(project.id)}
            controls
            preload="metadata"
            className="aspect-video w-full max-w-3xl rounded-xl bg-black"
          />
          <ClipsWorkspace project={project} config={config} />
        </>
      ) : failed ? (
        <div className="space-y-3 rounded-xl bg-white p-6 shadow-sm">
          <p className="font-medium text-red-700">{project.source_url && !ingest ? "Import failed" : "Processing failed"}</p>
          <p className="text-sm text-slate-600">{failure}</p>
          <Link to="/" className="text-indigo-600 hover:underline">
            {project.source_url ? "Try again" : "Try another file"}
          </Link>
        </div>
      ) : importing && importJob ? (
        <div className="rounded-xl bg-white p-6 shadow-sm">
          <JobProgress job={importJob} fallbackLabel="Downloading from YouTube" />
        </div>
      ) : (
        <div className="rounded-xl bg-white p-6 shadow-sm">
          <ProgressBar value={ingest?.progress ?? 0} label={ingest?.message ?? "Waiting for a worker…"} />
        </div>
      )}
    </div>
  );
}
