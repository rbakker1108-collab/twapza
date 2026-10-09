import { api, type Job } from "../api/client";

export const isFinished = (job: Job | null | undefined) =>
  job?.status === "succeeded" || job?.status === "failed";

/** Follow a job over SSE until it finishes. Resolves with the final job state. */
export function watchJob(jobId: string, onUpdate?: (job: Job) => void): Promise<Job> {
  return new Promise((resolve, reject) => {
    const source = new EventSource(api.jobEventsUrl(jobId));
    source.onmessage = (event) => {
      const job = JSON.parse(event.data) as Job;
      onUpdate?.(job);
      if (isFinished(job)) {
        source.close();
        resolve(job);
      }
    };
    source.addEventListener("gone", () => {
      source.close();
      reject(new Error("This job no longer exists."));
    });
  });
}

/** Start a browser download without leaving the page. */
export function triggerDownload(url: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = "";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/** Run an export-style job to completion and download its result. */
export async function runAndDownload(start: () => Promise<Job>, onUpdate?: (job: Job) => void) {
  let job = await start();
  onUpdate?.(job);
  if (!isFinished(job)) job = await watchJob(job.id, onUpdate);
  if (job.status === "failed") throw new Error(job.error ?? "Export failed.");
  if (job.download_url) triggerDownload(job.download_url);
  return job;
}
