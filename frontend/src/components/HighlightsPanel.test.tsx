import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { api, type ExportSettings } from "../api/client";
import { makeClip, makeProject } from "../test-fixtures";
import { HighlightsPanel } from "./HighlightsPanel";

const settings: ExportSettings = { aspect: "9:16", vertical_fit: "crop", upscale_1080: false, captions: null };
const ai = (i: number, over = {}) =>
  makeClip({ id: `a${i}`, source: "ai", index: i, start: 100 * i, end: 100 * i + 40, duration: 40,
             suggested_start: 100 * i, suggested_end: 100 * i + 40, title: `Moment ${i}`,
             hook: `Hook ${i}`, reason: `Reason ${i}`, score: 95 - i * 10, ...over });

describe("HighlightsPanel", () => {
  afterEach(() => vi.restoreAllMocks());

  it("explains how to enable AI when there is no API key", async () => {
    vi.spyOn(api, "listClips").mockResolvedValue([]);
    render(<HighlightsPanel project={makeProject()} settings={settings} aiEnabled={false} />);
    expect(screen.getByText(/ANTHROPIC_API_KEY/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /find highlights/i })).toBeNull();
  });

  it("shows ranked highlights with title, hook, reason and score", async () => {
    vi.spyOn(api, "listClips").mockResolvedValue([ai(1), ai(2)]);
    render(<HighlightsPanel project={makeProject()} settings={settings} aiEnabled />);
    const titles = await screen.findAllByRole("heading", { level: 3 });
    expect(titles.map((t) => t.textContent)).toEqual(["Moment 1", "Moment 2"]);
    expect(screen.getByText("#1")).toBeInTheDocument();
    expect(screen.getByText("“Hook 1”")).toBeInTheDocument();
    expect(screen.getByText("Reason 2")).toBeInTheDocument();
    expect(screen.getByText("85")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Find highlights again" })).toBeEnabled();
  });

  it("trims a clip and updates the card", async () => {
    vi.spyOn(api, "listClips").mockResolvedValue([ai(1)]);
    const trim = vi.spyOn(api, "trimClip").mockImplementation(async (id, start, end) =>
      ai(1, { id, start, end, duration: end - start }));
    render(<HighlightsPanel project={makeProject()} settings={settings} aiEnabled />);
    await userEvent.click(await screen.findByRole("button", { name: "Trim" }));

    const save = screen.getByRole("button", { name: "Save trim" });
    expect(save).toBeDisabled(); // nothing changed yet
    await userEvent.click(screen.getByRole("button", { name: "Start later" }));
    await userEvent.click(screen.getByRole("button", { name: "End earlier" }));
    await userEvent.click(save);

    await waitFor(() => expect(trim).toHaveBeenCalledWith("a1", 100.5, 139.5));
    expect(await screen.findByText("trimmed")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save trim" })).toBeNull();
  });
});
