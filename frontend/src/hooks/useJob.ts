import { useEffect, useState } from "react";

import type { Job } from "../api/client";
import { isFinished, watchJob } from "../lib/jobs";

/** Live job state via Server-Sent Events, starting from `initial` if given. */
export function useJob(initial: Job | null | undefined): Job | null {
  const [job, setJob] = useState<Job | null>(initial ?? null);

  useEffect(() => {
    setJob(initial ?? null);
    if (!initial || isFinished(initial)) return;
    let cancelled = false;
    watchJob(initial.id, (next) => !cancelled && setJob(next)).catch(() => {});
    return () => {
      cancelled = true;
    };
    // Only re-subscribe when the job itself changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial?.id]);

  return job;
}
