/**
 * Caption pages for the editor's live preview. Mirrors backend/twapza/captions/ass.py
 * (group_words, caption_events) so the preview shows the same words, lines and highlighted
 * word as the download.
 */

export interface TimedWord {
  text: string;
  start: number;
  end: number;
}

export const PAGE_GAP = 0.6; // a pause longer than this starts a new page
export const HOLD = 0.4; // keep the last page up this long after its last word

const TRAILING = /["'”’)\]}»]+$/;

/** True for words that end a sentence (backend: snapping.word_strength(...) == 2). */
export function endsSentence(text: string): boolean {
  return /[.?!…。？！]$/.test(text.trim().replace(TRAILING, ""));
}

export function groupWords(words: TimedWord[], maxWords: number): TimedWord[][] {
  const pages: TimedWord[][] = [];
  let current: TimedWord[] = [];
  words.forEach((word, i) => {
    current.push(word);
    const next = words[i + 1];
    if (!next || current.length >= maxWords || endsSentence(word.text) || next.start - word.end > PAGE_GAP) {
      pages.push(current);
      current = [];
    }
  });
  return pages;
}

/** The page on screen at ``t`` and which of its words is highlighted, or null. */
export function captionAt(pages: TimedWord[][], t: number, length: number): { page: TimedWord[]; active: number } | null {
  for (let p = 0; p < pages.length; p++) {
    const page = pages[p];
    const nextStart = p + 1 < pages.length ? pages[p + 1][0].start : length;
    const last = page[page.length - 1].end;
    const pageEnd = Math.min(Math.max(last, Math.min(last + HOLD, nextStart)), length);
    if (t >= page[0].start && t < pageEnd) {
      let active = 0;
      page.forEach((w, i) => {
        if (w.start <= t) active = i;
      });
      return { page, active };
    }
  }
  return null;
}
