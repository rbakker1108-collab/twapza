import { captionAt, endsSentence, groupWords, type TimedWord } from "./captions";

const T = (text: string, start: number, end: number): TimedWord => ({ text, start, end });

describe("caption pages (mirrors captions/ass.py)", () => {
  it("breaks pages at the word limit, sentence ends and pauses", () => {
    const words = [T("one", 0, 0.3), T("two", 0.4, 0.7), T("three", 0.8, 1.1), T("four.", 1.2, 1.5),
                   T("Five", 1.6, 1.9), T("six", 3.0, 3.3)];
    expect(groupWords(words, 3).map((p) => p.map((w) => w.text))).toEqual([["one", "two", "three"], ["four."], ["Five"], ["six"]]);
    expect(groupWords([], 3)).toEqual([]);
    expect(endsSentence("wow!”")).toBe(true);
    expect(endsSentence("so,")).toBe(false);
  });

  it("highlights the word being spoken and holds the page briefly", () => {
    const pages = groupWords([T("hello", 0.5, 0.9), T("big", 1.0, 1.3), T("world", 1.4, 2.0)], 3);
    expect(captionAt(pages, 0.2, 10)).toBeNull();
    expect(captionAt(pages, 0.6, 10)?.active).toBe(0);
    expect(captionAt(pages, 1.1, 10)?.active).toBe(1);
    expect(captionAt(pages, 2.3, 10)?.active).toBe(2); // within the 0.4 s hold
    expect(captionAt(pages, 2.5, 10)).toBeNull();
  });
});
