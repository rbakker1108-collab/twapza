import { useEffect, useState, type FormEvent } from "react";

import { api, type Clip } from "../api/client";
import { useT } from "../i18n";

/** Matches HOOK_MAX_CHARS in backend/twapza/captions/ass.py. */
export const HOOK_MAX_CHARS = 70;

interface Props {
  clip: Clip;
  onChange: (clip: Clip) => void;
}

/**
 * The hook text for one clip (its title), editable before downloading, with Claude's title
 * ideas one click away. Shown on clip cards while the "Hook text" download option is on.
 */
export function HookTextEditor({ clip, onChange }: Props) {
  const t = useT();
  const [draft, setDraft] = useState(clip.title ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [ideas, setIdeas] = useState<string[] | null>(null);
  const [suggesting, setSuggesting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setDraft(clip.title ?? ""), [clip.title]);

  async function save(title: string) {
    const next = title.trim();
    if (next === (clip.title ?? "")) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await api.setClipTitle(clip.id, next);
      onChange(updated);
      setDraft(updated.title ?? "");
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("Saving the hook text failed."));
    } finally {
      setSaving(false);
    }
  }

  async function suggest() {
    setSuggesting(true);
    setError(null);
    try {
      const desc = await api.writeDescription(clip.id);
      setIdeas(desc.titles);
      if (!desc.titles.length) setError(t("No ideas this time. Add a Claude API key, or type your own."));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("Getting ideas failed."));
    } finally {
      setSuggesting(false);
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    save(draft);
  }

  return (
    <form onSubmit={submit} className="space-y-1.5 rounded-lg border border-brand-500/30 bg-brand-500/10 p-2.5" data-testid="hook-editor">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={`hook-${clip.id}`} className="text-sm font-medium">
          {t("Hook text")}
        </label>
        <span className="text-xs text-muted">
          {saving ? t("Saving…") : saved ? t("Saved ✓") : t("shown at the top of the video")}
        </span>
      </div>
      <div className="flex gap-2">
        <input
          id={`hook-${clip.id}`}
          type="text"
          value={draft}
          maxLength={HOOK_MAX_CHARS}
          placeholder={t("e.g. He quit his job for THIS")}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => save(draft)}
          className="min-w-0 flex-1 rounded-md border border-line-strong bg-surface-2 px-2 py-1 text-sm"
        />
        <button
          type="button"
          onClick={suggest}
          disabled={suggesting}
          className="shrink-0 rounded-md border border-line-strong bg-surface px-2 py-1 text-sm hover:bg-surface-2 disabled:opacity-60"
        >
          {suggesting ? t("Thinking…") : t("Suggest")}
        </button>
      </div>
      {ideas && ideas.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {ideas.map((idea) => (
            <button
              key={idea}
              type="button"
              onClick={() => save(idea)}
              aria-pressed={idea === clip.title}
              className={`rounded-full border px-2.5 py-0.5 text-sm ${
                idea === clip.title
                  ? "border-brand-500 bg-brand-500 text-black"
                  : "border-line-strong bg-surface hover:border-brand-400"
              }`}
            >
              {idea}
            </button>
          ))}
        </div>
      )}
      {!draft.trim() && !error && (
        <p className="text-sm text-amber-400">{t("No hook text yet: type one or click Suggest, or this clip downloads without it.")}</p>
      )}
      {error && (
        <p role="alert" className="text-sm text-red-400">
          {error}
        </p>
      )}
    </form>
  );
}
