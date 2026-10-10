import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

import { api } from "../api/client";
import { UploadPage } from "../pages/UploadPage";
import { makeConfig } from "../test-fixtures";
import { YoutubeImportForm, looksLikeYoutubeLink } from "./YoutubeImportForm";

describe("YoutubeImportForm", () => {
  it("needs a link and the rights confirmation", async () => {
    const user = userEvent.setup();
    const onImport = vi.fn().mockResolvedValue(undefined);
    render(<YoutubeImportForm onImport={onImport} />);
    const button = screen.getByRole("button", { name: "Import from YouTube" });
    expect(button).toBeDisabled();

    await user.type(screen.getByLabelText("YouTube link"), " youtu.be/dQw4w9WgXcQ ");
    expect(button).toBeDisabled();
    await user.click(screen.getByRole("checkbox"));
    await user.click(button);
    await waitFor(() => expect(onImport).toHaveBeenCalledWith("youtu.be/dQw4w9WgXcQ"));
  });

  it("rejects other links before calling the server, and shows server errors", async () => {
    const user = userEvent.setup();
    const onImport = vi.fn().mockRejectedValue(new Error("This video is private."));
    render(<YoutubeImportForm onImport={onImport} />);
    await user.click(screen.getByRole("checkbox"));
    await user.type(screen.getByLabelText("YouTube link"), "https://vimeo.com/1");
    await user.click(screen.getByRole("button", { name: "Import from YouTube" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Paste a YouTube video link");
    expect(onImport).not.toHaveBeenCalled();

    await user.clear(screen.getByLabelText("YouTube link"));
    await user.type(screen.getByLabelText("YouTube link"), "https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    await user.click(screen.getByRole("button", { name: "Import from YouTube" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("This video is private.");
    expect(screen.getByRole("button", { name: "Import from YouTube" })).toBeEnabled();
  });

  it.each([
    ["https://www.youtube.com/watch?v=abc", true],
    ["youtu.be/abc", true],
    ["https://m.youtube.com/shorts/abc", true],
    ["https://vimeo.com/1", false],
    ["youtube.com", false],
  ])("looksLikeYoutubeLink(%s) = %s", (url, expected) => {
    expect(looksLikeYoutubeLink(url)).toBe(expected);
  });
});

describe("UploadPage", () => {
  afterEach(() => vi.restoreAllMocks());
  const renderPage = () => render(<MemoryRouter><UploadPage /></MemoryRouter>);

  beforeEach(() => {
    vi.spyOn(api, "listProjects").mockResolvedValue([]);
  });

  it("starts on the YouTube tab and can switch to uploading a file", async () => {
    vi.spyOn(api, "config").mockResolvedValue(makeConfig());
    const user = userEvent.setup();
    renderPage();
    expect(screen.getByLabelText("YouTube link")).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "Upload a file" }));
    expect(screen.getByRole("button", { name: "Upload" })).toBeInTheDocument();
    expect(screen.queryByLabelText("YouTube link")).toBeNull();
  });

  it("hides the YouTube option when the server has it turned off", async () => {
    vi.spyOn(api, "config").mockResolvedValue(makeConfig({ youtube_enabled: false }));
    renderPage();
    expect(await screen.findByRole("button", { name: "Upload" })).toBeInTheDocument();
    expect(screen.queryByRole("tab")).toBeNull();
  });
});
