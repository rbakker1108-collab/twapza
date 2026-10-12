import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { api, ApiError, type ClipDescription } from "../api/client";
import { makeProject } from "../test-fixtures";
import { CreditEditor } from "./CreditEditor";
import { DescriptionPanel } from "./DescriptionPanel";

const CREDIT = "Clips used from Joe Fazer’s video “Jungle”";
const desc = (over: Partial<ClipDescription> = {}): ClipDescription => ({
  text: `Hook\n\n${CREDIT}\n\n#shorts`, description: "Hook", hashtags: ["#shorts"], credit: CREDIT,
  ai: true, ...over,
});

describe("DescriptionPanel", () => {
  afterEach(() => vi.restoreAllMocks());

  it("shows a saved description without calling Claude again", async () => {
    vi.spyOn(api, "getDescription").mockResolvedValue(desc());
    const write = vi.spyOn(api, "writeDescription");
    render(<DescriptionPanel clipId="c1" />);
    await waitFor(() => expect(screen.getByLabelText("YouTube description")).toHaveValue(desc().text));
    expect(write).not.toHaveBeenCalled();
  });

  it("writes one the first time, can write another, and copies the text", async () => {
    const user = userEvent.setup();
    vi.spyOn(api, "getDescription").mockResolvedValue(desc({ ai: false, text: "Simple", credit: null }));
    const write = vi.spyOn(api, "writeDescription")
      .mockResolvedValueOnce(desc())
      .mockResolvedValueOnce(desc({ text: "Second" }));
    const clip = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue();
    render(<DescriptionPanel clipId="c1" />);

    await waitFor(() => expect(screen.getByLabelText("YouTube description")).toHaveValue(desc().text));
    expect(write).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole("button", { name: "Write another" }));
    await waitFor(() => expect(screen.getByLabelText("YouTube description")).toHaveValue("Second"));

    await user.type(screen.getByLabelText("YouTube description"), "!");
    await user.click(screen.getByRole("button", { name: "Copy" }));
    expect(clip).toHaveBeenCalledWith("Second!");
    expect(await screen.findByRole("button", { name: "Copied ✓" })).toBeInTheDocument();
  });

  it("asks for a credit when there is none, and shows Claude errors", async () => {
    vi.spyOn(api, "getDescription").mockResolvedValue(desc({ ai: false, credit: null }));
    vi.spyOn(api, "writeDescription").mockRejectedValue(new ApiError(502, "Claude API rate limit reached."));
    render(<DescriptionPanel clipId="c1" />);
    expect(await screen.findByRole("alert")).toHaveTextContent("rate limit");
    expect(screen.getByText(/No credit yet/)).toBeInTheDocument();
  });
});

describe("CreditEditor", () => {
  afterEach(() => vi.restoreAllMocks());

  it("is prefilled and saves edits", async () => {
    const user = userEvent.setup();
    const project = makeProject(1920, 1080, { source_channel: "Joe", source_url: "https://youtu.be/x" });
    const update = vi.spyOn(api, "updateCredit").mockImplementation(async (_id, c) => ({ ...project, ...c }));
    const onSaved = vi.fn();
    render(<CreditEditor project={project} onSaved={onSaved} />);

    const save = screen.getByRole("button", { name: "Save credit" });
    expect(save).toBeDisabled();
    expect(screen.getByLabelText("Creator")).toHaveValue("Joe");
    await user.clear(screen.getByLabelText("Creator"));
    await user.type(screen.getByLabelText("Creator"), "Joe Fazer");
    await user.click(save);
    await waitFor(() => expect(update).toHaveBeenCalledWith("p1", {
      source_channel: "Joe Fazer", source_title: "", source_url: "https://youtu.be/x", source_channel_url: "",
    }));
    expect(onSaved).toHaveBeenCalled();
  });

  it("shows validation errors", async () => {
    const user = userEvent.setup();
    vi.spyOn(api, "updateCredit").mockRejectedValue(new ApiError(422, "must be a link starting with https://"));
    render(<CreditEditor project={makeProject()} onSaved={vi.fn()} />);
    await user.type(screen.getByLabelText("Channel link"), "joe");
    await user.click(screen.getByRole("button", { name: "Save credit" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("must be a link");
  });
});
