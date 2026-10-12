import { useEffect, useState } from "react";

import { api, type ClipDescription } from "../api/client";

interface Props {
  clipId: string;
}

/**
 * A ready-to-paste YouTube Shorts description for one clip: Claude's hook + hashtags with the
 * credit to the original creator. Writes one with Claude the first time it opens.
 */
export function DescriptionPanel({ clipId }: Props) {
  const [desc, setDesc] = useState<ClipDescription | null>(null);
  const [text, setText] = useState("");
  const [writing, setWriting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

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

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Couldn't copy automatically. Select the text and copy it.");
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
          onClick={copy}
          disabled={!desc}
          className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500 disabled:bg-slate-300"
        >
          {copied ? "Copied ✓" : "Copy"}
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
