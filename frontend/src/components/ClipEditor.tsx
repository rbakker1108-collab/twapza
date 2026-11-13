import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";

import {
  api, type CaptionFont, type Clip, type ClipWord, type ExportSettings, type Job, type OverlayStyle, type Project,
  type TextOverlay,
} from "../api/client";
import { msg, useT } from "../i18n";
import { captionAt, groupWords, type TimedWord } from "../lib/captions";
import { formatDuration } from "../lib/format";
import { isFinished, runAndDownload } from "../lib/jobs";
import { ARABIC_FALLBACK, CAPTION_FONTS } from "./CaptionOptions";
import { canUpscale, ExportOptions } from "./ExportOptions";
import { HookTextEditor } from "./HookTextEditor";
import { ProgressBar } from "./ProgressBar";

interface Props {
  clip: Clip;
  project: Project;
  /** The download settings (shared with the "Download format" section of the page). */
  settings: ExportSettings;
  onSettingsChange?: (settings: ExportSettings) => void;
  onClose: () => void;
  onSaved: (clip: Clip) => void;
}

type Tab = "text" | "captions" | "format";
const TAB_LABELS: Record<Tab, string> = {
  text: msg("Hook & text"), captions: msg("Fix captions"), format: msg("Format & style"),
};

const FILLERS = new Set(["um", "umm", "uh", "uhh", "uhm", "erm", "er", "ah", "ahh", "hmm", "mm", "mhm",
                         "eh", "ehm", "euh", "ähm", "äh"]); // timeline.FILLERS
const isFiller = (text: string) => FILLERS.has(text.toLowerCase().replace(/[^\p{L}\p{N}_]/gu, ""));
const CAPTION_SIZE = { small: 0.06, medium: 0.075, large: 0.095 }; // ass.SIZE_FACTOR

const STYLES: { id: OverlayStyle; label: string }[] = [
  { id: "outline", label: msg("Outline") },
  { id: "box", label: msg("Box") },
  { id: "plain", label: msg("Shadow") },
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
export function ClipEditor({ clip: initialClip, project, settings: initialSettings, onSettingsChange, onClose, onSaved }: Props) {
  const t = useT();
  const [clip, setClip] = useState(initialClip);
  const [settings, setSettings] = useState(initialSettings);
  const changeSettings = (next: ExportSettings) => {
    setSettings(next);
    onSettingsChange?.(next);
  };
  const proxyUrl = api.proxyUrl(project.id);
  const sourceAspect = project.width && project.height ? project.width / project.height : 16 / 9;
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
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [wordsError, setWordsError] = useState<string | null>(null);
  const rendering = !!job && !isFinished(job);
  const video = useRef<HTMLVideoElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: string; dx: number; dy: number } | null>(null);

  const current = overlays.find((o) => o.id === selected) ?? null;
  const changedOverlays = JSON.stringify(overlays) !== JSON.stringify(clip.overlays ?? []);
  // Caption words on the clip's timeline, with unsaved fixes applied (for the live preview).
  const captionPages = useMemo(() => {
    if (!words || !settings.captions) return [];
    const timed: TimedWord[] = words
      .map((w) => ({ text: (edits[w.start] ?? w.text).trim(), start: w.start - clip.start, end: w.end - clip.start }))
      .filter((w) => w.text && w.end > 0 && !(settings.cut_fillers && isFiller(w.text)))
      .map((w) => ({ ...w, start: Math.max(0, w.start), end: Math.min(duration, w.end) }));
    return groupWords(timed, settings.captions.words_per_line);
  }, [words, edits, settings.captions, settings.cut_fillers, clip.start, duration]);
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

  // Words are needed for the live caption preview and the "Fix captions" tab.
  useEffect(() => {
    api.getClipWords(clip.id).then(setWords).catch((err) => setWordsError(err.message));
  }, [clip.id]);

  const update = (id: string, patch: Partial<TextOverlay>) =>
    setOverlays((all) => all.map((o) => (o.id === id ? { ...o, ...patch } : o)));

  function addText() {
    const o: TextOverlay = {
      id: newId(), text: t("Your text"), x: 0.5, y: vertical ? 0.4 : 0.3, size: vertical ? 0.08 : 0.05,
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

  /** Save texts and caption fixes; returns false if that failed (the error is shown). */
  async function persist(): Promise<boolean> {
    if (!dirty) return true;
    setSaving(true);
    setError(null);
    try {
      let saved = clip;
      if (changedOverlays) saved = await api.setOverlays(clip.id, overlays);
      if (fixes.length) {
        const clips = await api.saveCorrections(clip.project_id, fixes);
        const fresh = clips.find((c) => c.id === clip.id);
        if (fresh) saved = { ...fresh, overlays: saved.overlays, title: saved.title };
        // The fixes are saved: they are now the words' current text.
        setWords((all) => all?.map((w) => (edits[w.start] !== undefined ? { ...w, text: edits[w.start] } : w)) ?? all);
      }
      setClip(saved);
      onSaved(saved);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : t("Saving failed."));
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function save() {
    if (await persist()) onClose();
  }

  /** Save the edits, then render and download the clip with them. */
  async function download() {
    if (!(await persist())) return;
    setError(null);
    const final = { ...settings, upscale_1080: canUpscale(project) && settings.upscale_1080 };
    try {
      await runAndDownload(() => api.exportClip(clip.id, final), setJob);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("Rendering failed."));
    } finally {
      setJob(null);
    }
  }

  function changeTitle(updated: Clip) {
    setClip((c) => ({ ...c, title: updated.title }));
    onSaved({ ...clip, title: updated.title });
  }

  const fit = vertical && settings.vertical_fit === "crop" ? "object-cover" : "object-contain";
  const hookVisible = settings.hook_text && clip.title && (settings.hook_full || time < HOOK_SECONDS);
  // Same as captions/ass.py: hook size = short side × HOOK_SIZE × font multiplier, in the captions' font.
  const hookFont = CAPTION_FONTS[settings.captions?.font ?? "montserrat"];
  const hookPx = Math.min(stageWidth, stageHeight) * HOOK_SIZE * hookFont.scale * hookFont.em;
  const caption = settings.captions ? captionAt(captionPages, time, duration) : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/80 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={t("Edit clip")}
    >
      <div className="w-full max-w-5xl space-y-4 rounded-2xl border border-line bg-surface p-5 shadow-2xl shadow-black/60">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-lg font-semibold">{clip.title ? `${t("Edit clip")}: ${clip.title}` : t("Edit clip {n}", { n: clip.index })}</h2>
          <button type="button" onClick={onClose} aria-label={t("Close editor")} className="rounded-lg px-2 py-1 text-muted hover:bg-surface-2">
            ✕
          </button>
        </div>

        <div className="flex flex-col gap-6 md:flex-row">
          {/* Stage: the download's frame, with draggable texts on top of the video. */}
          <div className="shrink-0 space-y-2" style={{ width: stageWidth }}>
            <div
              ref={stage}
              data-testid="editor-stage"
              dir="ltr"
              className={`relative select-none overflow-hidden rounded-lg ${settings.vertical_fit === "bars" || !vertical ? "bg-black" : "bg-black"}`}
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
                onLoadedMetadata={() => video.current && (video.current.currentTime = clip.start + time)}
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
                    style={{ fontSize: hookPx, fontFamily: `"${hookFont.css}", ${ARABIC_FALLBACK}`, fontWeight: 800 }}
                  >
                    {clip.title}
                  </span>
                </span>
              )}
              {settings.captions && (() => {
                const c = settings.captions;
                const font = CAPTION_FONTS[c.font];
                const short = Math.min(stageWidth, stageHeight);
                const place: CSSProperties = c.position === "bottom"
                  ? { bottom: stageHeight * (vertical ? 0.2 : 0.08) }
                  : c.position === "top"
                    ? { top: stageHeight * (vertical ? 0.12 : 0.06) }
                    : { top: "50%", transform: "translateY(-50%)" };
                if (!caption) {
                  return (
                    <div
                      data-testid="caption-zone"
                      className="pointer-events-none absolute inset-x-[6%] flex h-[7%] items-center justify-center rounded border border-dashed border-white/40 text-[10px] font-medium uppercase tracking-wide text-white/60"
                      style={place}
                    >
                      {t("Captions")}
                    </div>
                  );
                }
                return (
                  <div
                    data-testid="live-caption"
                    className="pointer-events-none absolute inset-x-[6%] text-center leading-tight"
                    style={{
                      ...place,
                      fontFamily: `"${font.css}", ${ARABIC_FALLBACK}`,
                      fontWeight: 800,
                      fontSize: short * CAPTION_SIZE[c.size] * font.scale * font.em,
                      color: c.text_color,
                      WebkitTextStroke: `${Math.max(1, short * 0.006) * 2}px ${c.outline_color}`,
                      paintOrder: "stroke fill",
                    }}
                  >
                    {caption.page.map((w, i) => (
                      <span key={`${w.start}-${i}`} style={i === caption.active ? { color: c.highlight_color } : undefined}>
                        {c.uppercase ? w.text.toUpperCase() : w.text}
                        {i < caption.page.length - 1 ? " " : ""}
                      </span>
                    ))}
                  </div>
                );
              })()}
              {overlays.map((o) => {
                const shown = isActive(o, time) || o.id === selected;
                if (!shown || !o.text.trim()) return null;
                const font = CAPTION_FONTS[o.font];
                const px = o.size * stageWidth;
                const assSize = px / font.em;
                const style: CSSProperties = {
                  left: `${o.x * 100}%`,
                  top: `${o.y * 100}%`,
                  fontFamily: `"${font.css}", ${ARABIC_FALLBACK}`,
                      fontWeight: 800,
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
                    aria-label={t("Text: {text}", { text: o.text })}
                    data-testid="overlay"
                    onPointerDown={(e) => pointerDown(e, o)}
                    className={`absolute -translate-x-1/2 -translate-y-1/2 cursor-move whitespace-pre text-center leading-[1.15] ${
                      o.id === selected ? "outline-dashed outline-2 outline-offset-4 outline-brand-400" : ""
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
                className="w-16 rounded-md border border-line-strong px-2 py-1 hover:bg-surface-2"
              >
                {playing ? t("Pause") : t("Play")}
              </button>
              <input
                type="range"
                aria-label={t("Position in clip")}
                min={0}
                max={duration}
                step={0.1}
                value={time}
                onChange={(e) => seek(Number(e.target.value))}
                className="min-w-0 flex-1 accent-brand-500"
              />
              <span className="w-24 text-end tabular-nums text-muted">
                {formatDuration(time)} / {formatDuration(duration)}
              </span>
            </div>
            <p className="text-xs text-muted">
              {t("Drag texts to move them. Subtitles show as they will in the download; cut pauses, filler removal and the cold open are applied when you download.")}
            </p>
          </div>

          {/* Side panel */}
          <div className="min-w-0 flex-1 space-y-4">
            <div role="tablist" className="inline-flex gap-1 rounded-lg bg-surface-2 p-1 text-sm">
              {(["text", "captions", "format"] as Tab[]).map((id) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={tab === id}
                  onClick={() => setTab(id)}
                  className={`rounded-md px-3 py-1 font-medium ${tab === id ? "bg-surface-3 text-ink shadow-sm" : "text-muted hover:text-ink"}`}
                >
                  {t(TAB_LABELS[id])}
                </button>
              ))}
            </div>

            {tab === "text" ? (
              <div className="space-y-4">
                <div className="space-y-2 rounded-lg border border-line p-3 text-sm" data-testid="hook-section">
                  <label className="flex items-center gap-2 font-medium">
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-brand-500"
                      checked={settings.hook_text}
                      onChange={(e) => changeSettings({ ...settings, hook_text: e.target.checked })}
                    />
                    {t("Show hook text")} <span className="font-normal text-muted">{t("(bold title at the top)")}</span>
                  </label>
                  {settings.hook_text && (
                    <>
                      <HookTextEditor clip={clip} onChange={changeTitle} />
                      <div className="flex flex-wrap gap-4" role="radiogroup" aria-label={t("Hook text duration")}>
                        <label className="flex items-center gap-1.5">
                          <input type="radio" className="accent-brand-500" checked={!settings.hook_full}
                                 onChange={() => changeSettings({ ...settings, hook_full: false })} />
                          {t("First 3 seconds")}
                        </label>
                        <label className="flex items-center gap-1.5">
                          <input type="radio" className="accent-brand-500" checked={settings.hook_full}
                                 onChange={() => changeSettings({ ...settings, hook_full: true })} />
                          {t("Whole clip")}
                        </label>
                      </div>
                    </>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={addText}
                    className="rounded-lg bg-brand-500 px-3 py-1.5 text-sm font-medium text-black hover:bg-brand-400"
                  >
                    + {t("Add text")}
                  </button>
                  {overlays.map((o) => (
                    <button
                      key={o.id}
                      type="button"
                      onClick={() => setSelected(o.id)}
                      aria-pressed={o.id === selected}
                      className={`max-w-[12rem] truncate rounded-full border px-3 py-1 text-sm ${
                        o.id === selected ? "border-brand-500 bg-brand-500/10" : "border-line-strong hover:border-faint"
                      }`}
                    >
                      {o.text.trim() || t("(empty)")}
                    </button>
                  ))}
                </div>

                {current ? (
                  <div className="space-y-3 rounded-lg border border-line p-3 text-sm" data-testid="overlay-form">
                    <label className="block space-y-1">
                      <span className="text-muted">{t("Text")}</span>
                      <textarea
                        value={current.text}
                        rows={2}
                        maxLength={300}
                        onChange={(e) => update(current.id, { text: e.target.value })}
                        className="w-full rounded-md border border-line-strong px-2 py-1.5"
                      />
                    </label>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="space-y-1">
                        <span className="block text-muted">{t("Font")}</span>
                        <select
                          value={current.font}
                          onChange={(e) => update(current.id, { font: e.target.value as CaptionFont })}
                          className="w-full rounded-md border border-line-strong px-2 py-1.5"
                        >
                          {Object.entries(CAPTION_FONTS).map(([id, f]) => (
                            <option key={id} value={id}>
                              {f.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="space-y-1">
                        <span className="block text-muted">{t("Style")}</span>
                        <select
                          value={current.style}
                          onChange={(e) => update(current.id, { style: e.target.value as OverlayStyle })}
                          className="w-full rounded-md border border-line-strong px-2 py-1.5"
                        >
                          {STYLES.map((s) => (
                            <option key={s.id} value={s.id}>
                              {t(s.label)}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="space-y-1">
                        <span className="block text-muted">{t("Size")}</span>
                        <input
                          type="range"
                          min={0.03}
                          max={0.2}
                          step={0.005}
                          value={current.size}
                          onChange={(e) => update(current.id, { size: Number(e.target.value) })}
                          className="w-full accent-brand-500"
                        />
                      </label>
                      <label className="space-y-1">
                        <span className="block text-muted">{t("Colour")}</span>
                        <input
                          type="color"
                          value={current.color}
                          onChange={(e) => update(current.id, { color: e.target.value.toUpperCase() })}
                          className="h-8 w-full rounded-md border border-line-strong"
                        />
                      </label>
                    </div>
                    <div className="space-y-2">
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          className="h-4 w-4 accent-brand-500"
                          checked={current.start === 0 && current.end === null}
                          onChange={(e) =>
                            update(current.id, e.target.checked
                              ? { start: 0, end: null }
                              : { start: Math.min(time, Math.max(0, duration - 1)), end: Math.min(duration, Math.max(time, 0) + 3) })}
                        />
                        {t("Show for the whole clip")}
                      </label>
                      {!(current.start === 0 && current.end === null) && (
                        <div className="flex flex-wrap items-center gap-2">
                          <TimeField
                            label={t("From")}
                            value={current.start}
                            max={duration}
                            onChange={(v) => update(current.id, { start: v, end: current.end !== null && current.end <= v ? Math.min(duration, v + 1) : current.end })}
                            onNow={() => update(current.id, { start: Math.round(time * 10) / 10 })}
                          />
                          <TimeField
                            label={t("To")}
                            value={current.end ?? duration}
                            max={duration}
                            onChange={(v) => update(current.id, { end: v > current.start ? v : current.start + 0.5 })}
                            onNow={() => update(current.id, { end: Math.max(current.start + 0.5, Math.round(time * 10) / 10) })}
                          />
                        </div>
                      )}
                    </div>
                    <button type="button" onClick={() => remove(current.id)} className="text-red-400 hover:underline">
                      {t("Delete this text")}
                    </button>
                  </div>
                ) : (
                  <p className="text-sm text-muted">
                    {overlays.length ? t("Select a text to edit it, or drag it on the video.") : t("Add a text, then drag it where you want it on the video.")}
                  </p>
                )}
              </div>
            ) : tab === "format" ? (
              <div className="text-sm" data-testid="format-tab">
                <p className="mb-3 text-muted">{t("These settings apply to your downloads and are remembered for next time.")}</p>
                <ExportOptions project={project} value={settings} onChange={changeSettings} />
              </div>
            ) : (
              <div className="space-y-3 text-sm">
                {wordsError && <p className="text-red-400">{wordsError}</p>}
                <p className="text-muted">
                  {t("Fix words the transcription got wrong. Clear a word to hide it. Fixes apply to every clip of this video.")}
                </p>
                {!words ? (
                  <p className="text-muted">{t("Loading words…")}</p>
                ) : words.length === 0 ? (
                  <p className="text-muted">{t("No speech in this clip.")}</p>
                ) : (
                  <div className="flex max-h-80 flex-wrap gap-1.5 overflow-y-auto" data-testid="caption-words">
                    {words.map((w) => {
                      const value = edits[w.start] ?? w.text;
                      const changed = value !== w.original;
                      return (
                        <input
                          key={w.start}
                          aria-label={t("Word at {time}", { time: formatDuration(w.start - clip.start) })}
                          title={changed ? t("Transcribed as “{word}”", { word: w.original }) : undefined}
                          value={value}
                          size={Math.max(2, value.length + 1)}
                          maxLength={60}
                          onFocus={() => seek(clamp(w.start - clip.start, 0, duration))}
                          onChange={(e) => setEdits((all) => ({ ...all, [w.start]: e.target.value }))}
                          className={`rounded border px-1 py-0.5 ${
                            changed ? "border-amber-400 bg-amber-500/10" : "border-line"
                          } ${value === "" ? "bg-surface-2 line-through" : ""}`}
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
          <p role="alert" className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">
            {error}
          </p>
        )}
        {rendering && job && (
          <ProgressBar value={job.progress} label={job.status === "queued" ? t("Waiting for a worker…") : t("Rendering your clip…")} />
        )}
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line pt-4">
          <span className="me-auto text-xs text-muted">
            {t("Nothing is rendered until you download. Texts and fixes are saved with the clip.")}
          </span>
          <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-muted hover:bg-surface-2">
            {t("Close")}
          </button>
          <button
            type="button"
            onClick={save}
            disabled={!dirty || saving || rendering}
            className="rounded-lg border border-line-strong px-4 py-2 text-sm font-medium hover:bg-surface-2 disabled:opacity-50"
          >
            {saving && !rendering ? t("Saving…") : t("Save")}
          </button>
          <button
            type="button"
            onClick={download}
            disabled={saving || rendering}
            className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-black hover:bg-brand-400 disabled:cursor-wait disabled:bg-surface-3 disabled:text-faint"
          >
            {rendering ? t("Rendering…") : t("Download")}
          </button>
        </div>
      </div>
    </div>
  );
}

function TimeField({ label, value, max, onChange, onNow }: {
  label: string; value: number; max: number; onChange: (v: number) => void; onNow: () => void;
}) {
  const t = useT();
  return (
    <span className="flex items-center gap-1">
      <label className="flex items-center gap-1">
        <span className="text-muted">{label}</span>
        <input
          type="number"
          min={0}
          max={max}
          step={0.1}
          value={Math.round(value * 10) / 10}
          onChange={(e) => onChange(clamp(Number(e.target.value), 0, max))}
          className="w-20 rounded-md border border-line-strong px-2 py-1"
        />
        <span className="text-muted">s</span>
      </label>
      <button type="button" onClick={onNow} className="rounded px-1.5 py-1 text-brand-400 hover:bg-brand-500/10">
        {t("Now")}
      </button>
    </span>
  );
}
