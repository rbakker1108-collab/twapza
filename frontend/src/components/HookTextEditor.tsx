import { useEffect, useState, type FormEvent } from "react";

import { api, type Clip } from "../api/client";

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
      setError(err instanceof Error ? err.message : "Saving the hook text failed.");
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
      if (!desc.titles.length) setError("No ideas this time. Add a Claude API key, or type your own.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Getting ideas failed.");
    } finally {
      setSuggesting(false);
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    save(draft);
  }

  return (
    <form onSubmit={submit} className="space-y-1.5 rounded-lg border border-indigo-200 bg-indigo-50/60 p-2.5" data-testid="hook-editor">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={`hook-${clip.id}`} className="text-sm font-medium">
          Hook text
        </label>
        <span className="text-xs text-slate-500">
          {saving ? "Saving…" : saved ? "Saved ✓" : "shown on the first 3 seconds"}
        </span>
      </div>
      <div className="flex gap-2">
        <input
          id={`hook-${clip.id}`}
          type="text"
          value={draft}
          maxLength={HOOK_MAX_CHARS}
          placeholder="e.g. He quit his job for THIS"
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => save(draft)}
          className="min-w-0 flex-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-sm"
        />
        <button
          type="button"
          onClick={suggest}
          disabled={suggesting}
          className="shrink-0 rounded-md border border-slate-300 bg-white px-2 py-1 text-sm hover:bg-slate-50 disabled:opacity-60"
        >
          {suggesting ? "Thinking…" : "Suggest"}
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
                  ? "border-indigo-600 bg-indigo-600 text-white"
                  : "border-slate-300 bg-white hover:border-indigo-400"
              }`}
            >
              {idea}
            </button>
          ))}
        </div>
      )}
      {!draft.trim() && !error && (
        <p className="text-sm text-amber-700">No hook text yet: type one or click Suggest, or this clip downloads without it.</p>
      )}
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
    </form>
  );
}
