import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { api, type Clip, type Project } from "../api/client";
import { SimpleClipsPanel } from "./SimpleClipsPanel";

const project = (w: number, h: number): Project => ({
  id: "p1", filename: "talk.mp4", size_bytes: 1, status: "ready", error: null, created_at: "",
  expires_at: "", rights_confirmed_at: "", duration: 120, width: w, height: h, fps: 25,
  has_audio: true, jobs: [],
});

const clip: Clip = {
  id: "c1", project_id: "p1", source: "simple", index: 1, start: 0, end: 60, duration: 60,
  text: "hello", title: null, hook: null, score: null, reason: null, thumbnail_url: "/t.jpg",
};

describe("SimpleClipsPanel upscale option", () => {
  beforeEach(() => {
    vi.spyOn(api, "listClips").mockResolvedValue([clip]);
  });
  afterEach(() => vi.restoreAllMocks());

  it("offers 1080p upscaling for low-res videos and sends it with exports", async () => {
    const exportZip = vi.spyOn(api, "exportZip").mockRejectedValue(new Error("stop"));
    render(<SimpleClipsPanel project={project(1280, 720)} />);
    const box = await screen.findByRole("checkbox", { name: /upscale downloads to 1080p/i });
    expect(box).toBeChecked();
    expect(screen.getByText("(source is 720p)")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Download all (ZIP)" }));
    await waitFor(() =>
      expect(exportZip).toHaveBeenCalledWith("p1", "simple", { aspect: "original", upscale_1080: true }),
    );

    await userEvent.click(box);
    await userEvent.click(screen.getByRole("button", { name: "Download all (ZIP)" }));
    await waitFor(() =>
      expect(exportZip).toHaveBeenLastCalledWith("p1", "simple", { aspect: "original", upscale_1080: false }),
    );
  });

  it("hides the option for videos that are already 1080p or larger", async () => {
    render(<SimpleClipsPanel project={project(1920, 1080)} />);
    await screen.findByText("1 clip");
    expect(screen.queryByRole("checkbox", { name: /upscale/i })).toBeNull();
  });
});
