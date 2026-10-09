import { api, type Job, type Project, type UploadSession } from "../api/client";

export interface UploadDeps {
  createUpload: typeof api.createUpload;
  putChunk: typeof api.putChunk;
  completeUpload: typeof api.completeUpload;
}

export interface UploadOptions {
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
  maxRetries?: number;
  deps?: UploadDeps;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Byte range [start, end) of chunk `index`. */
export function chunkRange(index: number, chunkSize: number, totalSize: number): [number, number] {
  const start = index * chunkSize;
  return [start, Math.min(start + chunkSize, totalSize)];
}

/**
 * Upload a file in chunks (sequentially, retrying each chunk with backoff),
 * then finalise it. Returns the created project and its ingest job.
 */
export async function uploadFile(
  file: File,
  rightsConfirmed: boolean,
  { onProgress, signal, maxRetries = 3, deps = api }: UploadOptions = {},
): Promise<{ project: Project; job: Job }> {
  const session: UploadSession = await deps.createUpload(file.name, file.size, rightsConfirmed);
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
  return deps.completeUpload(session.project_id);
}
