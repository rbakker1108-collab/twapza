import { useRef, useState } from "react";

interface Props {
  src: string;
  start: number;
  end: number;
  poster?: string;
}

/**
 * Plays only [start, end] of a longer video. The video isn't loaded until the
 * user clicks play, so a grid of many clips stays light.
 */
export function ClipPlayer({ src, start, end, poster }: Props) {
  const ref = useRef<HTMLVideoElement>(null);
  const [active, setActive] = useState(false);

  const clamp = () => {
    const v = ref.current;
    if (!v) return;
    if (v.currentTime < start - 0.25 || v.currentTime >= end) v.currentTime = start;
  };

  if (!active) {
    return (
      <button
        type="button"
        aria-label="Play clip"
        onClick={() => setActive(true)}
        className="group relative block aspect-video w-full overflow-hidden rounded-lg bg-slate-900"
      >
        {poster && <img src={poster} alt="" loading="lazy" className="h-full w-full object-contain" />}
        <span className="absolute inset-0 flex items-center justify-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white/90 shadow transition group-hover:scale-110">
            <svg viewBox="0 0 24 24" className="ml-0.5 h-5 w-5 fill-slate-900" aria-hidden>
              <path d="M8 5v14l11-7z" />
            </svg>
          </span>
        </span>
      </button>
    );
  }

  return (
    <video
      ref={ref}
      src={`${src}#t=${start.toFixed(2)}`}
      poster={poster}
      controls
      autoPlay
      preload="auto"
      className="aspect-video w-full rounded-lg bg-black"
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
  );
}
