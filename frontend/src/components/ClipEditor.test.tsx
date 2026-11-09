import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { api, type ClipWord, type ExportSettings, type TextOverlay } from "../api/client";
import * as jobs from "../lib/jobs";
import { makeClip, makeConfig, makeProject } from "../test-fixtures";
import { ClipEditor, isActive } from "./ClipEditor";
import { ClipsWorkspace } from "./ClipsWorkspace";
import { DEFAULT_EXPORT } from "./ExportOptions";

const text = (over: Partial<TextOverlay> = {}): TextOverlay => ({
  id: "t1", text: "Day 3", x: 0.5, y: 0.3, size: 0.08, font: "anton", color: "#FFD400",
  style: "box", start: 0, end: null, ...over,
});

vi.mock("../lib/jobs", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/jobs")>()),
  runAndDownload: vi.fn(async (start: () => Promise<unknown>) => start()),
}));

function renderEditor(clip = makeClip(), onSaved = vi.fn(), onClose = vi.fn(),
                      settings: ExportSettings = DEFAULT_EXPORT, onSettingsChange = vi.fn(),
                      words: ClipWord[] = []) {
  if (!vi.isMockFunction(api.getClipWords)) vi.spyOn(api, "getClipWords").mockResolvedValue(words);
  render(<ClipEditor clip={clip} project={makeProject()} settings={settings} onSettingsChange={onSettingsChange}
                     onClose={onClose} onSaved={onSaved} />);
  const stage = screen.getByTestId("editor-stage");
  // jsdom has no layout: give the stage a 300×533 box at (100, 50).
  stage.getBoundingClientRect = () => ({ left: 100, top: 50, width: 300, height: 533, right: 400, bottom: 583,
                                         x: 100, y: 50, toJSON: () => ({}) });
  return { stage, onSaved, onClose, onSettingsChange };
}

describe("ClipEditor: texts", () => {
  afterEach(() => vi.restoreAllMocks());

  it("adds, edits, drags and saves a text", async () => {
    const user = userEvent.setup();
    const save = vi.spyOn(api, "setOverlays").mockImplementation(async (id, overlays) => makeClip({ id, overlays }));
    const { onSaved, onClose } = renderEditor();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "+ Add text" }));
    const box = screen.getByLabelText("Text", { selector: "textarea" });
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
    await user.clear(box);
    await user.type(box, "He quit his job");
    await user.selectOptions(screen.getByLabelText("Style"), "box");

    // Drag the text from the centre (250, 263) to (325, 450): +25% across, +35% down.
    const overlay = screen.getByRole("button", { name: "Text: He quit his job" });
    fireEvent.pointerDown(overlay, { clientX: 250, clientY: 50 + 0.4 * 533, pointerId: 1 });
    fireEvent.pointerMove(screen.getByTestId("editor-stage"), { clientX: 325, clientY: 50 + 0.75 * 533, pointerId: 1 });
    fireEvent.pointerUp(screen.getByTestId("editor-stage"), { pointerId: 1 });

    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(save).toHaveBeenCalled());
    const [, [saved]] = save.mock.calls[0];
    expect(saved).toMatchObject({ text: "He quit his job", style: "box", x: 0.75, y: 0.75, start: 0, end: null });
    expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ overlays: [saved] }));
    expect(onClose).toHaveBeenCalled();
  });

  it("keeps dragged texts inside the frame", async () => {
    renderEditor(makeClip({ overlays: [text()] }));
    const overlay = screen.getByRole("button", { name: "Text: Day 3" });
    fireEvent.pointerDown(overlay, { clientX: 250, clientY: 50 + 0.3 * 533, pointerId: 1 });
    fireEvent.pointerMove(screen.getByTestId("editor-stage"), { clientX: 9999, clientY: -500, pointerId: 1 });
    expect(overlay.style.left).toBe("100%");
    expect(overlay.style.top).toBe("0%");
  });

  it("times a text and deletes texts", async () => {
    const user = userEvent.setup();
    const save = vi.spyOn(api, "setOverlays").mockImplementation(async (id, overlays) => makeClip({ id, overlays }));
    renderEditor(makeClip({ overlays: [text(), text({ id: "t2", text: "Second" })] }));
    await user.click(screen.getByRole("button", { name: "Day 3" }));
    await user.click(screen.getByRole("checkbox", { name: "Show for the whole clip" }));
    const from = screen.getByRole("spinbutton", { name: /From/ });
    const to = screen.getByRole("spinbutton", { name: /To/ });
    fireEvent.change(from, { target: { value: "2" } });
    fireEvent.change(to, { target: { value: "5.5" } });

    await user.click(screen.getByRole("button", { name: "Second" }));
    await user.click(screen.getByRole("button", { name: "Delete this text" }));
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(save).toHaveBeenCalled());
    expect(save.mock.calls[0][1]).toEqual([text({ start: 2, end: 5.5 })]);
  });

  it("closes on Escape and Close without saving", async () => {
    const user = userEvent.setup();
    const save = vi.spyOn(api, "setOverlays");
    const { onClose } = renderEditor();
    fireEvent.keyDown(window, { key: "Escape" });
    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(2);
    expect(save).not.toHaveBeenCalled();
  });

  it("shows where the captions will be", () => {
    renderEditor();
    // Same place as the real captions: 20% up from the bottom of a vertical frame.
    expect(screen.getByTestId("caption-zone")).toHaveStyle({ bottom: `${(300 * 16) / 9 * 0.2}px` });
  });

  it("isActive follows the timing", () => {
    expect(isActive(text(), 99)).toBe(true);
    expect(isActive(text({ start: 2, end: 4 }), 1.9)).toBe(false);
    expect(isActive(text({ start: 2, end: 4 }), 3)).toBe(true);
    expect(isActive(text({ start: 2, end: 4 }), 4)).toBe(false);
  });
});

describe("ClipEditor: captions", () => {
  afterEach(() => vi.restoreAllMocks());

  it("fixes and hides words for the whole project", async () => {
    const user = userEvent.setup();
    vi.spyOn(api, "getClipWords").mockResolvedValue([
      { start: 1, end: 1.4, text: "Helo", original: "Helo" },
      { start: 1.5, end: 1.8, text: "um", original: "um" },
      { start: 2, end: 2.4, text: "world", original: "wrld" },  // fixed earlier
    ]);
    const save = vi.spyOn(api, "saveCorrections").mockResolvedValue([makeClip({ text: "Hello world" })]);
    const { onSaved } = renderEditor();

    await user.click(screen.getByRole("tab", { name: "Fix captions" }));
    const words = within(await screen.findByTestId("caption-words")).getAllByRole("textbox");
    expect(words.map((w) => (w as HTMLInputElement).value)).toEqual(["Helo", "um", "world"]);
    expect(words[2]).toHaveAttribute("title", "Transcribed as “wrld”");

    await user.clear(words[0]);
    await user.type(words[0], "Hello");
    await user.clear(words[1]);
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(save).toHaveBeenCalledWith("p1", [{ start: 1, text: "Hello" }, { start: 1.5, text: "" }]));
    expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ text: "Hello world" }));
  });
});

describe("Download options and settings", () => {
  afterEach(() => vi.restoreAllMocks());

  it("offers filler removal, a progress bar and a whole-clip hook, and remembers choices", async () => {
    const user = userEvent.setup();
    vi.spyOn(api, "listClips").mockResolvedValue([]);
    const { unmount } = render(<ClipsWorkspace project={makeProject()} config={makeConfig()} />);
    expect(screen.queryByRole("radiogroup", { name: "Show the hook text" })).toBeNull();
    await user.click(screen.getByRole("checkbox", { name: /remove filler words/i }));
    await user.click(screen.getByRole("checkbox", { name: /progress bar/i }));
    await user.click(screen.getByRole("checkbox", { name: /hook text/i }));
    await user.click(screen.getByRole("radio", { name: "Whole clip" }));
    await user.click(screen.getByRole("radio", { name: /black bars/i }));
    unmount();

    // A new project page starts from the remembered settings.
    render(<ClipsWorkspace project={makeProject()} config={makeConfig()} />);
    expect(screen.getByRole("checkbox", { name: /remove filler words/i })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: /progress bar/i })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Whole clip" })).toBeChecked();
    expect(screen.getByRole("radio", { name: /black bars/i })).toBeChecked();
  });

  it("ignores broken saved settings", () => {
    localStorage.setItem("twapza.downloadSettings", "{not json");
    vi.spyOn(api, "listClips").mockResolvedValue([]);
    render(<ClipsWorkspace project={makeProject()} config={makeConfig()} />);
    expect(screen.getByRole("radio", { name: /blurred background/i })).toBeChecked();
  });

  it("sends what to look for to the AI", async () => {
    const user = userEvent.setup();
    vi.spyOn(api, "listClips").mockResolvedValue([]);
    const create = vi.spyOn(api, "createAiClips").mockRejectedValue(new Error("stop"));
    render(<ClipsWorkspace project={makeProject()} config={makeConfig()} />);
    await user.type(screen.getByPlaceholderText(/funny moments/), "money tips");
    await user.click(screen.getByRole("button", { name: "Find highlights" }));
    expect(create).toHaveBeenCalledWith("p1", false, "money tips");
  });
});


describe("ClipEditor: edit everything, then download", () => {
  afterEach(() => vi.restoreAllMocks());

  const WORDS: ClipWord[] = [
    { start: 0.5, end: 0.9, text: "hello", original: "hello" },
    { start: 1.0, end: 1.3, text: "big", original: "big" },
    { start: 1.4, end: 2.0, text: "world.", original: "world." },
  ];

  it("shows the subtitles live while the clip plays, with the spoken word highlighted", async () => {
    renderEditor(makeClip(), vi.fn(), vi.fn(), DEFAULT_EXPORT, vi.fn(), WORDS);
    expect(await screen.findByTestId("caption-zone")).toBeInTheDocument(); // nothing said at 0:00
    fireEvent.change(screen.getByRole("slider", { name: "Position in clip" }), { target: { value: "1.1" } });
    const live = await screen.findByTestId("live-caption");
    expect(live).toHaveTextContent("HELLO BIG WORLD.");
    expect(within(live).getByText("BIG")).toHaveStyle({ color: "#FFD400" });
  });

  it("previews caption fixes before they are saved", async () => {
    const user = userEvent.setup();
    renderEditor(makeClip(), vi.fn(), vi.fn(), DEFAULT_EXPORT, vi.fn(), WORDS);
    await user.click(screen.getByRole("tab", { name: "Fix captions" }));
    const first = within(await screen.findByTestId("caption-words")).getAllByRole("textbox")[0];
    await user.clear(first);
    await user.type(first, "hi");
    fireEvent.change(screen.getByRole("slider", { name: "Position in clip" }), { target: { value: "0.6" } });
    expect(await screen.findByTestId("live-caption")).toHaveTextContent("HI BIG WORLD.");
  });

  it("turns on the hook text and picks its duration inside the editor", async () => {
    const user = userEvent.setup();
    const onSettingsChange = vi.fn();
    renderEditor(makeClip({ title: "He quit" }), vi.fn(), vi.fn(), DEFAULT_EXPORT, onSettingsChange);
    const section = screen.getByTestId("hook-section");
    await user.click(within(section).getByRole("checkbox", { name: /show hook text/i }));
    expect(onSettingsChange).toHaveBeenLastCalledWith(expect.objectContaining({ hook_text: true }));
    expect(within(section).getByRole("textbox", { name: "Hook text" })).toHaveValue("He quit");
    await user.click(within(section).getByRole("radio", { name: "Whole clip" }));
    expect(onSettingsChange).toHaveBeenLastCalledWith(expect.objectContaining({ hook_text: true, hook_full: true }));
    expect(screen.getByText("He quit", { selector: "span" })).toBeInTheDocument(); // previewed on the video
  });

  it("changes the download format and caption style from the Format tab", async () => {
    const user = userEvent.setup();
    const onSettingsChange = vi.fn();
    renderEditor(makeClip(), vi.fn(), vi.fn(), DEFAULT_EXPORT, onSettingsChange);
    await user.click(screen.getByRole("tab", { name: "Format & style" }));
    const tab = screen.getByTestId("format-tab");
    await user.click(within(tab).getByRole("radio", { name: /black bars/i }));
    expect(onSettingsChange).toHaveBeenLastCalledWith(expect.objectContaining({ vertical_fit: "bars" }));
    await user.click(within(tab).getByRole("checkbox", { name: /progress bar/i }));
    expect(onSettingsChange).toHaveBeenLastCalledWith(expect.objectContaining({ vertical_fit: "bars", progress_bar: true }));
  });

  it("saves the edits, then downloads with the chosen settings", async () => {
    const user = userEvent.setup();
    const calls: string[] = [];
    vi.spyOn(api, "setOverlays").mockImplementation(async (id, overlays) => {
      calls.push("save");
      return makeClip({ id, overlays });
    });
    const exportClip = vi.spyOn(api, "exportClip").mockImplementation(async () => {
      calls.push("export");
      return { id: "j1", status: "succeeded" } as never;
    });
    const { onClose } = renderEditor(makeClip(), vi.fn(), vi.fn(), { ...DEFAULT_EXPORT, cut_pauses: true });
    await user.click(screen.getByRole("button", { name: "+ Add text" }));
    await user.click(screen.getByRole("button", { name: "Download" }));
    await waitFor(() => expect(exportClip).toHaveBeenCalled());
    expect(calls).toEqual(["save", "export"]);
    expect(exportClip.mock.calls[0][1]).toMatchObject({ cut_pauses: true });
    expect(jobs.runAndDownload).toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled(); // stays open, e.g. to download another format
  });
});
