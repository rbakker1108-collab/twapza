import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { api, type Job, type Project, type PublicConfig } from "../api/client";
import { ProgressBar } from "../components/ProgressBar";
import { ClipsWorkspace } from "../components/ClipsWorkspace";
import { useJob } from "../hooks/useJob";
import { formatBytes, formatDuration } from "../lib/format";

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

  const failed = project.status === "failed" || ingest?.status === "failed";
  const ready = project.status === "ready";

  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold break-all">{project.filename}</h1>
        <p className="text-sm text-slate-500">
          {formatBytes(project.size_bytes)}
          {project.duration != null && ` · ${formatDuration(project.duration)}`}
          {project.width != null && ` · ${project.width}×${project.height}`}
          {" · expires "}
          {new Date(project.expires_at).toLocaleString()}
        </p>
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
          <p className="font-medium text-red-700">Processing failed</p>
          <p className="text-sm text-slate-600">{ingest?.error ?? project.error}</p>
          <Link to="/" className="text-indigo-600 hover:underline">
            Try another file
          </Link>
        </div>
      ) : (
        <div className="rounded-xl bg-white p-6 shadow-sm">
          <ProgressBar value={ingest?.progress ?? 0} label={ingest?.message ?? "Waiting for a worker…"} />
        </div>
      )}
    </div>
  );
}
