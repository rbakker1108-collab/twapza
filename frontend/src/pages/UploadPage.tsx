import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { api, type PublicConfig } from "../api/client";
import { useAuth } from "../auth/AuthProvider";
import { RecentProjects } from "../components/RecentProjects";
import { UploadForm } from "../components/UploadForm";
import { YoutubeImportForm } from "../components/YoutubeImportForm";
import { useT } from "../i18n";
import { clearPendingLink, readPendingLink } from "../lib/pendingLink";
import { uploadFile } from "../lib/upload";

type Source = "youtube" | "file";

export function UploadPage() {
  const t = useT();
  const navigate = useNavigate();
  const [config, setConfig] = useState<PublicConfig | null>(null);
  const [source, setSource] = useState<Source>("youtube");
  const { account, refresh } = useAuth();
  // A link pasted on the website before signing up waits here until it is imported.
  const [pendingLink] = useState(() => readPendingLink());

  useEffect(() => {
    api.config().then(setConfig).catch(() => setConfig(null));
    void refresh(); // minutes used may have changed since the last visit
  }, [refresh]);

  // The longest video allowed: the server limit, or the plan's if that is lower.
  const planMax = account ? account.plan.max_video_minutes * 60 : Infinity;
  const maxDuration = config ? Math.min(config.max_duration_seconds, planMax) : undefined;

  const youtube = config?.youtube_enabled !== false;
  const active: Source = youtube ? source : "file";

  const tab = (id: Source, label: string) => (
    <button
      type="button"
      role="tab"
      aria-selected={active === id}
      onClick={() => setSource(id)}
      className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition ${
        active === id ? "bg-surface-3 text-ink shadow-sm" : "text-muted hover:text-ink"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-16">
      <section className="relative mx-auto max-w-2xl text-center">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 -top-24 -z-10 mx-auto h-72 max-w-xl rounded-full bg-brand-500/20 blur-3xl"
        />
        <span className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-xs font-medium text-ink-soft">
          <span className="h-1.5 w-1.5 rounded-full bg-brand-500" />
          {t("AI clipping for creators")}
        </span>
        <h1 className="mt-5 text-4xl font-semibold tracking-tight sm:text-5xl">
          {t("Turn long videos into")} <span className="text-gradient-brand">{t("viral Shorts")}</span>
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-lg text-muted">
          {t("Twapza finds the best moments, adds captions and hooks, and lets you edit every clip before you download it.")}
        </p>

        <div className="mt-8 rounded-2xl border border-line bg-surface p-5 text-start shadow-2xl shadow-black/40 sm:p-6">
          {youtube && (
            <div role="tablist" className="mb-5 flex gap-1 rounded-xl bg-surface-2 p-1">
              {tab("youtube", t("Paste a YouTube link"))}
              {tab("file", t("Upload a file"))}
            </div>
          )}
          {active === "youtube" ? (
            <YoutubeImportForm
              initialUrl={pendingLink ?? undefined}
              onImport={async (url) => {
                const { project } = await api.importYoutube(url, true);
                clearPendingLink();
                navigate(`/projects/${project.id}`);
              }}
            />
          ) : (
            <UploadForm
              maxBytes={config?.max_upload_bytes}
              maxDurationSeconds={maxDuration}
              allowedExtensions={config?.allowed_extensions}
              onUpload={async (file, onProgress, signal) => {
                const { project } = await uploadFile(file, true, { onProgress, signal });
                navigate(`/projects/${project.id}`);
              }}
            />
          )}
        </div>
        {account && (
          <p className="mt-4 text-sm text-muted" data-testid="usage">
            {t("Video minutes this month")}:{" "}
            <span className="font-medium text-ink">
              {t("{used} of {limit} min", {
                used: Math.round(Math.min(account.usage.used_minutes, account.usage.limit_minutes)),
                limit: account.usage.limit_minutes,
              })}
            </span>
            {account.plan.id !== "pro" && (
              <>
                {" · "}
                <Link to="/account#plans" className="text-brand-400 hover:underline">
                  {t("Upgrade")}
                </Link>
              </>
            )}
          </p>
        )}
        {config && (
          <p className="mt-1 text-sm text-faint">
            {t("Everything is deleted automatically after {hours} hours.", { hours: config.retention_hours })}
          </p>
        )}
      </section>

      <RecentProjects />
    </div>
  );
}
