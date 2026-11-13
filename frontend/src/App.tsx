import { Link, NavLink, Route, Routes } from "react-router-dom";

import { LanguageSwitcher } from "./components/LanguageSwitcher";
import { Logo } from "./components/Logo";
import { useT } from "./i18n";
import { ProjectPage } from "./pages/ProjectPage";
import { UploadPage } from "./pages/UploadPage";

export function App() {
  const t = useT();
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-40 border-b border-line bg-canvas/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-6 px-4 py-3">
          <Link to="/" aria-label="Twapza">
            <Logo />
          </Link>
          <nav className="hidden items-center gap-1 text-sm sm:flex">
            <NavLink
              to="/"
              end
              className={({ isActive }) =>
                `rounded-lg px-3 py-1.5 transition ${isActive ? "bg-surface-2 text-ink" : "text-muted hover:text-ink"}`}
            >
              {t("Projects")}
            </NavLink>
          </nav>
          <div className="ms-auto flex items-center gap-3">
            <LanguageSwitcher />
            <Link
              to="/"
              className="rounded-lg bg-brand-500 px-3.5 py-1.5 text-sm font-semibold text-black transition hover:bg-brand-400"
            >
              {t("New project")}
            </Link>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10">
        <Routes>
          <Route path="/" element={<UploadPage />} />
          <Route path="/projects/:projectId" element={<ProjectPage />} />
        </Routes>
      </main>
      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-6 text-sm text-faint">
          <span>© {new Date().getFullYear()} Twapza</span>
          <span>{t("Your videos are deleted automatically after 24 hours.")}</span>
        </div>
      </footer>
    </div>
  );
}
