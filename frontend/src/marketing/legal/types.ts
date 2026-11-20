/** A legal document (privacy policy, terms) in one language. */
export interface LegalDoc {
  title: string;
  intro: string;
  sections: { heading: string; paragraphs: string[] }[];
}

/** Date the texts were last changed (shown on the pages; update it when you change them). */
export const LEGAL_UPDATED = "2026-11-17";

/** Where people reach Twapza (privacy requests, ideas, problems). */
export const CONTACT_EMAIL = "twapza@gmail.com";
