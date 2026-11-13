import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { api, type ProjectSummary } from "../api/client";
import { format, msg, useT, type Vars } from "../i18n";
import { formatDuration } from "../lib/format";

const STATUS: Record<ProjectSummary["status"], { label: string; tone: string }> = {
  uploading: { label: msg("Upload unfinished"), tone: "bg-amber-500/15 text-amber-300" },
  queued: { label: msg("Waiting"), tone: "bg-surface-3 text-ink-soft" },
  processing: { label: msg("Processing"), tone: "bg-brand-500/15 text-brand-300" },
  ready: { label: msg("Ready"), tone: "bg-emerald-500/15 text-emerald-300" },
  failed: { label: msg("Failed"), tone: "bg-red-500/15 text-red-300" },
};

export function timeLeft(expiresAt: string, now = Date.now(),
                         t: (text: string, vars?: Vars) => string = format): string {
  const minutes = Math.max(0, Math.round((new Date(expiresAt).getTime() - now) / 60000));
  if (minutes < 60) return t("{m} min", { m: minutes });
  return t("{h} h {m} min", { h: Math.floor(minutes / 60), m: minutes % 60 });
}

export function RecentProjects() {
  const t = useT();
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.listProjects().then(setProjects).catch((err) => setError(err.message));
  }, []);

  async function remove(p: ProjectSummary) {
    if (!window.confirm(t("Delete “{name}” and all its clips now? This can't be undone.", { name: p.filename }))) return;
    try {
      await api.deleteProject(p.id);
      setProjects((all) => all?.filter((x) => x.id !== p.id) ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("Deleting failed."));
    }
  }

  if (error) return <p className="text-sm text-red-400">{error}</p>;
  if (!projects?.length) return null;

  return (
    <section className="space-y-4">
      <h2 className="text-xl font-semibold tracking-tight">{t("Your projects")}</h2>
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {projects.map((p) => (
          <li key={p.id} className="group relative flex flex-col overflow-hidden rounded-2xl border border-line bg-surface transition hover:border-line-strong">
            <div className="flex aspect-video items-center justify-center bg-gradient-to-br from-surface-3 via-surface-2 to-canvas">
              <svg viewBox="0 0 24 24" className="h-10 w-10 text-faint transition group-hover:text-brand-400" aria-hidden>
                <path fill="currentColor" d="M4 5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5Zm6 3.5v7l5.5-3.5L10 8.5Z" />
              </svg>
            </div>
            <div className="flex flex-1 flex-col gap-2 p-4">
              <div className="flex items-start gap-2">
                <Link
                  to={`/projects/${p.id}`}
                  className="min-w-0 flex-1 truncate font-medium text-ink after:absolute after:inset-0 hover:text-brand-400"
                >
                  {p.filename}
                </Link>
                <span className={`relative shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${STATUS[p.status].tone}`}>
                  {t(STATUS[p.status].label)}
                </span>
              </div>
              <p className="text-sm text-muted">
                {p.duration != null && `${formatDuration(p.duration)} · `}
                {p.clip_count === 1 ? t("1 clip") : t("{n} clips", { n: p.clip_count })}
                {" · "}
                {t("deleted in {time}", { time: timeLeft(p.expires_at, Date.now(), t) })}
              </p>
              <button
                type="button"
                onClick={() => remove(p)}
                aria-label={t("Delete {name}", { name: p.filename })}
                className="relative z-10 mt-auto self-start rounded-lg px-2 py-1 text-sm text-faint transition hover:bg-red-500/10 hover:text-red-300"
              >
                {t("Delete")}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
