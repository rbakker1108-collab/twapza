export type ProjectStatus = "uploading" | "queued" | "processing" | "ready" | "failed";
export type JobStatus = "queued" | "running" | "succeeded" | "failed";

export interface Job {
  id: string;
  project_id: string;
  type: string;
  status: JobStatus;
  progress: number;
  message: string | null;
  error: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
}

export interface Project {
  id: string;
  filename: string;
  size_bytes: number;
  status: ProjectStatus;
  error: string | null;
  created_at: string;
  expires_at: string;
  rights_confirmed_at: string;
  duration: number | null;
  width: number | null;
  height: number | null;
  fps: number | null;
  has_audio: boolean | null;
  jobs: Job[];
}

export interface UploadSession {
  project_id: string;
  chunk_size: number;
  total_chunks: number;
  received_chunks: number[];
}

export interface PublicConfig {
  max_upload_bytes: number;
  max_duration_seconds: number;
  allowed_extensions: string[];
  retention_hours: number;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init);
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      const detail = body?.detail;
      if (typeof detail === "string") message = detail;
      else if (detail?.message) message = detail.message;
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(res.status, message);
  }
  return (res.status === 204 ? undefined : await res.json()) as T;
}

const json = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

export const api = {
  config: () => request<PublicConfig>("/api/config"),
  createUpload: (filename: string, size_bytes: number, rights_confirmed: boolean) =>
    request<UploadSession>("/api/uploads", json({ filename, size_bytes, rights_confirmed })),
  getUpload: (id: string) => request<UploadSession>(`/api/uploads/${id}`),
  putChunk: (id: string, index: number, body: Blob, signal?: AbortSignal) =>
    request<void>(`/api/uploads/${id}/chunks/${index}`, { method: "PUT", body, signal }),
  completeUpload: (id: string) =>
    request<{ project: Project; job: Job }>(`/api/uploads/${id}/complete`, { method: "POST" }),
  getProject: (id: string) => request<Project>(`/api/projects/${id}`),
  proxyUrl: (id: string) => `/api/projects/${id}/proxy`,
  jobEventsUrl: (id: string) => `/api/jobs/${id}/events`,
};
