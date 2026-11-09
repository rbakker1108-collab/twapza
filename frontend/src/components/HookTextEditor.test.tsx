import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { api, type ClipDescription } from "../api/client";
import { makeClip, makeConfig, makeProject } from "../test-fixtures";
import { ClipsWorkspace } from "./ClipsWorkspace";
import { HookTextEditor } from "./HookTextEditor";

const desc = (titles: string[]): ClipDescription => ({
  text: "", description: "", hashtags: [], credit: null, ai: true, titles,
});

describe("HookTextEditor", () => {
  afterEach(() => vi.restoreAllMocks());

  it("saves typed hook text on Enter, before any download", async () => {
    const user = userEvent.setup();
    const set = vi.spyOn(api, "setClipTitle").mockImplementation(async (id, title) => makeClip({ id, title }));
    const onChange = vi.fn();
    render(<HookTextEditor clip={makeClip({ title: null })} onChange={onChange} />);
    expect(screen.getByText(/No hook text yet/)).toBeInTheDocument();
    await user.type(screen.getByLabelText("Hook text"), "He quit his job{Enter}");
    await waitFor(() => expect(set).toHaveBeenCalledWith("c1", "He quit his job"));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ title: "He quit his job" }));
    expect(screen.queryByText(/No hook text yet/)).toBeNull();
  });

  it("does not save when nothing changed", async () => {
    const user = userEvent.setup();
    const set = vi.spyOn(api, "setClipTitle");
    render(<HookTextEditor clip={makeClip({ title: "Same" })} onChange={vi.fn()} />);
    await user.click(screen.getByLabelText("Hook text"));
    await user.tab();
    expect(set).not.toHaveBeenCalled();
  });

  it("suggests Claude's title ideas and uses one with a click", async () => {
    const user = userEvent.setup();
    vi.spyOn(api, "writeDescription").mockResolvedValue(desc(["Wait for it", "He ate WHAT?"]));
    const set = vi.spyOn(api, "setClipTitle").mockImplementation(async (id, title) => makeClip({ id, title }));
    render(<HookTextEditor clip={makeClip({ title: null })} onChange={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Suggest" }));
    await user.click(await screen.findByRole("button", { name: "He ate WHAT?" }));
    await waitFor(() => expect(set).toHaveBeenCalledWith("c1", "He ate WHAT?"));
    expect(screen.getByLabelText("Hook text")).toHaveValue("He ate WHAT?");
  });

  it("explains when no ideas come back", async () => {
    const user = userEvent.setup();
    vi.spyOn(api, "writeDescription").mockResolvedValue(desc([]));
    render(<HookTextEditor clip={makeClip()} onChange={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Suggest" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/No ideas/);
  });
});

describe("Hook text on clip cards", () => {
  afterEach(() => vi.restoreAllMocks());

  it("is previewed on the card; editing happens in the clip editor", async () => {
    const user = userEvent.setup();
    vi.spyOn(api, "listClips").mockImplementation(async (_p, source) =>
      source === "ai" ? [makeClip({ id: "a1", source: "ai", title: "Hot take", score: 90 })] : []);
    vi.spyOn(api, "getClipWords").mockResolvedValue([]);
    render(<ClipsWorkspace project={makeProject()} config={makeConfig()} />);
    await screen.findByText("Hot take");
    expect(screen.queryByTestId("hook-preview")).toBeNull();

    await user.click(screen.getByRole("checkbox", { name: /hook text/i }));
    expect(screen.getByTestId("hook-preview")).toHaveTextContent("Hot take");
    expect(screen.queryByTestId("hook-editor")).toBeNull();

    await user.click(screen.getByRole("button", { name: /edit & download/i }));
    const dialog = screen.getByRole("dialog", { name: "Edit clip" });
    expect(within(dialog).getByRole("textbox", { name: "Hook text" })).toHaveValue("Hot take");
  });
});
