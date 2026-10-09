import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { api, type Project } from "../api/client";
import { ProgressBar } from "../components/ProgressBar";
import { useJob } from "../hooks/useJob";
import { formatBytes, formatDuration } from "../lib/format";

export function ProjectPage() {
  const { projectId = "" } = useParams();
  const [project, setProject] = useState<Project | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const ingest = project?.jobs.find((j) => j.type === "ingest") ?? null;
  const job = useJob(ingest && ingest.status !== "succeeded" ? ingest.id : null, ingest);

  useEffect(() => {
    api
      .getProject(projectId)
      .then(setProject)
      .catch((err) => setLoadError(err.message));
  }, [projectId]);

  // Refresh project metadata once its processing job finishes.
  useEffect(() => {
    if (job?.status === "succeeded" || job?.status === "failed") {
      api.getProject(projectId).then(setProject).catch(() => {});
    }
  }, [job?.status, projectId]);

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

  const failed = project.status === "failed" || job?.status === "failed";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold break-all">{project.filename}</h1>
        <p className="text-sm text-slate-500">
          {formatBytes(project.size_bytes)}
          {project.duration != null && ` · ${formatDuration(project.duration)}`}
          {project.width != null && ` · ${project.width}×${project.height}`}
          {" · expires "}
          {new Date(project.expires_at).toLocaleString()}
        </p>
      </div>

      {project.status === "ready" ? (
        <video
          src={api.proxyUrl(project.id)}
          controls
          preload="metadata"
          className="aspect-video w-full rounded-xl bg-black"
        />
      ) : failed ? (
        <div className="space-y-3 rounded-xl bg-white p-6 shadow-sm">
          <p className="font-medium text-red-700">Processing failed</p>
          <p className="text-sm text-slate-600">{job?.error ?? project.error}</p>
          <Link to="/" className="text-indigo-600 hover:underline">
            Try another file
          </Link>
        </div>
      ) : (
        <div className="rounded-xl bg-white p-6 shadow-sm">
          <ProgressBar value={job?.progress ?? 0} label={job?.message ?? "Waiting for a worker…"} />
        </div>
      )}
    </div>
  );
}
