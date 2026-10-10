import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { PAUSED_MESSAGE, UploadForm, validateFile } from "./UploadForm";

const video = (name = "talk.mp4", size = 1000) => new File([new Uint8Array(size)], name);

describe("UploadForm", () => {
  it("keeps Upload disabled until a file is chosen and rights are confirmed", async () => {
    const user = userEvent.setup();
    const onUpload = vi.fn().mockResolvedValue(undefined);
    render(<UploadForm onUpload={onUpload} />);
    const button = screen.getByRole("button", { name: "Upload" });

    expect(button).toBeDisabled();
    await user.upload(screen.getByTestId("file-input"), video());
    expect(button).toBeDisabled();

    await user.click(screen.getByRole("checkbox"));
    expect(button).toBeEnabled();
    await user.click(button);
    await waitFor(() => expect(onUpload).toHaveBeenCalledOnce());
    expect(onUpload.mock.calls[0][0].name).toBe("talk.mp4");
  });

  it("shows the server error and lets the user retry", async () => {
    const user = userEvent.setup();
    const onUpload = vi.fn().mockRejectedValue(new Error("Disk full"));
    render(<UploadForm onUpload={onUpload} />);
    await user.upload(screen.getByTestId("file-input"), video());
    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: "Upload" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Disk full");
    expect(screen.getByRole("button", { name: "Upload" })).toBeEnabled();
  });
});

describe("validateFile", () => {
  it("rejects unsupported extensions", () => {
    expect(validateFile(video("a.avi"), undefined, ["mp4", "mov", "mkv"])).toMatch(/Unsupported/);
    expect(validateFile(video("A.MKV"), undefined, ["mp4", "mov", "mkv"])).toBeNull();
  });

  it("rejects files over the size limit", () => {
    expect(validateFile(video("a.mp4", 2000), 1000, ["mp4"])).toMatch(/too large/);
  });
});

describe("UploadForm limits and pausing", () => {
  it("rejects a video longer than the limit before uploading", async () => {
    const user = userEvent.setup();
    const onUpload = vi.fn();
    render(<UploadForm onUpload={onUpload} maxDurationSeconds={3 * 3600} getDuration={async () => 4 * 3600} />);
    expect(screen.getByText(/up to 180 minutes/)).toBeInTheDocument();
    await user.upload(screen.getByTestId("file-input"), video());
    expect(await screen.findByRole("alert")).toHaveTextContent("4:00:00 long. The limit is 3:00:00");
    await user.click(screen.getByRole("checkbox"));
    expect(screen.getByRole("button", { name: "Upload" })).toBeDisabled();
  });

  it("accepts a video when its length is unknown (e.g. mkv)", async () => {
    const user = userEvent.setup();
    render(<UploadForm onUpload={vi.fn()} maxDurationSeconds={60} getDuration={async () => null} />);
    await user.upload(screen.getByTestId("file-input"), video("a.mkv"));
    await user.click(screen.getByRole("checkbox"));
    expect(screen.getByRole("button", { name: "Upload" })).toBeEnabled();
  });

  it("can pause an upload", async () => {
    const user = userEvent.setup();
    const onUpload = vi.fn((_f: File, _p: (x: number) => void, signal: AbortSignal) =>
      new Promise<void>((_, reject) => signal.addEventListener("abort", () => reject(new Error("aborted")))));
    render(<UploadForm onUpload={onUpload} />);
    await user.upload(screen.getByTestId("file-input"), video());
    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: "Upload" }));
    await user.click(await screen.findByRole("button", { name: "Pause" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(PAUSED_MESSAGE);
  });
});
