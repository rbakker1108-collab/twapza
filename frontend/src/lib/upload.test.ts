import { ApiError, type UploadSession } from "../api/client";
import type { ResumeStore, UploadDeps } from "./upload";
import { chunkRange, resumeKey, uploadFile } from "./upload";

function memoryStore(initial: Record<string, string> = {}): ResumeStore & { data: Record<string, string> } {
  const data = { ...initial };
  return { data, get: (k) => data[k] ?? null, set: (k, v) => void (data[k] = v), remove: (k) => void delete data[k] };
}

function fakeDeps(overrides: Partial<UploadDeps> = {}, existing?: UploadSession) {
  const chunks = new Map<number, number>();
  const deps: UploadDeps = {
    createUpload: vi.fn(async (_name, size) => ({
      project_id: "new", chunk_size: 4, total_chunks: Math.ceil(size / 4), received_chunks: [],
    })),
    getUpload: vi.fn(async () => {
      if (!existing) throw new ApiError(404, "Upload not found.");
      return existing;
    }),
    putChunk: vi.fn(async (_id, index, blob) => {
      chunks.set(index, blob.size);
    }),
    completeUpload: vi.fn(async (id) => ({ project: { id }, job: { id: "j1" } }) as never),
    ...overrides,
  };
  return { deps, chunks };
}

const file = new File([new Uint8Array(10)], "talk.mp4", { lastModified: 1000 });

describe("chunkRange", () => {
  it("clamps the final chunk to the file size", () => {
    expect(chunkRange(0, 4, 10)).toEqual([0, 4]);
    expect(chunkRange(2, 4, 10)).toEqual([8, 10]);
  });
});

describe("uploadFile", () => {
  it("uploads every chunk, reports progress and completes", async () => {
    const { deps, chunks } = fakeDeps();
    const progress: number[] = [];
    const result = await uploadFile(file, true, { deps, resume: null, onProgress: (f) => progress.push(f) });
    expect([...chunks.entries()]).toEqual([[0, 4], [1, 4], [2, 2]]);
    expect(progress).toEqual([0, 0.4, 0.8, 1]);
    expect(result.project.id).toBe("new");
  });

  it("retries a failing chunk, then gives up", async () => {
    vi.useFakeTimers();
    try {
      const putChunk = vi.fn().mockRejectedValue(new Error("network"));
      const { deps } = fakeDeps({ putChunk });
      const promise = uploadFile(file, true, { deps, resume: null, maxRetries: 2 });
      const assertion = expect(promise).rejects.toThrow("network");
      await vi.runAllTimersAsync();
      await assertion;
      expect(putChunk).toHaveBeenCalledTimes(3);
      expect(deps.completeUpload).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("remembers an unfinished upload and resumes it with the same file", async () => {
    const store = memoryStore();
    const aborter = new AbortController();
    const { deps } = fakeDeps({
      putChunk: vi.fn(async (_id, index) => {
        if (index === 1) aborter.abort(); // pause after the first chunk
      }),
    });
    await expect(uploadFile(file, true, { deps, resume: store, signal: aborter.signal })).rejects.toThrow();
    expect(store.data[resumeKey(file)]).toBe("new");

    const existing = { project_id: "new", chunk_size: 4, total_chunks: 3, received_chunks: [0, 1] };
    const second = fakeDeps({}, existing);
    const result = await uploadFile(file, true, { deps: second.deps, resume: store });
    expect(second.deps.createUpload).not.toHaveBeenCalled();
    expect([...second.chunks.keys()]).toEqual([2]); // only the missing chunk
    expect(result.project.id).toBe("new");
    expect(store.data[resumeKey(file)]).toBeUndefined(); // forgotten once complete
  });

  it("starts over when the remembered upload is gone", async () => {
    const store = memoryStore({ [resumeKey(file)]: "expired" });
    const { deps } = fakeDeps(); // getUpload -> 404
    const result = await uploadFile(file, true, { deps, resume: store });
    expect(deps.createUpload).toHaveBeenCalledOnce();
    expect(result.project.id).toBe("new");
  });

  it("does not start over on a network error", async () => {
    const store = memoryStore({ [resumeKey(file)]: "abc" });
    const { deps } = fakeDeps({ getUpload: vi.fn().mockRejectedValue(new ApiError(0, "offline")) });
    await expect(uploadFile(file, true, { deps, resume: store })).rejects.toThrow("offline");
    expect(deps.createUpload).not.toHaveBeenCalled();
    expect(store.data[resumeKey(file)]).toBe("abc");
  });
});
