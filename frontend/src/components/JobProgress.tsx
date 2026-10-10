import { useState } from "react";

import { api, type Job } from "../api/client";
import { ProgressBar } from "./ProgressBar";

interface Props {
  job: Job;
  fallbackLabel?: string;
}

/** Progress bar for a running job, with a Cancel button. */
export function JobProgress({ job, fallbackLabel = "Waiting for a worker…" }: Props) {
  const [canceling, setCanceling] = useState(false);

  async function cancel() {
    setCanceling(true);
    try {
      await api.cancelJob(job.id);
    } catch {
      setCanceling(false); // it may have just finished; the SSE stream will tell us
    }
  }

  return (
    <div className="flex items-end gap-3">
      <div className="flex-1">
        <ProgressBar
          value={job.progress}
          label={canceling ? "Stopping…" : job.status === "queued" ? "Queued: waiting for other jobs to finish" : (job.message ?? fallbackLabel)}
        />
      </div>
      <button
        type="button"
        onClick={cancel}
        disabled={canceling}
        className="rounded-lg px-3 py-1 text-sm text-slate-600 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-50"
      >
        Cancel
      </button>
    </div>
  );
}
