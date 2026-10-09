import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { api, type PublicConfig } from "../api/client";
import { UploadForm } from "../components/UploadForm";
import { uploadFile } from "../lib/upload";

export function UploadPage() {
  const navigate = useNavigate();
  const [config, setConfig] = useState<PublicConfig | null>(null);

  useEffect(() => {
    api.config().then(setConfig).catch(() => setConfig(null));
  }, []);

  return (
    <div className="mx-auto max-w-xl">
      <h1 className="mb-1 text-2xl font-semibold">Upload a video</h1>
      <p className="mb-6 text-slate-600">
        Upload your own long-form video and Twapza will help you turn it into short clips.
        {config && ` Files are deleted automatically after ${config.retention_hours} hours.`}
      </p>
      <UploadForm
        maxBytes={config?.max_upload_bytes}
        allowedExtensions={config?.allowed_extensions}
        onUpload={async (file, onProgress) => {
          const { project } = await uploadFile(file, true, { onProgress });
          navigate(`/projects/${project.id}`);
        }}
      />
    </div>
  );
}
