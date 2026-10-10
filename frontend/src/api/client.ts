export type ProjectStatus = "uploading" | "queued" | "processing" | "ready" | "failed";
export type JobStatus = "queued" | "running" | "succeeded" | "failed" | "canceled";

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
  download_url: string | null;
}

export type ClipSource = "simple" | "ai";

export interface Clip {
  id: string;
  project_id: string;
  source: ClipSource;
  index: number;
  start: number;
  end: number;
  duration: number;
  text: string;
  title: string | null;
  hook: string | null;
  score: number | null;
  reason: string | null;
  /** Where the clip was originally suggested (for "reset" after trimming). */
  suggested_start: number | null;
  suggested_end: number | null;
  thumbnail_url: string;
}

export type Aspect = "original" | "9:16";
export type VerticalFit = "crop" | "blur";

export type CaptionFont = "montserrat" | "poppins" | "anton" | "bebas";

export interface CaptionSettings {
  font: CaptionFont;
  text_color: string; // "#RRGGBB"
  highlight_color: string;
  outline_color: string;
  size: "small" | "medium" | "large";
  position: "bottom" | "middle" | "top";
  words_per_line: number; // 1-8
  uppercase: boolean;
}

export interface ExportSettings {
  /** "9:16" = 1080x1920 for YouTube Shorts / TikTok / Reels. */
  aspect: Aspect;
  /** How landscape footage fills the vertical frame (only for "9:16"). */
  vertical_fit: VerticalFit;
  /** Upscale clips whose shorter side is below 1080 px (only for "original"). */
  upscale_1080: boolean;
  /** Burned-in word-by-word captions; null = none. */
  captions: CaptionSettings | null;
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

export interface ProjectSummary {
  id: string;
  filename: string;
  status: ProjectStatus;
  created_at: string;
  expires_at: string;
  duration: number | null;
  clip_count: number;
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
  min_clip_seconds: number;
  max_clip_seconds: number;
  ai_enabled: boolean;
  claude_model: string;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export const NETWORK_ERROR = "Can't reach the Twapza server. Is it still running?";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, init);
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    throw new ApiError(0, NETWORK_ERROR);
  }
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
  listProjects: () => request<ProjectSummary[]>("/api/projects"),
  deleteProject: (id: string) => request<void>(`/api/projects/${id}`, { method: "DELETE" }),
  cancelJob: (id: string) => request<Job>(`/api/jobs/${id}/cancel`, { method: "POST" }),
  proxyUrl: (id: string) => `/api/projects/${id}/proxy`,
  getJob: (id: string) => request<Job>(`/api/jobs/${id}`),
  createSimpleClips: (projectId: string, target_seconds: number) =>
    request<Job>(`/api/projects/${projectId}/simple-clips`, json({ target_seconds })),
  createAiClips: (projectId: string) =>
    request<Job>(`/api/projects/${projectId}/ai-clips`, { method: "POST" }),
  trimClip: (clipId: string, start: number, end: number) =>
    request<Clip>(`/api/clips/${clipId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ start, end }),
    }),
  listClips: (projectId: string, source?: ClipSource) =>
    request<Clip[]>(`/api/projects/${projectId}/clips${source ? `?source=${source}` : ""}`),
  exportClip: (clipId: string, settings?: ExportSettings) =>
    request<Job>(`/api/clips/${clipId}/export`, json({ settings })),
  exportZip: (projectId: string, source: ClipSource, settings?: ExportSettings) =>
    request<Job>(`/api/projects/${projectId}/export-zip`, json({ source, settings })),
  jobEventsUrl: (id: string) => `/api/jobs/${id}/events`,
};
