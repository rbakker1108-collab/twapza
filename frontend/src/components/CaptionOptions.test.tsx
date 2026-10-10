import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { api } from "../api/client";
import { makeClip, makeConfig, makeProject } from "../test-fixtures";
import { ClipsWorkspace } from "./ClipsWorkspace";

describe("caption options", () => {
  let exportZip: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    vi.spyOn(api, "listClips").mockResolvedValue([makeClip({ source: "ai", title: "T" })]);
    exportZip = vi.spyOn(api, "exportZip").mockRejectedValue(new Error("stop"));
  });
  afterEach(() => vi.restoreAllMocks());

  const zip = async () => {
    const panel = (await screen.findByText(/highlight, best first/)).closest("section")!;
    await userEvent.click(within(panel).getByRole("button", { name: "Download all (ZIP)" }));
  };

  it("are off by default and send captions: null", async () => {
    render(<ClipsWorkspace project={makeProject()} config={makeConfig()} />);
    expect(screen.getByRole("checkbox", { name: /burn in captions/i })).not.toBeChecked();
    expect(screen.queryByTestId("caption-preview")).toBeNull();
    await zip();
    await waitFor(() => expect(exportZip).toHaveBeenCalledWith("p1", "ai", expect.objectContaining({ captions: null })));
  });

  it("sends the chosen caption style and remembers it when toggled", async () => {
    render(<ClipsWorkspace project={makeProject()} config={makeConfig()} />);
    const toggle = screen.getByRole("checkbox", { name: /burn in captions/i });
    await userEvent.click(toggle);
    expect(screen.getByTestId("caption-preview")).toHaveTextContent("THIS IS HOW");

    await userEvent.selectOptions(screen.getByLabelText("Font"), "anton");
    await userEvent.selectOptions(screen.getByLabelText("Position"), "top");
    fireEvent.change(screen.getByLabelText("Highlight colour"), { target: { value: "#00ff00" } });
    fireEvent.change(screen.getByLabelText("Words on screen"), { target: { value: "2" } });
    await userEvent.click(screen.getByRole("checkbox", { name: "UPPERCASE" }));
    expect(screen.getByTestId("caption-preview")).toHaveTextContent(/^this is$/);

    await zip();
    await waitFor(() =>
      expect(exportZip).toHaveBeenLastCalledWith("p1", "ai", expect.objectContaining({
        captions: {
          font: "anton", text_color: "#FFFFFF", highlight_color: "#00FF00", outline_color: "#000000",
          size: "medium", position: "top", words_per_line: 2, uppercase: false,
        },
      })),
    );

    await userEvent.click(toggle); // off …
    await userEvent.click(toggle); // … and on again keeps the style
    expect(screen.getByLabelText("Font")).toHaveValue("anton");
  });
});
