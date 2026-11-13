import { useEffect, useState } from "react";

import { api, type Clip, type ClipDescription } from "../api/client";
import { useT } from "../i18n";

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
  const t = useT();
  const [desc, setDesc] = useState<ClipDescription | null>(null);
  const [text, setText] = useState("");
  const [writing, setWriting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [hookTitle, setHookTitle] = useState<string | null>(currentTitle);
  useEffect(() => setHookTitle(currentTitle), [currentTitle]);

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
        err instanceof Error ? err.message : t("Writing the description failed."),
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
      setError(t("Couldn't copy automatically. Select the text and copy it."));
    }
  }

  async function useAsHook(title: string) {
    setError(null);
    try {
      const clip = await api.setClipTitle(clipId, title);
      setHookTitle(clip.title);
      onTitleChange?.(clip);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("Saving the title failed."));
    }
  }

  return (
    <div
      className="space-y-2 rounded-lg border border-line bg-surface-2 p-3"
      data-testid="description-panel"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium">{t("YouTube description")}</span>
        {writing && <span className="text-sm text-muted">{t("Writing…")}</span>}
      </div>
      <textarea
        aria-label={t("YouTube description")}
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={Math.min(14, Math.max(6, text.split("\n").length + 1))}
        disabled={!desc}
        className="w-full rounded-md border border-line-strong bg-surface px-2.5 py-2 text-sm leading-relaxed"
      />
      {desc && desc.titles.length > 0 && (
        <div className="space-y-1.5">
          <span className="text-sm font-medium">{t("Title ideas")}</span>
          <ul className="space-y-1.5">
            {desc.titles.map((title) => (
              <li key={title} className="flex flex-wrap items-center gap-2 rounded-md bg-surface px-2.5 py-1.5 text-sm">
                <span className="min-w-0 flex-1 font-medium">{title}</span>
                <button
                  type="button"
                  onClick={() => copy(title, title)}
                  className="text-brand-400 hover:underline"
                >
                  {copied === title ? t("Copied ✓") : t("Copy")}
                </button>
                {hookTitle === title ? (
                  <span className="text-emerald-400">✓ {t("Hook text")}</span>
                ) : (
                  <button
                    type="button"
                    onClick={() => useAsHook(title)}
                    className="text-brand-400 hover:underline"
                    title={t("Shown in bold at the top of the video when “Hook text” is on")}
                  >
                    {t("Use as hook text")}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      {desc && !desc.credit && (
        <p className="text-sm text-amber-400">
          {t("No credit yet: fill in “Original creator” above so the description credits them.")}
        </p>
      )}
      {desc && !desc.ai && !writing && !error && (
        <p className="text-sm text-muted">
          {t("Simple description. Add a Claude API key to get AI-written descriptions.")}
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-red-400">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => copy(text, "description")}
          disabled={!desc}
          className="rounded-lg bg-brand-500 px-3 py-1.5 text-sm font-medium text-black hover:bg-brand-400 disabled:bg-surface-3 disabled:text-faint"
        >
          {copied === "description" ? t("Copied ✓") : t("Copy description")}
        </button>
        {(desc?.ai || error) && (
          <button
            type="button"
            onClick={write}
            disabled={writing}
            className="rounded-lg border border-line-strong px-3 py-1.5 text-sm font-medium hover:bg-surface-2 disabled:opacity-60"
          >
            {t("Write another")}
          </button>
        )}
      </div>
    </div>
  );
}
