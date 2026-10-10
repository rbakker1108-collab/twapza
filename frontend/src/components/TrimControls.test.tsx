import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { TrimControls } from "./TrimControls";

const setup = (over = {}) => {
  const onSave = vi.fn();
  const onDraftChange = vi.fn();
  render(
    <TrimControls start={100} end={140} suggestedStart={100} suggestedEnd={140} videoDuration={600}
      minLength={3} maxLength={90} onSave={onSave} onCancel={() => {}} onDraftChange={onDraftChange} {...over} />,
  );
  return { onSave, onDraftChange, start: screen.getByLabelText("Clip start"), end: screen.getByLabelText("Clip end") };
};

describe("TrimControls", () => {
  it("shows a window of ±30s around the suggestion", () => {
    const { start, end } = setup();
    expect(start).toHaveAttribute("min", "70");
    expect(end).toHaveAttribute("max", "170");
  });

  it("drags both handles and saves", async () => {
    const { start, end, onSave, onDraftChange } = setup();
    fireEvent.change(start, { target: { value: "95.3" } });
    fireEvent.change(end, { target: { value: "150" } });
    expect(onDraftChange).toHaveBeenLastCalledWith(95.3, 150);
    expect(screen.getByText("54.7s")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Save trim" }));
    expect(onSave).toHaveBeenCalledWith(95.3, 150);
  });

  it("never lets start pass end", () => {
    const { start } = setup();
    fireEvent.change(start, { target: { value: "160" } });
    expect(start).toHaveValue("139.9");
  });

  it("blocks saving clips that are too short or too long, and resets", async () => {
    const { start, end } = setup();
    fireEvent.change(start, { target: { value: "138" } });
    expect(screen.getByText(/between 3 and 90 seconds/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save trim" })).toBeDisabled();

    fireEvent.change(start, { target: { value: "70" } });
    fireEvent.change(end, { target: { value: "170" } });
    expect(screen.getByRole("button", { name: "Save trim" })).toBeDisabled(); // 100s > 90

    await userEvent.click(screen.getByRole("button", { name: "Reset to suggestion" }));
    expect(start).toHaveValue("100");
    expect(end).toHaveValue("140");
  });
});
