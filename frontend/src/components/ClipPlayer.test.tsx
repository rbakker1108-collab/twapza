import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ClipPlayer } from "./ClipPlayer";

describe("ClipPlayer", () => {
  it("does not load the video until played", async () => {
    const { container } = render(<ClipPlayer src="/proxy.mp4" start={10} end={20} poster="/t.jpg" />);
    expect(container.querySelector("video")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Play clip" }));
    const video = container.querySelector("video")!;
    expect(video.getAttribute("src")).toBe("/proxy.mp4#t=10.00");
  });

  it("keeps playback inside the clip range", async () => {
    const { container } = render(<ClipPlayer src="/proxy.mp4" start={10} end={20} />);
    await userEvent.click(screen.getByRole("button", { name: "Play clip" }));
    const video = container.querySelector("video")!;
    const pause = vi.spyOn(video, "pause").mockImplementation(() => {});

    video.currentTime = 3; // before the clip: jump to start on seek
    fireEvent.seeked(video);
    expect(video.currentTime).toBe(10);

    video.currentTime = 20.1; // past the end: stop and rewind
    fireEvent.timeUpdate(video);
    expect(pause).toHaveBeenCalled();
    expect(video.currentTime).toBe(10);
  });
});
