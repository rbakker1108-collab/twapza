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
/** blur = whole frame over a blurred copy, bars = whole frame on black, crop = fill (cuts the sides). */
export type VerticalFit = "blur" | "bars" | "crop";

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
  /** Optional retention boosts: the clip title as text on the first 3 seconds, */
  hook_text: boolean;
  /** its most gripping line played first as a teaser, */
  cold_open: boolean;
  /** and long pauses between words cut out. */
  cut_pauses: boolean;
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
  /** The original video, credited in clip descriptions (filled in by YouTube imports, editable). */
  source_url: string | null;
  source_title: string | null;
  source_channel: string | null;
  source_channel_url: string | null;
  jobs: Job[];
}

export type Credit = Pick<Project, "source_title" | "source_channel" | "source_url" | "source_channel_url">;

export interface ClipDescription {
  /** Ready to paste: description, credit, hashtags. */
  text: string;
  description: string;
  hashtags: string[];
  /** Suggested Shorts titles (one can be used as the hook text). */
  titles: string[];
  credit: string | null;
  /** Written by Claude (false = simple text, e.g. no API key). */
  ai: boolean;
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
  youtube_enabled: boolean;
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
      else if (Array.isArray(detail) && typeof detail[0]?.msg === "string")
        message = detail[0].msg.replace(/^Value error, /, ""); // FastAPI validation error
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
  importYoutube: (url: string, rights_confirmed: boolean) =>
    request<{ project: Project; job: Job }>("/api/imports", json({ url, rights_confirmed })),
  updateCredit: (id: string, credit: Credit) =>
    request<Project>(`/api/projects/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(credit),
    }),
  getDescription: (clipId: string) => request<ClipDescription>(`/api/clips/${clipId}/description`),
  writeDescription: (clipId: string) =>
    request<ClipDescription>(`/api/clips/${clipId}/description`, { method: "POST" }),
  getProject: (id: string) => request<Project>(`/api/projects/${id}`),
  listProjects: () => request<ProjectSummary[]>("/api/projects"),
  deleteProject: (id: string) => request<void>(`/api/projects/${id}`, { method: "DELETE" }),
  cancelJob: (id: string) => request<Job>(`/api/jobs/${id}/cancel`, { method: "POST" }),
  proxyUrl: (id: string) => `/api/projects/${id}/proxy`,
  getJob: (id: string) => request<Job>(`/api/jobs/${id}`),
  createSimpleClips: (projectId: string, target_seconds: number) =>
    request<Job>(`/api/projects/${projectId}/simple-clips`, json({ target_seconds })),
  setClipTitle: (clipId: string, title: string) =>
    request<Clip>(`/api/clips/${clipId}/title`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    }),
  createAiClips: (projectId: string, short = false) =>
    request<Job>(`/api/projects/${projectId}/ai-clips`, json({ short })),
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
  /** Pass the export settings so the subtitle timing matches the download (cut pauses / cold open). */
  subtitlesUrl: (clipId: string, settings?: Pick<ExportSettings, "cut_pauses" | "cold_open">) => {
    const params = new URLSearchParams();
    if (settings?.cut_pauses) params.set("cut_pauses", "true");
    if (settings?.cold_open) params.set("cold_open", "true");
    const query = params.toString();
    return `/api/clips/${clipId}/subtitles.srt${query ? `?${query}` : ""}`;
  },
  jobEventsUrl: (id: string) => `/api/jobs/${id}/events`,
};
