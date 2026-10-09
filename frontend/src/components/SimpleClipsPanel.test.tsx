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

describe("SimpleClipsPanel download format", () => {
  let exportZip: ReturnType<typeof vi.spyOn>;
  const zip = () => userEvent.click(screen.getByRole("button", { name: "Download all (ZIP)" }));

  beforeEach(() => {
    vi.spyOn(api, "listClips").mockResolvedValue([clip]);
    exportZip = vi.spyOn(api, "exportZip").mockRejectedValue(new Error("stop"));
  });
  afterEach(() => vi.restoreAllMocks());

  it("defaults to vertical 9:16 center crop for Shorts/TikTok", async () => {
    render(<SimpleClipsPanel project={project(1920, 1080)} />);
    expect(await screen.findByRole("radio", { name: /vertical 9:16/i })).toBeChecked();
    expect(screen.getByRole("radio", { name: /crop to center/i })).toBeChecked();
    expect(screen.getByTestId("clip-frame")).toHaveClass("aspect-[9/16]");
    await zip();
    await waitFor(() =>
      expect(exportZip).toHaveBeenCalledWith("p1", "simple",
        { aspect: "9:16", vertical_fit: "crop", upscale_1080: false }),
    );
  });

  it("can fit with a blurred background", async () => {
    render(<SimpleClipsPanel project={project(1920, 1080)} />);
    await userEvent.click(await screen.findByRole("radio", { name: /blurred background/i }));
    await zip();
    await waitFor(() =>
      expect(exportZip).toHaveBeenLastCalledWith("p1", "simple",
        expect.objectContaining({ aspect: "9:16", vertical_fit: "blur" })),
    );
  });

  it("offers 1080p upscaling only for original format on low-res videos", async () => {
    render(<SimpleClipsPanel project={project(1280, 720)} />);
    await screen.findByRole("radio", { name: /vertical 9:16/i });
    expect(screen.queryByRole("checkbox", { name: /upscale/i })).toBeNull();

    await userEvent.click(screen.getByRole("radio", { name: /original/i }));
    const box = screen.getByRole("checkbox", { name: /upscale downloads to 1080p/i });
    expect(box).toBeChecked();
    expect(screen.getByTestId("clip-frame")).toHaveClass("aspect-video");
    await zip();
    await waitFor(() =>
      expect(exportZip).toHaveBeenLastCalledWith("p1", "simple",
        expect.objectContaining({ aspect: "original", upscale_1080: true })),
    );

    await userEvent.click(box);
    await zip();
    await waitFor(() =>
      expect(exportZip).toHaveBeenLastCalledWith("p1", "simple",
        expect.objectContaining({ aspect: "original", upscale_1080: false })),
    );
  });

  it("never upscales videos that are already 1080p", async () => {
    render(<SimpleClipsPanel project={project(1920, 1080)} />);
    await userEvent.click(await screen.findByRole("radio", { name: /original/i }));
    expect(screen.queryByRole("checkbox", { name: /upscale/i })).toBeNull();
  });
});
