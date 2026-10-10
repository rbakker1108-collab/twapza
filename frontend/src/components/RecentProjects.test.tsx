import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

import { api, type ProjectSummary } from "../api/client";
import { RecentProjects, timeLeft } from "./RecentProjects";

const summary = (over: Partial<ProjectSummary>): ProjectSummary => ({
  id: "p1", filename: "talk.mp4", status: "ready", created_at: "", duration: 3725, clip_count: 7,
  expires_at: new Date(Date.now() + 5 * 3600_000 + 60_000).toISOString(), ...over,
});

describe("RecentProjects", () => {
  afterEach(() => vi.restoreAllMocks());

  it("lists projects with status, length, clips and time left", async () => {
    vi.spyOn(api, "listProjects").mockResolvedValue([summary({}), summary({ id: "p2", filename: "b.mov", status: "failed", clip_count: 1, duration: null })]);
    render(<MemoryRouter><RecentProjects /></MemoryRouter>);
    expect(await screen.findByRole("link", { name: "talk.mp4" })).toHaveAttribute("href", "/projects/p1");
    expect(screen.getByText(/1:02:05 · 7 clips · deleted in 5 h 1 min/)).toBeInTheDocument();
    expect(screen.getByText("Failed")).toBeInTheDocument();
    expect(screen.getByText(/^1 clip/)).toBeInTheDocument();
  });

  it("deletes a project after confirming", async () => {
    vi.spyOn(api, "listProjects").mockResolvedValue([summary({})]);
    const del = vi.spyOn(api, "deleteProject").mockResolvedValue(undefined);
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<MemoryRouter><RecentProjects /></MemoryRouter>);
    await userEvent.click(await screen.findByRole("button", { name: "Delete talk.mp4" }));
    await waitFor(() => expect(del).toHaveBeenCalledWith("p1"));
    expect(screen.queryByText("talk.mp4")).toBeNull();
  });

  it("shows nothing when there are no projects", async () => {
    vi.spyOn(api, "listProjects").mockResolvedValue([]);
    const { container } = render(<MemoryRouter><RecentProjects /></MemoryRouter>);
    await waitFor(() => expect(api.listProjects).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it("formats time left", () => {
    expect(timeLeft(new Date(Date.now() + 45 * 60_000).toISOString())).toBe("45 min");
    expect(timeLeft(new Date(Date.now() - 1000).toISOString())).toBe("0 min");
  });
});
