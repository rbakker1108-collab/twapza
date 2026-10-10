import { ApiError, api, type Job, type Project, type UploadSession } from "../api/client";

export interface UploadDeps {
  createUpload: typeof api.createUpload;
  getUpload: typeof api.getUpload;
  putChunk: typeof api.putChunk;
  completeUpload: typeof api.completeUpload;
}

/** Where unfinished uploads are remembered so they can resume after a reload. */
export interface ResumeStore {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
}

export const browserResumeStore: ResumeStore = {
  get: (k) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set: (k, v) => {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* storage unavailable: uploads still work, just without resume */
    }
  },
  remove: (k) => {
    try {
      localStorage.removeItem(k);
    } catch {
      /* ignore */
    }
  },
};

export interface UploadOptions {
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
  maxRetries?: number;
  deps?: UploadDeps;
  resume?: ResumeStore | null;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Byte range [start, end) of chunk `index`. */
export function chunkRange(index: number, chunkSize: number, totalSize: number): [number, number] {
  const start = index * chunkSize;
  return [start, Math.min(start + chunkSize, totalSize)];
}

/** Identifies "the same file" across page reloads. */
export const resumeKey = (file: File) => `twapza-upload:${file.name}:${file.size}:${file.lastModified}`;

async function startOrResume(file: File, rightsConfirmed: boolean, deps: UploadDeps,
                             resume: ResumeStore | null): Promise<UploadSession> {
  const key = resumeKey(file);
  const previous = resume?.get(key);
  if (previous) {
    try {
      const session = await deps.getUpload(previous);
      const expected = Math.ceil(file.size / session.chunk_size);
      if (session.total_chunks === expected) return session;
    } catch (err) {
      // Gone (expired/finished): start over. Network errors are real errors.
      if (!(err instanceof ApiError) || err.status === 0) throw err;
    }
    resume?.remove(key);
  }
  const session = await deps.createUpload(file.name, file.size, rightsConfirmed);
  resume?.set(key, session.project_id);
  return session;
}

/**
 * Upload a file in chunks (sequentially, retrying each chunk with backoff),
 * then finalise it. Returns the created project and its ingest job.
 *
 * If an upload of the same file was interrupted (closed tab, network drop,
 * paused), it resumes from the chunks the server already has.
 */
export async function uploadFile(
  file: File,
  rightsConfirmed: boolean,
  { onProgress, signal, maxRetries = 3, deps = api, resume = browserResumeStore }: UploadOptions = {},
): Promise<{ project: Project; job: Job }> {
  const session = await startOrResume(file, rightsConfirmed, deps, resume);
  const done = new Set(session.received_chunks);
  let uploaded = 0;
  for (const i of done) {
    const [s, e] = chunkRange(i, session.chunk_size, file.size);
    uploaded += e - s;
  }
  onProgress?.(uploaded / file.size);

  for (let i = 0; i < session.total_chunks; i++) {
    if (done.has(i)) continue;
    const [start, end] = chunkRange(i, session.chunk_size, file.size);
    const blob = file.slice(start, end);
    for (let attempt = 0; ; attempt++) {
      signal?.throwIfAborted();
      try {
        await deps.putChunk(session.project_id, i, blob, signal);
        break;
      } catch (err) {
        if (signal?.aborted || attempt >= maxRetries) throw err;
        await sleep(500 * 2 ** attempt);
      }
    }
    uploaded += end - start;
    onProgress?.(uploaded / file.size);
  }
  const result = await deps.completeUpload(session.project_id);
  resume?.remove(resumeKey(file));
  return result;
}

/** Duration (s) of a video file read by the browser, or null if it can't tell (e.g. mkv). */
export function browserVideoDuration(file: File, timeoutMs = 5000): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    const done = (value: number | null) => {
      clearTimeout(timer);
      URL.revokeObjectURL(url);
      video.removeAttribute("src");
      resolve(value);
    };
    const timer = setTimeout(() => done(null), timeoutMs);
    video.preload = "metadata";
    video.onloadedmetadata = () => done(Number.isFinite(video.duration) ? video.duration : null);
    video.onerror = () => done(null);
    video.src = url;
  });
}
