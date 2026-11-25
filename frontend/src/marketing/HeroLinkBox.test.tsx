import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";

import { YoutubeImportForm } from "../components/YoutubeImportForm";
import { clearPendingLink, readPendingLink } from "../lib/pendingLink";
import { HeroLinkBox } from "./HeroLinkBox";

describe("hero link box", () => {
  beforeEach(() => clearPendingLink());

  it("remembers a YouTube link and goes to sign-up", async () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <Routes>
          <Route path="/" element={<HeroLinkBox />} />
          <Route path="/signup" element={<p>signup page</p>} />
        </Routes>
      </MemoryRouter>,
    );
    await userEvent.type(screen.getByLabelText("YouTube link"), "https://youtu.be/abc123");
    await userEvent.click(screen.getByRole("button", { name: "Get clips for free" }));
    expect(screen.getByText("signup page")).toBeInTheDocument();
    expect(readPendingLink()).toBe("https://youtu.be/abc123");
  });

  it("refuses something that isn't a YouTube link", async () => {
    render(
      <MemoryRouter>
        <HeroLinkBox />
      </MemoryRouter>,
    );
    await userEvent.type(screen.getByLabelText("YouTube link"), "https://example.com/video");
    await userEvent.click(screen.getByRole("button", { name: "Get clips for free" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Paste a YouTube video link");
    expect(readPendingLink()).toBeNull();
  });

  it("fills the import form but still needs the rights checkbox", async () => {
    const onImport = vi.fn(async () => {});
    render(<YoutubeImportForm initialUrl="https://youtu.be/abc123" onImport={onImport} />);
    expect(screen.getByLabelText("YouTube link")).toHaveValue("https://youtu.be/abc123");
    expect(screen.getByText(/Your link is ready/)).toBeInTheDocument();
    const start = screen.getByRole("button", { name: "Import from YouTube" });
    expect(start).toBeDisabled();
    await userEvent.click(screen.getByRole("checkbox"));
    await userEvent.click(start);
    expect(onImport).toHaveBeenCalledWith("https://youtu.be/abc123");
  });
});
