import { useRef, useState } from "react";

/** How the preview is framed: as uploaded, or approximating a 9:16 export. */
export type PreviewFrame = "original" | "crop" | "blur" | "bars";

interface Props {
  src: string;
  start: number;
  end: number;
  poster?: string;
  frame?: PreviewFrame;
}

/**
 * Plays only [start, end] of a longer video. The video isn't loaded until the
 * user clicks play, so a grid of many clips stays light. For vertical framing,
 * CSS mimics the export: `object-cover` = centre crop, `object-contain` over a
 * blurred copy of the thumbnail = fit with blurred background, `object-contain` on
 * black = fit with black bars.
 */
export function ClipPlayer({ src, start, end, poster, frame = "original" }: Props) {
  const ref = useRef<HTMLVideoElement>(null);
  const [active, setActive] = useState(false);
  const vertical = frame !== "original";
  const fit = frame === "crop" ? "object-cover" : "object-contain";

  const clamp = () => {
    const v = ref.current;
    if (!v) return;
    if (v.currentTime < start - 0.25 || v.currentTime >= end) v.currentTime = start;
  };

  return (
    <div
      data-testid="clip-frame"
      className={`relative w-full overflow-hidden rounded-lg ${frame === "bars" ? "bg-black" : "bg-slate-900"} ${vertical ? "aspect-[9/16]" : "aspect-video"}`}
    >
      {frame === "blur" && poster && (
        <img src={poster} alt="" aria-hidden className="absolute inset-0 h-full w-full scale-110 object-cover opacity-80 blur-xl" />
      )}
      {active ? (
        <video
          ref={ref}
          src={`${src}#t=${start.toFixed(2)}`}
          poster={poster}
          controls
          autoPlay
          preload="auto"
          className={`relative h-full w-full ${fit}`}
          onLoadedMetadata={clamp}
          onPlay={clamp}
          onSeeked={clamp}
          onTimeUpdate={() => {
            const v = ref.current;
            if (v && v.currentTime >= end) {
              v.pause();
              v.currentTime = start;
            }
          }}
        />
      ) : (
        <button
          type="button"
          aria-label="Play clip"
          onClick={() => setActive(true)}
          className="group absolute inset-0 block h-full w-full"
        >
          {poster && <img src={poster} alt="" loading="lazy" className={`relative h-full w-full ${fit}`} />}
          <span className="absolute inset-0 flex items-center justify-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white/90 shadow transition group-hover:scale-110">
              <svg viewBox="0 0 24 24" className="ml-0.5 h-5 w-5 fill-slate-900" aria-hidden>
                <path d="M8 5v14l11-7z" />
              </svg>
            </span>
          </span>
        </button>
      )}
    </div>
  );
}
