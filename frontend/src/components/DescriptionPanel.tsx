import { useEffect, useState } from "react";

import { api, type Clip, type ClipDescription } from "../api/client";

interface Props {
  clipId: string;
  /** The clip's current title (shown as the hook text when that option is on). */
  currentTitle?: string | null;
  onTitleChange?: (clip: Clip) => void;
}

/**
 * A ready-to-paste YouTube Shorts description for one clip: Claude's hook + hashtags with the
 * credit to the original creator. Writes one with Claude the first time it opens.
 */
export function DescriptionPanel({ clipId, currentTitle = null, onTitleChange }: Props) {
  const [desc, setDesc] = useState<ClipDescription | null>(null);
  const [text, setText] = useState("");
  const [writing, setWriting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [hookTitle, setHookTitle] = useState<string | null>(currentTitle);

  const show = (d: ClipDescription) => {
    setDesc(d);
    setText(d.text);
  };

  async function write() {
    setWriting(true);
    setError(null);
    try {
      show(await api.writeDescription(clipId));
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Writing the description failed.",
      );
    } finally {
      setWriting(false);
    }
  }

  useEffect(() => {
    let active = true;
    api
      .getDescription(clipId)
      .then((d) => {
        if (!active) return;
        show(d);
        if (!d.ai) write(); // first time: let Claude write one (simple text if there's no key)
      })
      .catch((err) => active && setError(err.message));
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clipId]);

  async function copy(value: string, what: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(what);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      setError("Couldn't copy automatically. Select the text and copy it.");
    }
  }

  async function useAsHook(title: string) {
    setError(null);
    try {
      const clip = await api.setClipTitle(clipId, title);
      setHookTitle(clip.title);
      onTitleChange?.(clip);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Saving the title failed.");
    }
  }

  return (
    <div
      className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3"
      data-testid="description-panel"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium">YouTube description</span>
        {writing && <span className="text-sm text-slate-500">Writing…</span>}
      </div>
      <textarea
        aria-label="YouTube description"
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={Math.min(14, Math.max(6, text.split("\n").length + 1))}
        disabled={!desc}
        className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-2 text-sm leading-relaxed"
      />
      {desc && desc.titles.length > 0 && (
        <div className="space-y-1.5">
          <span className="text-sm font-medium">Title ideas</span>
          <ul className="space-y-1.5">
            {desc.titles.map((title) => (
              <li key={title} className="flex flex-wrap items-center gap-2 rounded-md bg-white px-2.5 py-1.5 text-sm">
                <span className="min-w-0 flex-1 font-medium">{title}</span>
                <button
                  type="button"
                  onClick={() => copy(title, title)}
                  className="text-indigo-700 hover:underline"
                >
                  {copied === title ? "Copied ✓" : "Copy"}
                </button>
                {hookTitle === title ? (
                  <span className="text-emerald-700">✓ Hook text</span>
                ) : (
                  <button
                    type="button"
                    onClick={() => useAsHook(title)}
                    className="text-indigo-700 hover:underline"
                    title="Shown in bold on the first seconds of the video when “Hook text” is on"
                  >
                    Use as hook text
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      {desc && !desc.credit && (
        <p className="text-sm text-amber-700">
          No credit yet: fill in “Original creator” above so the description
          credits them.
        </p>
      )}
      {desc && !desc.ai && !writing && !error && (
        <p className="text-sm text-slate-500">
          Simple description. Add a Claude API key to get AI-written
          descriptions.
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => copy(text, "description")}
          disabled={!desc}
          className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500 disabled:bg-slate-300"
        >
          {copied === "description" ? "Copied ✓" : "Copy description"}
        </button>
        {(desc?.ai || error) && (
          <button
            type="button"
            onClick={write}
            disabled={writing}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium hover:bg-white disabled:opacity-60"
          >
            Write another
          </button>
        )}
      </div>
    </div>
  );
}
