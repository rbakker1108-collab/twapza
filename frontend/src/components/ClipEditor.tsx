import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";

import {
  api, type CaptionFont, type Clip, type ClipWord, type ExportSettings, type OverlayStyle, type TextOverlay,
} from "../api/client";
import { formatDuration } from "../lib/format";
import { CAPTION_FONTS } from "./CaptionOptions";

interface Props {
  clip: Clip;
  settings: ExportSettings;
  proxyUrl: string;
  /** Source width / height, for previewing the "original" format. */
  sourceAspect: number;
  onClose: () => void;
  onSaved: (clip: Clip) => void;
}

type Tab = "text" | "captions";

const STYLES: { id: OverlayStyle; label: string }[] = [
  { id: "outline", label: "Outline" },
  { id: "box", label: "Box" },
  { id: "plain", label: "Shadow" },
];
const HOOK_SECONDS = 3;
const HOOK_SIZE = 0.082; // captions/ass.py HOOK_SIZE
const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
const newId = () => Math.random().toString(36).slice(2, 10);

/** True when the text is on screen at ``t`` seconds into the clip. */
export const isActive = (o: TextOverlay, t: number) => t >= o.start && (o.end === null || t < o.end);

/**
 * Clip editor: drag texts onto the video, style and time them, and fix caption words.
 * Texts are saved on the clip and burned into every download of it; caption fixes apply to
 * the whole project. The stage has the download's shape, and text is drawn at the size it
 * will have in the download (CAPTION_FONTS[*].em mirrors libass sizing).
 */
export function ClipEditor({ clip, settings, proxyUrl, sourceAspect, onClose, onSaved }: Props) {
  const vertical = settings.aspect === "9:16";
  const aspect = vertical ? 9 / 16 : sourceAspect || 16 / 9;
  const stageWidth = vertical ? 300 : Math.min(520, 300 * aspect);
  const stageHeight = stageWidth / aspect;
  const duration = clip.end - clip.start;

  const [tab, setTab] = useState<Tab>("text");
  const [overlays, setOverlays] = useState<TextOverlay[]>(clip.overlays ?? []);
  const [selected, setSelected] = useState<string | null>(clip.overlays?.[0]?.id ?? null);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [words, setWords] = useState<ClipWord[] | null>(null);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const video = useRef<HTMLVideoElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: string; dx: number; dy: number } | null>(null);

  const current = overlays.find((o) => o.id === selected) ?? null;
  const changedOverlays = JSON.stringify(overlays) !== JSON.stringify(clip.overlays ?? []);
  const fixes = useMemo(
    () => (words ?? [])
      .filter((w) => edits[w.start] !== undefined && edits[w.start] !== w.text)
      .map((w) => ({ start: w.start, text: edits[w.start] })),
    [words, edits],
  );
  const dirty = changedOverlays || fixes.length > 0;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    if (tab !== "captions" || words) return;
    api.getClipWords(clip.id).then(setWords).catch((err) => setError(err.message));
  }, [tab, words, clip.id]);

  const update = (id: string, patch: Partial<TextOverlay>) =>
    setOverlays((all) => all.map((o) => (o.id === id ? { ...o, ...patch } : o)));

  function addText() {
    const o: TextOverlay = {
      id: newId(), text: "Your text", x: 0.5, y: vertical ? 0.4 : 0.3, size: vertical ? 0.08 : 0.05,
      font: settings.captions?.font ?? "montserrat", color: "#FFFFFF", style: "outline",
      start: 0, end: null,
    };
    setOverlays((all) => [...all, o]);
    setSelected(o.id);
  }

  function remove(id: string) {
    setOverlays((all) => all.filter((o) => o.id !== id));
    setSelected(null);
  }

  // --- playback (relative to the clip) ---------------------------------------------
  function seek(t: number) {
    const v = video.current;
    setTime(t);
    if (v) v.currentTime = clip.start + t;
  }

  function togglePlay() {
    const v = video.current;
    if (!v) return;
    if (v.paused) {
      if (v.currentTime < clip.start || v.currentTime >= clip.end) v.currentTime = clip.start;
      v.play().catch(() => {});
    } else {
      v.pause();
    }
  }

  // --- dragging ----------------------------------------------------------------------
  function pointerDown(e: ReactPointerEvent, o: TextOverlay) {
    e.preventDefault();
    setSelected(o.id);
    setTab("text");
    const rect = stage.current?.getBoundingClientRect();
    if (!rect || !rect.width) return;
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    drag.current = {
      id: o.id,
      dx: (e.clientX - rect.left) / rect.width - o.x,
      dy: (e.clientY - rect.top) / rect.height - o.y,
    };
  }

  function pointerMove(e: ReactPointerEvent) {
    const d = drag.current;
    const rect = stage.current?.getBoundingClientRect();
    if (!d || !rect || !rect.width) return;
    update(d.id, {
      x: Math.round(clamp((e.clientX - rect.left) / rect.width - d.dx) * 1000) / 1000,
      y: Math.round(clamp((e.clientY - rect.top) / rect.height - d.dy) * 1000) / 1000,
    });
  }

  const pointerUp = () => {
    drag.current = null;
  };

  async function save() {
    setSaving(true);
    setError(null);
    try {
      let saved = clip;
      if (changedOverlays) saved = await api.setOverlays(clip.id, overlays);
      if (fixes.length) {
        const clips = await api.saveCorrections(clip.project_id, fixes);
        const fresh = clips.find((c) => c.id === clip.id);
        if (fresh) saved = { ...fresh, overlays: saved.overlays };
      }
      onSaved(saved);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Saving failed.");
    } finally {
      setSaving(false);
    }
  }

  const fit = vertical && settings.vertical_fit === "crop" ? "object-cover" : "object-contain";
  const hookVisible = settings.hook_text && clip.title && (settings.hook_full || time < HOOK_SECONDS);
  // Same as captions/ass.py: hook size = short side × HOOK_SIZE × font multiplier, in the captions' font.
  const hookFont = CAPTION_FONTS[settings.captions?.font ?? "montserrat"];
  const hookPx = Math.min(stageWidth, stageHeight) * HOOK_SIZE * hookFont.scale * hookFont.em;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/70 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Edit clip"
    >
      <div className="w-full max-w-5xl space-y-4 rounded-2xl bg-white p-5 shadow-xl">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-lg font-semibold">Edit clip{clip.title ? `: ${clip.title}` : ` ${clip.index}`}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg px-2 py-1 text-slate-500 hover:bg-slate-100">
            ✕
          </button>
        </div>

        <div className="flex flex-col gap-6 md:flex-row">
          {/* Stage: the download's frame, with draggable texts on top of the video. */}
          <div className="shrink-0 space-y-2" style={{ width: stageWidth }}>
            <div
              ref={stage}
              data-testid="editor-stage"
              className={`relative select-none overflow-hidden rounded-lg ${settings.vertical_fit === "bars" || !vertical ? "bg-black" : "bg-slate-900"}`}
              style={{ width: stageWidth, height: stageHeight, touchAction: "none" }}
              onPointerMove={pointerMove}
              onPointerUp={pointerUp}
              onPointerLeave={pointerUp}
              onPointerDown={(e) => e.target === e.currentTarget && setSelected(null)}
            >
              {vertical && settings.vertical_fit === "blur" && (
                <img src={clip.thumbnail_url} alt="" aria-hidden className="absolute inset-0 h-full w-full scale-110 object-cover opacity-80 blur-xl" />
              )}
              <video
                ref={video}
                src={`${proxyUrl}#t=${clip.start.toFixed(2)}`}
                poster={clip.thumbnail_url}
                preload="metadata"
                playsInline
                className={`pointer-events-none absolute inset-0 h-full w-full ${fit}`}
                onLoadedMetadata={() => video.current && (video.current.currentTime = clip.start)}
                onPlay={() => setPlaying(true)}
                onPause={() => setPlaying(false)}
                onTimeUpdate={() => {
                  const v = video.current;
                  if (!v) return;
                  if (v.currentTime >= clip.end) {
                    v.pause();
                    v.currentTime = clip.start;
                  }
                  setTime(clamp(v.currentTime - clip.start, 0, duration));
                }}
              />
              {settings.progress_bar && (
                <div className="pointer-events-none absolute inset-x-0 top-0 h-[0.9%] min-h-[3px] bg-black/60">
                  <div className="h-full" style={{ width: `${(time / duration) * 100}%`, background: settings.captions?.highlight_color ?? "#FFFFFF" }} />
                </div>
              )}
              {hookVisible && (
                <span className="pointer-events-none absolute inset-x-[9%] top-[14%] text-center leading-tight">
                  <span
                    className="box-decoration-clone rounded bg-black/80 px-1.5 py-0.5 text-white"
                    style={{ fontSize: hookPx, fontFamily: `"${hookFont.css}", sans-serif` }}
                  >
                    {clip.title}
                  </span>
                </span>
              )}
              {settings.captions && (
                <div
                  data-testid="caption-zone"
                  className="pointer-events-none absolute inset-x-[6%] flex items-center justify-center rounded border border-dashed border-white/50 bg-white/10 text-[10px] font-medium uppercase tracking-wide text-white/80"
                  style={{
                    height: "9%",
                    ...(settings.captions.position === "bottom"
                      ? { bottom: vertical ? "19%" : "7%" }
                      : settings.captions.position === "top"
                        ? { top: vertical ? "11%" : "5%" }
                        : { top: "45.5%" }),
                  }}
                >
                  Captions
                </div>
              )}
              {overlays.map((o) => {
                const shown = isActive(o, time) || o.id === selected;
                if (!shown || !o.text.trim()) return null;
                const font = CAPTION_FONTS[o.font];
                const px = o.size * stageWidth;
                const assSize = px / font.em;
                const style: CSSProperties = {
                  left: `${o.x * 100}%`,
                  top: `${o.y * 100}%`,
                  fontFamily: `"${font.css}", sans-serif`,
                  fontSize: `${px}px`,
                  color: o.color,
                };
                if (o.style === "outline") {
                  style.WebkitTextStroke = `${Math.max(1, assSize * 0.07) * 2}px #000`;
                  style.paintOrder = "stroke fill";
                } else if (o.style === "box") {
                  style.background = "rgba(0,0,0,0.8)";
                  style.padding = `${assSize * 0.1}px ${assSize * 0.22}px`;
                } else {
                  style.textShadow = `0 ${assSize * 0.05}px ${assSize * 0.08}px rgba(0,0,0,0.85)`;
                }
                return (
                  <div
                    key={o.id}
                    role="button"
                    aria-label={`Text: ${o.text}`}
                    data-testid="overlay"
                    onPointerDown={(e) => pointerDown(e, o)}
                    className={`absolute -translate-x-1/2 -translate-y-1/2 cursor-move whitespace-pre text-center leading-[1.15] ${
                      o.id === selected ? "outline-dashed outline-2 outline-offset-4 outline-indigo-400" : ""
                    } ${isActive(o, time) ? "" : "opacity-40"}`}
                    style={style}
                  >
                    {o.text}
                  </div>
                );
              })}
            </div>
            <div className="flex items-center gap-2 text-sm">
              <button
                type="button"
                onClick={togglePlay}
                className="w-16 rounded-md border border-slate-300 px-2 py-1 hover:bg-slate-50"
              >
                {playing ? "Pause" : "Play"}
              </button>
              <input
                type="range"
                aria-label="Position in clip"
                min={0}
                max={duration}
                step={0.1}
                value={time}
                onChange={(e) => seek(Number(e.target.value))}
                className="min-w-0 flex-1 accent-indigo-600"
              />
              <span className="w-24 text-right tabular-nums text-slate-500">
                {formatDuration(time)} / {formatDuration(duration)}
              </span>
            </div>
            <p className="text-xs text-slate-500">
              Drag texts to move them. The dashed area shows where captions appear; they're added when you download.
            </p>
          </div>

          {/* Side panel */}
          <div className="min-w-0 flex-1 space-y-4">
            <div role="tablist" className="inline-flex gap-1 rounded-lg bg-slate-100 p-1 text-sm">
              {(["text", "captions"] as Tab[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  role="tab"
                  aria-selected={tab === t}
                  onClick={() => setTab(t)}
                  className={`rounded-md px-3 py-1 font-medium ${tab === t ? "bg-white shadow-sm" : "text-slate-600"}`}
                >
                  {t === "text" ? "Text" : "Fix captions"}
                </button>
              ))}
            </div>

            {tab === "text" ? (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={addText}
                    className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500"
                  >
                    + Add text
                  </button>
                  {overlays.map((o) => (
                    <button
                      key={o.id}
                      type="button"
                      onClick={() => setSelected(o.id)}
                      aria-pressed={o.id === selected}
                      className={`max-w-[12rem] truncate rounded-full border px-3 py-1 text-sm ${
                        o.id === selected ? "border-indigo-600 bg-indigo-50" : "border-slate-300 hover:border-slate-400"
                      }`}
                    >
                      {o.text.trim() || "(empty)"}
                    </button>
                  ))}
                </div>

                {current ? (
                  <div className="space-y-3 rounded-lg border border-slate-200 p-3 text-sm" data-testid="overlay-form">
                    <label className="block space-y-1">
                      <span className="text-slate-600">Text</span>
                      <textarea
                        value={current.text}
                        rows={2}
                        maxLength={300}
                        onChange={(e) => update(current.id, { text: e.target.value })}
                        className="w-full rounded-md border border-slate-300 px-2 py-1.5"
                      />
                    </label>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="space-y-1">
                        <span className="block text-slate-600">Font</span>
                        <select
                          value={current.font}
                          onChange={(e) => update(current.id, { font: e.target.value as CaptionFont })}
                          className="w-full rounded-md border border-slate-300 px-2 py-1.5"
                        >
                          {Object.entries(CAPTION_FONTS).map(([id, f]) => (
                            <option key={id} value={id}>
                              {f.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="space-y-1">
                        <span className="block text-slate-600">Style</span>
                        <select
                          value={current.style}
                          onChange={(e) => update(current.id, { style: e.target.value as OverlayStyle })}
                          className="w-full rounded-md border border-slate-300 px-2 py-1.5"
                        >
                          {STYLES.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="space-y-1">
                        <span className="block text-slate-600">Size</span>
                        <input
                          type="range"
                          min={0.03}
                          max={0.2}
                          step={0.005}
                          value={current.size}
                          onChange={(e) => update(current.id, { size: Number(e.target.value) })}
                          className="w-full accent-indigo-600"
                        />
                      </label>
                      <label className="space-y-1">
                        <span className="block text-slate-600">Colour</span>
                        <input
                          type="color"
                          value={current.color}
                          onChange={(e) => update(current.id, { color: e.target.value.toUpperCase() })}
                          className="h-8 w-full rounded-md border border-slate-300"
                        />
                      </label>
                    </div>
                    <div className="space-y-2">
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          className="h-4 w-4 accent-indigo-600"
                          checked={current.start === 0 && current.end === null}
                          onChange={(e) =>
                            update(current.id, e.target.checked
                              ? { start: 0, end: null }
                              : { start: Math.min(time, Math.max(0, duration - 1)), end: Math.min(duration, Math.max(time, 0) + 3) })}
                        />
                        Show for the whole clip
                      </label>
                      {!(current.start === 0 && current.end === null) && (
                        <div className="flex flex-wrap items-center gap-2">
                          <TimeField
                            label="From"
                            value={current.start}
                            max={duration}
                            onChange={(v) => update(current.id, { start: v, end: current.end !== null && current.end <= v ? Math.min(duration, v + 1) : current.end })}
                            onNow={() => update(current.id, { start: Math.round(time * 10) / 10 })}
                          />
                          <TimeField
                            label="To"
                            value={current.end ?? duration}
                            max={duration}
                            onChange={(v) => update(current.id, { end: v > current.start ? v : current.start + 0.5 })}
                            onNow={() => update(current.id, { end: Math.max(current.start + 0.5, Math.round(time * 10) / 10) })}
                          />
                        </div>
                      )}
                    </div>
                    <button type="button" onClick={() => remove(current.id)} className="text-red-700 hover:underline">
                      Delete this text
                    </button>
                  </div>
                ) : (
                  <p className="text-sm text-slate-500">
                    {overlays.length ? "Select a text to edit it, or drag it on the video." : "Add a text, then drag it where you want it on the video."}
                  </p>
                )}
              </div>
            ) : (
              <div className="space-y-3 text-sm">
                <p className="text-slate-600">
                  Fix words the transcription got wrong. Clear a word to hide it. Fixes apply to every clip of this video.
                </p>
                {!words ? (
                  <p className="text-slate-500">Loading words…</p>
                ) : words.length === 0 ? (
                  <p className="text-slate-500">No speech in this clip.</p>
                ) : (
                  <div className="flex max-h-80 flex-wrap gap-1.5 overflow-y-auto" data-testid="caption-words">
                    {words.map((w) => {
                      const value = edits[w.start] ?? w.text;
                      const changed = value !== w.original;
                      return (
                        <input
                          key={w.start}
                          aria-label={`Word at ${formatDuration(w.start - clip.start)}`}
                          title={changed ? `Transcribed as “${w.original}”` : undefined}
                          value={value}
                          size={Math.max(2, value.length + 1)}
                          maxLength={60}
                          onFocus={() => seek(clamp(w.start - clip.start, 0, duration))}
                          onChange={(e) => setEdits((all) => ({ ...all, [w.start]: e.target.value }))}
                          className={`rounded border px-1 py-0.5 ${
                            changed ? "border-amber-400 bg-amber-50" : "border-slate-200"
                          } ${value === "" ? "bg-slate-100 line-through" : ""}`}
                        />
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {error && (
          <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2 border-t border-slate-200 pt-4">
          <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-slate-600 hover:bg-slate-100">
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            disabled={!dirty || saving}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:bg-slate-300"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

function TimeField({ label, value, max, onChange, onNow }: {
  label: string; value: number; max: number; onChange: (v: number) => void; onNow: () => void;
}) {
  return (
    <span className="flex items-center gap-1">
      <label className="flex items-center gap-1">
        <span className="text-slate-600">{label}</span>
        <input
          type="number"
          min={0}
          max={max}
          step={0.1}
          value={Math.round(value * 10) / 10}
          onChange={(e) => onChange(clamp(Number(e.target.value), 0, max))}
          className="w-20 rounded-md border border-slate-300 px-2 py-1"
        />
        <span className="text-slate-500">s</span>
      </label>
      <button type="button" onClick={onNow} className="rounded px-1.5 py-1 text-indigo-700 hover:bg-indigo-50">
        Now
      </button>
    </span>
  );
}
