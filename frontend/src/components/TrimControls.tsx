import { useState } from "react";

import { formatDuration } from "../lib/format";

interface Props {
  start: number;
  end: number;
  /** Original suggestion, for "Reset". */
  suggestedStart?: number | null;
  suggestedEnd?: number | null;
  videoDuration: number;
  minLength?: number;
  maxLength?: number;
  /** Extra seconds shown either side of the suggestion. */
  margin?: number;
  saving?: boolean;
  onDraftChange?: (start: number, end: number) => void;
  onSave: (start: number, end: number) => void;
  onCancel: () => void;
}

const STEP = 0.1;
const round = (x: number) => Math.round(x * 10) / 10;

/**
 * A two-handle range slider for adjusting a clip's start and end, built from
 * two overlapping native range inputs (keyboard accessible out of the box).
 */
export function TrimControls({
  start, end, suggestedStart, suggestedEnd, videoDuration, minLength = 3, maxLength = 180,
  margin = 30, saving, onDraftChange, onSave, onCancel,
}: Props) {
  const anchorStart = suggestedStart ?? start;
  const anchorEnd = suggestedEnd ?? end;
  const min = Math.max(0, Math.floor(Math.min(anchorStart, start) - margin));
  const max = Math.min(videoDuration, Math.ceil(Math.max(anchorEnd, end) + margin));
  const [draft, setDraft] = useState({ start: round(start), end: round(end) });

  const length = draft.end - draft.start;
  const tooShort = length < minLength;
  const tooLong = length > maxLength;
  const changed = draft.start !== round(start) || draft.end !== round(end);
  const pct = (t: number) => ((t - min) / (max - min || 1)) * 100;

  function update(next: { start: number; end: number }) {
    setDraft(next);
    onDraftChange?.(next.start, next.end);
  }

  const setStart = (v: number) => update({ start: Math.min(round(v), round(draft.end - STEP)), end: draft.end });
  const setEnd = (v: number) => update({ start: draft.start, end: Math.max(round(v), round(draft.start + STEP)) });
  const nudge = (which: "start" | "end", delta: number) =>
    which === "start"
      ? setStart(Math.max(min, draft.start + delta))
      : setEnd(Math.min(max, draft.end + delta));

  const thumb =
    "pointer-events-none absolute inset-0 h-6 w-full appearance-none bg-transparent " +
    "[&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-3 " +
    "[&::-webkit-slider-thumb]:cursor-ew-resize [&::-webkit-slider-thumb]:appearance-none " +
    "[&::-webkit-slider-thumb]:rounded [&::-webkit-slider-thumb]:bg-indigo-600 " +
    "[&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:h-5 [&::-moz-range-thumb]:w-3 " +
    "[&::-moz-range-thumb]:cursor-ew-resize [&::-moz-range-thumb]:rounded [&::-moz-range-thumb]:border-0 " +
    "[&::-moz-range-thumb]:bg-indigo-600";

  return (
    <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
      <div className="relative h-6">
        <div className="absolute top-1/2 h-1.5 w-full -translate-y-1/2 rounded bg-slate-200" />
        <div
          className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded bg-indigo-300"
          style={{ left: `${pct(draft.start)}%`, width: `${pct(draft.end) - pct(draft.start)}%` }}
        />
        <input
          type="range" aria-label="Clip start" className={thumb}
          min={min} max={max} step={STEP} value={draft.start}
          onChange={(e) => setStart(Number(e.target.value))}
        />
        <input
          type="range" aria-label="Clip end" className={thumb}
          min={min} max={max} step={STEP} value={draft.end}
          onChange={(e) => setEnd(Number(e.target.value))}
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-sm tabular-nums">
        <span className="flex items-center gap-1">
          <button type="button" aria-label="Start earlier" onClick={() => nudge("start", -0.5)} className="rounded px-1.5 hover:bg-slate-200">−</button>
          <span>Start {formatDuration(draft.start)}<span className="text-slate-400">.{Math.round((draft.start % 1) * 10)}</span></span>
          <button type="button" aria-label="Start later" onClick={() => nudge("start", 0.5)} className="rounded px-1.5 hover:bg-slate-200">+</button>
        </span>
        <span className={tooShort || tooLong ? "font-medium text-red-700" : "text-slate-600"}>
          {length.toFixed(1)}s
        </span>
        <span className="flex items-center gap-1">
          <button type="button" aria-label="End earlier" onClick={() => nudge("end", -0.5)} className="rounded px-1.5 hover:bg-slate-200">−</button>
          <span>End {formatDuration(draft.end)}<span className="text-slate-400">.{Math.round((draft.end % 1) * 10)}</span></span>
          <button type="button" aria-label="End later" onClick={() => nudge("end", 0.5)} className="rounded px-1.5 hover:bg-slate-200">+</button>
        </span>
      </div>

      {(tooShort || tooLong) && (
        <p className="text-sm text-red-700">
          Clips must be between {minLength} and {maxLength} seconds.
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={!changed || tooShort || tooLong || saving}
          onClick={() => onSave(draft.start, draft.end)}
          className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500 disabled:bg-slate-300"
        >
          {saving ? "Saving…" : "Save trim"}
        </button>
        {suggestedStart != null && suggestedEnd != null && (
          <button
            type="button"
            onClick={() => update({ start: round(suggestedStart), end: round(suggestedEnd) })}
            className="rounded-lg px-3 py-1.5 text-sm hover:bg-slate-200"
          >
            Reset to suggestion
          </button>
        )}
        <button type="button" onClick={onCancel} className="rounded-lg px-3 py-1.5 text-sm hover:bg-slate-200">
          Cancel
        </button>
      </div>
    </div>
  );
}
