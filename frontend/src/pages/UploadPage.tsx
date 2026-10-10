import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { api, type PublicConfig } from "../api/client";
import { RecentProjects } from "../components/RecentProjects";
import { UploadForm } from "../components/UploadForm";
import { YoutubeImportForm } from "../components/YoutubeImportForm";
import { uploadFile } from "../lib/upload";

type Source = "youtube" | "file";

export function UploadPage() {
  const navigate = useNavigate();
  const [config, setConfig] = useState<PublicConfig | null>(null);
  const [source, setSource] = useState<Source>("youtube");

  useEffect(() => {
    api.config().then(setConfig).catch(() => setConfig(null));
  }, []);

  const youtube = config?.youtube_enabled !== false;
  const active: Source = youtube ? source : "file";

  const tab = (id: Source, label: string) => (
    <button
      type="button"
      role="tab"
      aria-selected={active === id}
      onClick={() => setSource(id)}
      className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition ${
        active === id ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="mx-auto max-w-xl space-y-10">
      <div>
        <h1 className="mb-1 text-2xl font-semibold">Turn your video into Shorts</h1>
        <p className="mb-6 text-slate-600">
          Paste a link to your YouTube video or upload the file, and Twapza finds the moments that work
          as Shorts.
          {config && ` Everything is deleted automatically after ${config.retention_hours} hours.`}
        </p>
        {youtube && (
          <div role="tablist" className="mb-6 flex gap-1 rounded-lg bg-slate-200/70 p-1">
            {tab("youtube", "Paste a YouTube link")}
            {tab("file", "Upload a file")}
          </div>
        )}
        {active === "youtube" ? (
          <YoutubeImportForm
            onImport={async (url) => {
              const { project } = await api.importYoutube(url, true);
              navigate(`/projects/${project.id}`);
            }}
          />
        ) : (
          <UploadForm
            maxBytes={config?.max_upload_bytes}
            maxDurationSeconds={config?.max_duration_seconds}
            allowedExtensions={config?.allowed_extensions}
            onUpload={async (file, onProgress, signal) => {
              const { project } = await uploadFile(file, true, { onProgress, signal });
              navigate(`/projects/${project.id}`);
            }}
          />
        )}
      </div>
      <RecentProjects />
    </div>
  );
}
