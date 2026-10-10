import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { api } from "../api/client";
import { makeClip, makeConfig, makeProject } from "../test-fixtures";
import { ClipsWorkspace } from "./ClipsWorkspace";

describe("ClipsWorkspace", () => {
  let exportZip: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.spyOn(api, "listClips").mockImplementation(async (_p, source) =>
      source === "simple" ? [makeClip()] : [makeClip({ id: "a1", source: "ai", title: "Hot take", score: 91 })],
    );
    exportZip = vi.spyOn(api, "exportZip").mockRejectedValue(new Error("stop"));
  });
  afterEach(() => vi.restoreAllMocks());

  const simpleTab = async () => {
    await userEvent.click(screen.getByRole("tab", { name: "Simple clips" }));
    return screen.getByRole("tab", { name: "Simple clips" });
  };
  const zipIn = (panel: HTMLElement) =>
    userEvent.click(within(panel).getByRole("button", { name: "Download all (ZIP)" }));

  it("opens on AI highlights and keeps both panels mounted", async () => {
    render(<ClipsWorkspace project={makeProject()} config={makeConfig()} />);
    expect(screen.getByRole("tab", { name: "AI highlights" })).toHaveAttribute("aria-selected", "true");
    expect(await screen.findByText("Hot take")).toBeVisible();
    await simpleTab();
    expect(screen.getByText("Hot take")).not.toBeVisible();
    expect(screen.getByText("1 clip")).toBeVisible();
  });

  it("defaults to vertical 9:16 showing the whole frame and shares the format with both tabs", async () => {
    render(<ClipsWorkspace project={makeProject()} config={makeConfig()} />);
    expect(screen.getByRole("radio", { name: /vertical 9:16/i })).toBeChecked();
    expect(screen.getByRole("radio", { name: /blurred background/i })).toBeChecked();
    await userEvent.click(screen.getByRole("checkbox", { name: /subtitles/i })); // captions off
    await screen.findByText("Hot take");
    await zipIn(screen.getByText(/highlight, best first/).closest("section")!);
    await waitFor(() =>
      expect(exportZip).toHaveBeenLastCalledWith("p1", "ai", { aspect: "9:16", vertical_fit: "blur", upscale_1080: false, captions: null }),
    );

    await userEvent.click(screen.getByRole("radio", { name: /black bars/i }));
    expect(screen.getAllByTestId("clip-frame")[0]).toHaveClass("bg-black");
    await simpleTab();
    await zipIn(screen.getByText("1 clip").closest("section")!);
    await waitFor(() =>
      expect(exportZip).toHaveBeenLastCalledWith("p1", "simple", expect.objectContaining({ vertical_fit: "bars" })),
    );
  });

  it("offers 1080p upscaling only for original format on low-res videos", async () => {
    render(<ClipsWorkspace project={makeProject(1280, 720)} config={makeConfig()} />);
    expect(screen.queryByRole("checkbox", { name: /upscale/i })).toBeNull();
    await userEvent.click(screen.getByRole("radio", { name: /original/i }));
    expect(screen.getByRole("checkbox", { name: /upscale downloads to 1080p/i })).toBeChecked();
    expect(screen.getByText("(source is 720p)")).toBeInTheDocument();
  });

  it("never offers upscaling for 1080p sources", async () => {
    render(<ClipsWorkspace project={makeProject()} config={makeConfig()} />);
    await userEvent.click(screen.getByRole("radio", { name: /original/i }));
    expect(screen.queryByRole("checkbox", { name: /upscale/i })).toBeNull();
  });
});
