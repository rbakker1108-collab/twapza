import { useEffect, useState } from "react";

import { api, type Job } from "../api/client";

/** Live job state via Server-Sent Events. Returns null until the first update. */
export function useJob(jobId: string | null | undefined, initial?: Job | null): Job | null {
  const [job, setJob] = useState<Job | null>(initial ?? null);

  useEffect(() => {
    if (!jobId) return;
    const source = new EventSource(api.jobEventsUrl(jobId));
    source.onmessage = (event) => {
      const next = JSON.parse(event.data) as Job;
      setJob(next);
      if (next.status === "succeeded" || next.status === "failed") source.close();
    };
    source.addEventListener("gone", () => source.close());
    // EventSource reconnects automatically on network errors.
    return () => source.close();
  }, [jobId]);

  return job;
}
