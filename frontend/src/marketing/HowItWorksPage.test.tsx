import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import { HowItWorksPage } from "./HowItWorksPage";

describe("How it works page", () => {
  it("shows the six steps with their screenshots and videos", () => {
    const { container } = render(
      <MemoryRouter>
        <HowItWorksPage />
      </MemoryRouter>,
    );
    expect(screen.getAllByText(/^Step \d of 6$/)).toHaveLength(6);
    expect(screen.getByRole("heading", { name: "Find the best moments" })).toBeInTheDocument();
    const media = [...container.querySelectorAll("img, video")].flatMap((el) =>
      [el.getAttribute("src"), el.getAttribute("poster")].filter(Boolean),
    ) as string[];
    expect(media.length).toBeGreaterThanOrEqual(10);
    for (const src of media) expect(existsSync(join(__dirname, "../../public", src)), src).toBe(true);
  });

  it("is in the sitemap", () => {
    expect(readFileSync(join(__dirname, "../../public/sitemap.xml"), "utf8")).toContain("/how-it-works");
  });
});
