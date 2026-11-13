import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";

import { LanguageSwitcher } from "../components/LanguageSwitcher";
import { Logo } from "../components/Logo";
import { msg, useT } from "../i18n";

export const NAV = [
  { to: "/features", label: msg("Features") },
  { to: "/solutions", label: msg("Solutions") },
  { to: "/pricing", label: msg("Pricing") },
  { to: "/resources", label: msg("Resources") },
];

/** Header, footer and scroll handling for the public website pages. */
export function MarketingLayout() {
  const t = useT();
  const { pathname, hash } = useLocation();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(false);
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView();
    else window.scrollTo(0, 0);
  }, [pathname, hash]);

  const link = ({ isActive }: { isActive: boolean }) =>
    `rounded-lg px-3 py-1.5 transition ${isActive ? "text-ink" : "text-muted hover:text-ink"}`;

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-40 border-b border-line bg-canvas/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-6 px-4 py-3">
          <Link to="/" aria-label="Twapza">
            <Logo />
          </Link>
          <nav className="hidden items-center gap-1 text-sm md:flex">
            {NAV.map((n) => (
              <NavLink key={n.to} to={n.to} className={link}>
                {t(n.label)}
              </NavLink>
            ))}
          </nav>
          <div className="ms-auto flex items-center gap-3">
            <div className="hidden sm:block">
              <LanguageSwitcher />
            </div>
            <Link to="/app" className="hidden text-sm text-muted hover:text-ink sm:block">
              {t("Log in")}
            </Link>
            <Link
              to="/app"
              className="rounded-lg bg-brand-500 px-3.5 py-1.5 text-sm font-semibold text-black transition hover:bg-brand-400"
            >
              {t("Start for free")}
            </Link>
            <button
              type="button"
              className="rounded-lg p-1.5 text-muted hover:bg-surface-2 md:hidden"
              aria-label={t("Menu")}
              aria-expanded={open}
              onClick={() => setOpen(!open)}
            >
              <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden>
                <path stroke="currentColor" strokeWidth="2" strokeLinecap="round" d={open ? "M6 6l12 12M18 6 6 18" : "M4 7h16M4 12h16M4 17h16"} />
              </svg>
            </button>
          </div>
        </div>
        {open && (
          <nav className="space-y-1 border-t border-line px-4 py-3 md:hidden">
            {NAV.map((n) => (
              <NavLink key={n.to} to={n.to} className={({ isActive }) => `block ${link({ isActive })}`}>
                {t(n.label)}
              </NavLink>
            ))}
            <div className="pt-2">
              <LanguageSwitcher />
            </div>
          </nav>
        )}
      </header>

      <main className="flex-1">
        <Outlet />
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:grid-cols-[2fr_1fr_1fr]">
          <div className="space-y-3">
            <Logo />
            <p className="max-w-xs text-sm text-muted">
              {t("Turn long videos into viral Shorts with AI. Made for creators, in your language.")}
            </p>
          </div>
          <div className="space-y-2 text-sm">
            <p className="font-medium text-ink">{t("Product")}</p>
            {NAV.slice(0, 3).map((n) => (
              <Link key={n.to} to={n.to} className="block text-muted hover:text-ink">
                {t(n.label)}
              </Link>
            ))}
          </div>
          <div className="space-y-2 text-sm">
            <p className="font-medium text-ink">{t("Learn")}</p>
            <Link to="/resources" className="block text-muted hover:text-ink">
              {t("Guides")}
            </Link>
            <Link to="/#faq" className="block text-muted hover:text-ink">
              {t("FAQ")}
            </Link>
          </div>
        </div>
        <div className="border-t border-line">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-5 text-sm text-faint">
            <span>© {new Date().getFullYear()} Twapza</span>
            <span>{t("Your videos are deleted automatically after 24 hours.")}</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
