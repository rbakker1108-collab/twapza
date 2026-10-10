import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { api, type Job } from "../api/client";
import { JobProgress } from "./JobProgress";

const job = (over: Partial<Job> = {}): Job => ({
  id: "j1", project_id: "p", type: "ai_clips", status: "running", progress: 40, message: "Claude is reviewing",
  error: null, created_at: "", started_at: null, finished_at: null, download_url: null, ...over,
});

describe("JobProgress", () => {
  afterEach(() => vi.restoreAllMocks());

  it("shows progress and cancels the job", async () => {
    const cancel = vi.spyOn(api, "cancelJob").mockResolvedValue(job({ status: "canceled" }));
    render(<JobProgress job={job()} />);
    expect(screen.getByText("Claude is reviewing")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(cancel).toHaveBeenCalledWith("j1"));
    expect(screen.getByText("Stopping…")).toBeInTheDocument();
  });

  it("explains a queued job", () => {
    render(<JobProgress job={job({ status: "queued", message: null })} />);
    expect(screen.getByText(/waiting for other jobs/)).toBeInTheDocument();
  });
});
