/** The Twapza mark: a "T" whose bar ends in a diagonal cut (a clip). Same as public/favicon.svg. */
export function LogoMark({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <defs>
        <linearGradient id="twapza-mark" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ff9a4d" />
          <stop offset="1" stopColor="#ff5a00" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill="url(#twapza-mark)" />
      <path d="M7.5 8.5h17l-2.2 4.6h-4.1v11.4h-4.6V13.1H7.5z" fill="#0a0a0b" />
    </svg>
  );
}

export function Logo() {
  return (
    <span className="flex items-center gap-2.5" dir="ltr">
      <LogoMark />
      <span className="text-lg font-semibold tracking-tight text-ink">Twapza</span>
    </span>
  );
}
