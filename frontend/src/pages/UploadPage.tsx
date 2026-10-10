import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { api, type PublicConfig } from "../api/client";
import { RecentProjects } from "../components/RecentProjects";
import { UploadForm } from "../components/UploadForm";
import { uploadFile } from "../lib/upload";

export function UploadPage() {
  const navigate = useNavigate();
  const [config, setConfig] = useState<PublicConfig | null>(null);

  useEffect(() => {
    api.config().then(setConfig).catch(() => setConfig(null));
  }, []);

  return (
    <div className="mx-auto max-w-xl space-y-10">
      <div>
        <h1 className="mb-1 text-2xl font-semibold">Upload a video</h1>
        <p className="mb-6 text-slate-600">
          Upload your own long-form video and Twapza will help you turn it into short clips.
          {config && ` Files are deleted automatically after ${config.retention_hours} hours.`}
        </p>
        <UploadForm
          maxBytes={config?.max_upload_bytes}
          maxDurationSeconds={config?.max_duration_seconds}
          allowedExtensions={config?.allowed_extensions}
          onUpload={async (file, onProgress, signal) => {
            const { project } = await uploadFile(file, true, { onProgress, signal });
            navigate(`/projects/${project.id}`);
          }}
        />
      </div>
      <RecentProjects />
    </div>
  );
}
