/** Small building blocks shared by the website pages. */
import type { ReactNode } from "react";
import { Link } from "react-router-dom";

export function Section({ id, children, className = "" }: { id?: string; children: ReactNode; className?: string }) {
  return (
    <section id={id} className={`mx-auto max-w-6xl scroll-mt-20 px-4 py-20 ${className}`}>
      {children}
    </section>
  );
}

export function Heading({ eyebrow, title, text, center = true }: { eyebrow?: string; title: string; text?: string; center?: boolean }) {
  return (
    <div className={`mb-12 max-w-2xl space-y-3 ${center ? "mx-auto text-center" : ""}`}>
      {eyebrow && <p className="text-sm font-semibold uppercase tracking-wider text-brand-400">{eyebrow}</p>}
      <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h2>
      {text && <p className="text-lg text-muted">{text}</p>}
    </div>
  );
}

export function PageHero({ title, text }: { title: string; text: string }) {
  return (
    <div className="relative mx-auto max-w-3xl px-4 pt-20 pb-6 text-center">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 -z-10 mx-auto h-64 max-w-lg rounded-full bg-brand-500/15 blur-3xl" />
      <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">{title}</h1>
      <p className="mt-4 text-lg text-muted">{text}</p>
    </div>
  );
}

export function PrimaryButton({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className="inline-flex items-center justify-center rounded-xl bg-brand-500 px-5 py-3 font-semibold text-black transition hover:bg-brand-400">
      {children}
    </Link>
  );
}

export function SecondaryButton({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className="inline-flex items-center justify-center rounded-xl border border-line-strong px-5 py-3 font-medium text-ink transition hover:bg-surface-2">
      {children}
    </Link>
  );
}

const ICONS: Record<string, string> = {
  spark: "M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3Zm7 11 .9 2.1L22 17l-2.1.9L19 20l-.9-2.1L16 17l2.1-.9L19 14Z",
  captions: "M3 6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6Zm4 8h4m2 0h4M7 10h10",
  hook: "M4 5h16v5H4zM7 14h10M9 18h6",
  edit: "M4 20h4L19 9l-4-4L4 16v4ZM13.5 6.5l4 4",
  scissors: "M6 7a3 3 0 1 0 0-.01M6 17a3 3 0 1 0 0 .01M8.5 8.5 20 18M8.5 15.5 20 6",
  text: "M5 6h14M12 6v13M5 20h4M15 20h4",
  globe: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm-9-9h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3Z",
  lock: "M6 10V8a6 6 0 1 1 12 0v2M5 10h14v10H5z",
  upload: "M12 16V4m0 0-4 4m4-4 4 4M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3",
  play: "M8 5v14l11-7-11-7Z",
  download: "M12 4v12m0 0-4-4m4 4 4-4M4 20h16",
  mic: "M12 15a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v6a3 3 0 0 0 3 3Zm-6-3a6 6 0 0 0 12 0M12 18v3",
  video: "M4 6h11v12H4zM15 10l5-3v10l-5-3",
  school: "M3 9l9-5 9 5-9 5-9-5Zm4 2.5V16c1.5 1.3 3.2 2 5 2s3.5-.7 5-2v-4.5",
  game: "M7 9v4M5 11h4M15 10h.01M18 12h.01M6 6h12a4 4 0 0 1 4 4v3a4 4 0 0 1-7 2.6H9A4 4 0 0 1 2 13v-3a4 4 0 0 1 4-4Z",
  team: "M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm8 0a2.5 2.5 0 1 0 0-5M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M17 14c2.5.3 4 2.6 4 5.5",
  check: "M5 12.5 10 17l9-10",
  chart: "M4 20V10m6 10V4m6 16v-7m4 7H3",
  zap: "M13 3 4 14h7l-1 7 9-11h-7l1-7Z",
};

export function Icon({ name, className = "h-5 w-5" }: { name: keyof typeof ICONS | string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <path d={ICONS[name] ?? ICONS.spark} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function IconBadge({ name }: { name: string }) {
  return (
    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-500/15 text-brand-400">
      <Icon name={name} />
    </span>
  );
}
