import { useState, type FormEvent } from "react";

import { api, type Credit, type Project } from "../api/client";
import { msg, useT } from "../i18n";

interface Props {
  project: Project;
  onSaved: (project: Project) => void;
}

const FIELDS: { key: keyof Credit; label: string; placeholder: string }[] = [
  { key: "source_channel", label: msg("Creator"), placeholder: "Joe Fazer" },
  { key: "source_title", label: msg("Video title"), placeholder: "I Survived Alone In The Amazon…" },
  { key: "source_url", label: msg("Video link"), placeholder: "https://www.youtube.com/watch?v=…" },
  { key: "source_channel_url", label: msg("Channel link"), placeholder: "https://www.youtube.com/@…" },
];

const pick = (p: Project): Credit => ({
  source_channel: p.source_channel ?? "",
  source_title: p.source_title ?? "",
  source_url: p.source_url ?? "",
  source_channel_url: p.source_channel_url ?? "",
});

/** Who made the original video; shown as a credit in every clip description. */
export function CreditEditor({ project, onSaved }: Props) {
  const t = useT();
  const [values, setValues] = useState<Credit>(() => pick(project));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const dirty = FIELDS.some(({ key }) => (values[key] ?? "") !== (pick(project)[key] ?? ""));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const next = await api.updateCredit(project.id, values);
      onSaved(next);
      setValues(pick(next));
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("Saving failed."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-2xl border border-line bg-surface p-5">
      <div>
        <h2 className="font-medium">{t("Original creator")}</h2>
        <p className="text-sm text-muted">
          {t("Credited at the bottom of every clip description.")}
          {project.source_url ? ` ${t("Filled in from YouTube; edit if needed.")}` : ""}
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {FIELDS.map(({ key, label, placeholder }) => (
          <label key={key} className="space-y-1 text-sm">
            <span className="block text-muted">{t(label)}</span>
            <input
              type="text"
              value={values[key] ?? ""}
              placeholder={placeholder}
              onChange={(e) => setValues({ ...values, [key]: e.target.value })}
              className="w-full rounded-md border border-line-strong bg-surface-2 px-2.5 py-1.5"
            />
          </label>
        ))}
      </div>
      {error && (
        <p role="alert" className="text-sm text-red-400">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={saving || !dirty}
        className="rounded-lg border border-line-strong px-3 py-1.5 text-sm font-medium hover:bg-surface-2 disabled:opacity-50"
      >
        {saved ? t("Saved ✓") : saving ? t("Saving…") : t("Save credit")}
      </button>
    </form>
  );
}
