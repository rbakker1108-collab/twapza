import { useEffect, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";

import { useAuth } from "../auth/AuthProvider";
import { LanguageSwitcher } from "../components/LanguageSwitcher";
import { Logo } from "../components/Logo";
import { msg, savedLang, useI18n, useT } from "../i18n";
import { AUDIENCES, TOOLS } from "./content";
import { CONTACT_EMAIL } from "./legal/types";
import { Link, NavLink } from "./links";
import { isLocalizedPath, localize, splitLang } from "./locale";
import { useDocumentHead } from "./useDocumentHead";

interface NavItem {
  to: string;
  label: string;
  children?: { to: string; label: string }[];
}

export const NAV: NavItem[] = [
  { to: "/how-it-works", label: msg("How it works") },
  { to: "/features", label: msg("Features") },
  {
    to: "/solutions",
    label: msg("Solutions"),
    children: AUDIENCES.map((a) => ({ to: `/solutions/${a.slug}`, label: a.title })),
  },
  {
    to: "/tools",
    label: msg("Tools"),
    children: TOOLS.map((x) => ({ to: `/tools/${x.slug}`, label: x.name })),
  },
  { to: "/pricing", label: msg("Pricing") },
  { to: "/resources", label: msg("Resources") },
  { to: "/coming-soon", label: msg("Coming soon") },
];

/** Header, footer and scroll handling for the public website pages. */
export function MarketingLayout() {
  const t = useT();
  const { account } = useAuth();
  const { pathname, search, hash } = useLocation();
  const [open, setOpen] = useState(false);
  const { lang, setLang } = useI18n();
  const navigate = useNavigate();
  const { lang: urlLang, path } = splitLang(pathname);
  const localized = isLocalizedPath(path);
  useDocumentHead(localized ? path : null, lang);

  // On website pages the URL decides the language (/nl/pricing is Dutch). Visitors who picked a
  // language before are sent from the English address to theirs.
  useEffect(() => {
    if (!localized) return;
    if (urlLang !== "en") {
      if (lang !== urlLang) setLang(urlLang);
      return;
    }
    const saved = savedLang();
    if (saved && saved !== "en") navigate(localize(path, saved) + search + hash, { replace: true });
    else if (lang !== "en") setLang("en");
  }, [localized, urlLang, path, lang, setLang, navigate, search, hash]);

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
          <nav className="hidden items-center gap-0.5 whitespace-nowrap text-sm xl:flex">
            {NAV.map((n) =>
              n.children ? (
                <NavMenu key={n.to} item={n} linkClass={link} />
              ) : (
                <NavLink key={n.to} to={n.to} className={link}>
                  {t(n.label)}
                </NavLink>
              ),
            )}
          </nav>
          <div className="ms-auto flex items-center gap-3">
            <div className="hidden sm:block">
              <LanguageSwitcher />
            </div>
            {account ? (
              <Link
                to="/app"
                className="whitespace-nowrap rounded-lg bg-brand-500 px-3.5 py-1.5 text-sm font-semibold text-black transition hover:bg-brand-400"
              >
                {t("Open Twapza")}
              </Link>
            ) : (
              <>
                <Link to="/login" className="hidden whitespace-nowrap text-sm text-muted hover:text-ink sm:block">
                  {t("Log in")}
                </Link>
                <Link
                  to="/signup"
                  className="whitespace-nowrap rounded-lg bg-brand-500 px-3.5 py-1.5 text-sm font-semibold text-black transition hover:bg-brand-400"
                >
                  {t("Start for free")}
                </Link>
              </>
            )}
            <button
              type="button"
              className="rounded-lg p-1.5 text-muted hover:bg-surface-2 xl:hidden"
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
          <nav className="max-h-[75vh] space-y-1 overflow-y-auto border-t border-line px-4 py-3 xl:hidden">
            {NAV.map((n) => (
              <div key={n.to}>
                <NavLink to={n.to} end className={({ isActive }) => `block ${link({ isActive })}`}>
                  {t(n.label)}
                </NavLink>
                {n.children && (
                  <div className="ms-3 border-s border-line ps-2">
                    {n.children.map((c) => (
                      <NavLink key={c.to} to={c.to} className={({ isActive }) => `block text-sm ${link({ isActive })}`}>
                        {t(c.label)}
                      </NavLink>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {!account && (
              <Link to="/login" className={`block ${link({ isActive: false })}`}>
                {t("Log in")}
              </Link>
            )}
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
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr]">
          <div className="space-y-3">
            <Logo />
            <p className="max-w-xs text-sm text-muted">
              {t("Turn long videos into viral Shorts with AI. Made for creators, in your language.")}
            </p>
          </div>
          <div className="space-y-2 text-sm">
            <p className="font-medium text-ink">{t("Product")}</p>
            {NAV.filter((n) => n.to !== "/resources").map((n) => (
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
            <Link to="/compare" className="block text-muted hover:text-ink">
              {t("Compare")}
            </Link>
            <Link to="/#faq" className="block text-muted hover:text-ink">
              {t("FAQ")}
            </Link>
          </div>
          <div className="space-y-2 text-sm">
            <p className="font-medium text-ink">{t("Contact")}</p>
            <a href={`mailto:${CONTACT_EMAIL}`} className="block text-muted hover:text-ink">
              {CONTACT_EMAIL}
            </a>
            <Link to="/privacy" className="block text-muted hover:text-ink">
              {t("Privacy policy")}
            </Link>
            <Link to="/terms" className="block text-muted hover:text-ink">
              {t("Terms of service")}
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

/** A menu item with a dropdown (Solutions, Tools): opens on hover, or with the arrow button. */
function NavMenu({ item, linkClass }: { item: NavItem; linkClass: (a: { isActive: boolean }) => string }) {
  const t = useT();
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [pathname]);
  return (
    <div
      className="relative flex items-center"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
    >
      <NavLink to={item.to} end className={(a) => `${linkClass(a)} pe-1`}>
        {t(item.label)}
      </NavLink>
      <button
        type="button"
        aria-expanded={open}
        aria-label={t(item.label)}
        onClick={() => setOpen(!open)}
        className="rounded p-0.5 text-muted hover:text-ink"
      >
        <svg viewBox="0 0 20 20" className={`h-4 w-4 transition ${open ? "rotate-180" : ""}`} aria-hidden>
          <path fill="none" stroke="currentColor" strokeWidth="1.8" d="m5 8 5 5 5-5" />
        </svg>
      </button>
      {open && (
        <div className="absolute start-0 top-full z-50 pt-2">
          <div className="w-64 rounded-xl border border-line bg-surface p-1.5 shadow-2xl shadow-black/50">
            {item.children!.map((c) => (
              <NavLink
                key={c.to}
                to={c.to}
                className={({ isActive }) =>
                  `block rounded-lg px-3 py-2 ${isActive ? "bg-surface-2 text-ink" : "text-ink-soft hover:bg-surface-2 hover:text-ink"}`}
              >
                {t(c.label)}
              </NavLink>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
