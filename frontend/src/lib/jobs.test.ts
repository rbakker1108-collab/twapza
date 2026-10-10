import type { Job } from "../api/client";
import { runAndDownload } from "./jobs";

const job = (over: Partial<Job>): Job => ({
  id: "j1", project_id: "p", type: "export", status: "queued", progress: 0, message: null,
  error: null, created_at: "", started_at: null, finished_at: null, download_url: null, ...over,
});

class FakeEventSource {
  static last: FakeEventSource;
  onmessage: ((e: { data: string }) => void) | null = null;
  closed = false;
  constructor(public url: string) {
    FakeEventSource.last = this;
  }
  addEventListener() {}
  close() {
    this.closed = true;
  }
  emit(j: Job) {
    this.onmessage?.({ data: JSON.stringify(j) });
  }
}

describe("runAndDownload", () => {
  let clicked: string[];

  beforeEach(() => {
    clicked = [];
    vi.stubGlobal("EventSource", FakeEventSource);
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      clicked.push(this.getAttribute("href")!);
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("downloads immediately when the export is already cached", async () => {
    await runAndDownload(async () => job({ status: "succeeded", download_url: "/api/jobs/j1/download" }));
    expect(clicked).toEqual(["/api/jobs/j1/download"]);
  });

  it("follows progress until the job succeeds, then downloads", async () => {
    const updates: number[] = [];
    const promise = runAndDownload(async () => job({}), (j) => updates.push(j.progress));
    await vi.waitFor(() => expect(FakeEventSource.last?.url).toBe("/api/jobs/j1/events"));
    FakeEventSource.last.emit(job({ status: "running", progress: 40 }));
    FakeEventSource.last.emit(job({ status: "succeeded", progress: 100, download_url: "/dl" }));
    await promise;
    expect(updates).toEqual([0, 40, 100]);
    expect(FakeEventSource.last.closed).toBe(true);
    expect(clicked).toEqual(["/dl"]);
  });

  it("rejects with the job error when it fails", async () => {
    const promise = runAndDownload(async () => job({}));
    await vi.waitFor(() => expect(FakeEventSource.last).toBeDefined());
    FakeEventSource.last.emit(job({ status: "failed", error: "Disk full" }));
    await expect(promise).rejects.toThrow("Disk full");
    expect(clicked).toEqual([]);
  });
});
