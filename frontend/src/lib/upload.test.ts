import type { UploadDeps } from "./upload";
import { chunkRange, uploadFile } from "./upload";

function fakeDeps(overrides: Partial<UploadDeps> = {}, received: number[] = []) {
  const chunks = new Map<number, number>();
  const deps: UploadDeps = {
    createUpload: vi.fn(async (_name, size) => ({
      project_id: "p1",
      chunk_size: 4,
      total_chunks: Math.ceil(size / 4),
      received_chunks: received,
    })),
    putChunk: vi.fn(async (_id, index, blob) => {
      chunks.set(index, blob.size);
    }),
    completeUpload: vi.fn(async () => ({ project: { id: "p1" }, job: { id: "j1" } }) as never),
    ...overrides,
  };
  return { deps, chunks };
}

const file = new File([new Uint8Array(10)], "talk.mp4");

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
    const result = await uploadFile(file, true, { deps, onProgress: (f) => progress.push(f) });
    expect([...chunks.entries()]).toEqual([[0, 4], [1, 4], [2, 2]]);
    expect(progress).toEqual([0, 0.4, 0.8, 1]);
    expect(deps.completeUpload).toHaveBeenCalledWith("p1");
    expect(result.project.id).toBe("p1");
  });

  it("skips chunks the server already has", async () => {
    const { deps } = fakeDeps({}, [0, 1]);
    await uploadFile(file, true, { deps });
    expect(deps.putChunk).toHaveBeenCalledTimes(1);
  });

  it("retries a failing chunk, then gives up", async () => {
    vi.useFakeTimers();
    try {
      const putChunk = vi.fn().mockRejectedValue(new Error("network"));
      const { deps } = fakeDeps({ putChunk });
      const promise = uploadFile(file, true, { deps, maxRetries: 2 });
      const assertion = expect(promise).rejects.toThrow("network");
      await vi.runAllTimersAsync();
      await assertion;
      expect(putChunk).toHaveBeenCalledTimes(3);
      expect(deps.completeUpload).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
