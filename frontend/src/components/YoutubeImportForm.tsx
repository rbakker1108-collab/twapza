import { useState, type FormEvent } from "react";

interface Props {
  onImport: (url: string) => Promise<void>;
}

/** Quick client-side check; the server validates the link properly. */
export const looksLikeYoutubeLink = (url: string) =>
  /^(https?:\/\/)?((www|m|music)\.)?(youtube\.com|youtu\.be)\/\S+/i.test(url.trim());

export function YoutubeImportForm({ onImport }: Props) {
  const [url, setUrl] = useState("");
  const [rights, setRights] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const canSubmit = url.trim() !== "" && rights && !busy;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    if (!looksLikeYoutubeLink(url)) {
      setError("Paste a YouTube video link, like https://www.youtube.com/watch?v=… or https://youtu.be/….");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await onImport(url.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <div className="space-y-1.5">
        <label htmlFor="youtube-url" className="block text-sm font-medium">
          YouTube link
        </label>
        <input
          id="youtube-url"
          aria-describedby="youtube-url-hint"
          type="text"
          autoComplete="off"
          inputMode="url"
          placeholder="https://www.youtube.com/watch?v=…"
          value={url}
          disabled={busy}
          onChange={(e) => setUrl(e.target.value)}
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
        />
        <p id="youtube-url-hint" className="text-sm text-slate-500">
          A video you posted (public or unlisted). Twapza downloads it in up to 1080p.
        </p>
      </div>

      <label className="flex items-start gap-3 text-sm">
        <input
          type="checkbox"
          className="mt-0.5 h-4 w-4 accent-indigo-600"
          checked={rights}
          disabled={busy}
          onChange={(e) => setRights(e.target.checked)}
        />
        <span>I confirm that I own this video or have permission to use and edit it.</span>
      </label>

      {error && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={!canSubmit}
        className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 font-medium text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-slate-300"
      >
        {busy ? "Starting import…" : "Import from YouTube"}
      </button>
    </form>
  );
}
