import { useRef, useState, type DragEvent, type FormEvent } from "react";

import { format, msg, useT, type Vars } from "../i18n";
import { formatBytes, formatDuration } from "../lib/format";
import { browserVideoDuration } from "../lib/upload";
import { ProgressBar } from "./ProgressBar";

const DEFAULT_EXTENSIONS = ["mp4", "mov", "mkv"];

interface Props {
  maxBytes?: number;
  maxDurationSeconds?: number;
  allowedExtensions?: string[];
  onUpload: (file: File, onProgress: (fraction: number) => void, signal: AbortSignal) => Promise<void>;
  /** Reads a file's duration before uploading (null = unknown); injectable for tests. */
  getDuration?: (file: File) => Promise<number | null>;
}

export const PAUSED_MESSAGE = msg(
  "Upload paused. Choose the same file again to continue where you left off.",
);

type T = (text: string, vars?: Vars) => string;

export function validateFile(file: File, maxBytes: number | undefined, extensions: string[], t: T = format): string | null {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (!extensions.includes(ext)) {
    return t("Unsupported file type. Allowed: {types}.", { types: extensions.map((e) => `.${e}`).join(", ") });
  }
  if (maxBytes && file.size > maxBytes) {
    return t("File is too large ({size}). The limit is {limit}.", { size: formatBytes(file.size), limit: formatBytes(maxBytes) });
  }
  return null;
}

export function UploadForm({
  maxBytes, maxDurationSeconds, allowedExtensions = DEFAULT_EXTENSIONS, onUpload,
  getDuration = browserVideoDuration,
}: Props) {
  const t = useT();
  const [file, setFile] = useState<File | null>(null);
  const [rights, setRights] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const [checking, setChecking] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const abort = useRef<AbortController | null>(null);

  const uploading = progress !== null;
  const canSubmit = !!file && rights && !uploading && !checking;

  async function pick(next: File | undefined) {
    if (!next) return;
    const problem = validateFile(next, maxBytes, allowedExtensions, t);
    setError(problem);
    setFile(null);
    if (problem) return;
    if (maxDurationSeconds) {
      // Catch over-long videos before a long upload (the server checks again after upload).
      setChecking(true);
      const duration = await getDuration(next).catch(() => null);
      setChecking(false);
      if (duration && duration > maxDurationSeconds) {
        setError(t("This video is {length} long. The limit is {limit}.", { length: formatDuration(duration), limit: formatDuration(maxDurationSeconds) }));
        return;
      }
    }
    setFile(next);
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    if (!uploading) pick(e.dataTransfer.files[0]);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit || !file) return;
    setError(null);
    setProgress(0);
    abort.current = new AbortController();
    try {
      await onUpload(file, (f) => setProgress(f * 100), abort.current.signal);
    } catch (err) {
      const paused = abort.current?.signal.aborted;
      setError(paused ? t(PAUSED_MESSAGE) : err instanceof Error ? err.message : t("Upload failed."));
      setProgress(null);
    } finally {
      abort.current = null;
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => !uploading && input.current?.click()}
        className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-12 text-center transition ${
          dragging ? "border-brand-500 bg-brand-500/10" : "border-line-strong bg-surface-2 hover:border-faint"
        }`}
      >
        <input
          ref={input}
          type="file"
          data-testid="file-input"
          accept={allowedExtensions.map((e) => `.${e}`).join(",")}
          className="hidden"
          onChange={(e) => pick(e.target.files?.[0])}
        />
        {file ? (
          <>
            <p className="font-medium">{file.name}</p>
            <p className="text-sm text-muted">{formatBytes(file.size)}</p>
          </>
        ) : (
          <>
            <p className="font-medium">{t("Drop a video here or click to browse")}</p>
            <p className="text-sm text-muted">
              {allowedExtensions.map((e) => e.toUpperCase()).join(", ")}
              {maxBytes ? ` · ${t("up to {size}", { size: formatBytes(maxBytes) })}` : ""}
              {maxDurationSeconds ? ` · ${t("up to {n} minutes", { n: Math.round(maxDurationSeconds / 60) })}` : ""}
            </p>
          </>
        )}
      </div>

      <label className="flex items-start gap-3 text-sm">
        <input
          type="checkbox"
          className="mt-0.5 h-4 w-4 accent-brand-500"
          checked={rights}
          disabled={uploading}
          onChange={(e) => setRights(e.target.checked)}
        />
        <span>{t("I confirm that I own this video or have permission to use and edit it.")}</span>
      </label>

      {error && (
        <p role="alert" className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">
          {error}
        </p>
      )}

      {checking && <p className="text-sm text-muted">{t("Checking video length…")}</p>}

      {uploading && (
        <div className="flex items-end gap-3">
          <div className="flex-1">
            <ProgressBar value={progress} label={t("Uploading")} />
          </div>
          <button
            type="button"
            onClick={() => abort.current?.abort()}
            className="rounded-lg px-3 py-1 text-sm text-muted hover:bg-surface-2"
          >
            {t("Pause")}
          </button>
        </div>
      )}

      <button
        type="submit"
        disabled={!canSubmit}
        className="w-full rounded-lg bg-brand-500 px-4 py-2.5 font-semibold text-black transition hover:bg-brand-400 disabled:cursor-not-allowed disabled:bg-surface-3 disabled:text-faint"
      >
        {uploading ? t("Uploading…") : t("Upload")}
      </button>
    </form>
  );
}
