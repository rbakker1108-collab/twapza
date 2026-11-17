import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import { I18nProvider, LANGUAGES, useI18n } from "../../i18n";
import { PrivacyPage, TermsPage } from "../LegalPage";
import { PRIVACY } from "./privacy";
import { TERMS } from "./terms";
import { CONTACT_EMAIL } from "./types";

describe("legal pages", () => {
  it.each(LANGUAGES.map((l) => l.code))("%s has a privacy policy and terms with the contact address", (code) => {
    for (const doc of [PRIVACY[code], TERMS[code]]) {
      expect(doc.sections.length).toBeGreaterThan(5);
      expect(JSON.stringify(doc)).toContain(CONTACT_EMAIL);
    }
    // same structure as the English text, so no section is forgotten in a translation
    expect(PRIVACY[code].sections.map((s) => s.paragraphs.length)).toEqual(PRIVACY.en.sections.map((s) => s.paragraphs.length));
    expect(TERMS[code].sections.map((s) => s.paragraphs.length)).toEqual(TERMS.en.sections.map((s) => s.paragraphs.length));
  });

  it("renders the page in the chosen language with a mail link", () => {
    render(
      <I18nProvider initial="nl">
        <MemoryRouter>
          <PrivacyPage />
          <TermsPage />
        </MemoryRouter>
      </I18nProvider>,
    );
    expect(screen.getByRole("heading", { level: 1, name: "Privacybeleid" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Algemene voorwaarden" })).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: CONTACT_EMAIL })[0]).toHaveAttribute("href", `mailto:${CONTACT_EMAIL}`);
  });
});

describe("language", () => {
  function Shown() {
    return <p>{useI18n().lang}</p>;
  }

  it("starts in English, whatever the browser's language is", () => {
    vi.spyOn(navigator, "languages", "get").mockReturnValue(["nl-NL", "nl"]);
    render(
      <I18nProvider>
        <Shown />
      </I18nProvider>,
    );
    expect(screen.getByText("en")).toBeInTheDocument();
    vi.restoreAllMocks();
  });

  it("keeps a language the visitor chose", () => {
    localStorage.setItem("twapza.lang", "de");
    render(
      <I18nProvider>
        <Shown />
      </I18nProvider>,
    );
    expect(screen.getByText("de")).toBeInTheDocument();
  });
});
