import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { api, type ProjectSummary } from "../api/client";
import { formatDuration } from "../lib/format";

const STATUS: Record<ProjectSummary["status"], { label: string; tone: string }> = {
  uploading: { label: "Upload unfinished", tone: "bg-amber-100 text-amber-800" },
  queued: { label: "Waiting", tone: "bg-slate-200 text-slate-700" },
  processing: { label: "Processing", tone: "bg-indigo-100 text-indigo-800" },
  ready: { label: "Ready", tone: "bg-emerald-100 text-emerald-800" },
  failed: { label: "Failed", tone: "bg-red-100 text-red-800" },
};

export function timeLeft(expiresAt: string, now = Date.now()): string {
  const minutes = Math.max(0, Math.round((new Date(expiresAt).getTime() - now) / 60000));
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}

export function RecentProjects() {
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.listProjects().then(setProjects).catch((err) => setError(err.message));
  }, []);

  async function remove(p: ProjectSummary) {
    if (!window.confirm(`Delete "${p.filename}" and all its clips now? This can't be undone.`)) return;
    try {
      await api.deleteProject(p.id);
      setProjects((all) => all?.filter((x) => x.id !== p.id) ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Deleting failed.");
    }
  }

  if (error) return <p className="text-sm text-red-700">{error}</p>;
  if (!projects?.length) return null;

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">Your recent projects</h2>
      <ul className="divide-y divide-slate-200 overflow-hidden rounded-xl bg-white shadow-sm">
        {projects.map((p) => (
          <li key={p.id} className="flex items-center gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <Link to={`/projects/${p.id}`} className="block truncate font-medium text-indigo-700 hover:underline">
                {p.filename}
              </Link>
              <p className="text-sm text-slate-500">
                {p.duration != null && `${formatDuration(p.duration)} · `}
                {p.clip_count} {p.clip_count === 1 ? "clip" : "clips"} · deleted in {timeLeft(p.expires_at)}
              </p>
            </div>
            <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${STATUS[p.status].tone}`}>
              {STATUS[p.status].label}
            </span>
            <button
              type="button"
              onClick={() => remove(p)}
              aria-label={`Delete ${p.filename}`}
              className="shrink-0 rounded-lg px-2 py-1 text-sm text-slate-500 hover:bg-red-50 hover:text-red-700"
            >
              Delete
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
