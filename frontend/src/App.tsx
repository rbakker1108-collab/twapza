import { Link, NavLink, Outlet, Route, Routes } from "react-router-dom";

import { LanguageSwitcher } from "./components/LanguageSwitcher";
import { Logo } from "./components/Logo";
import { useT } from "./i18n";
import { FeaturesPage } from "./marketing/FeaturesPage";
import { LandingPage } from "./marketing/LandingPage";
import { MarketingLayout } from "./marketing/MarketingLayout";
import { PricingPage } from "./marketing/PricingPage";
import { GuidePage, ResourcesPage } from "./marketing/ResourcesPage";
import { SolutionsPage } from "./marketing/SolutionsPage";
import { ProjectPage } from "./pages/ProjectPage";
import { UploadPage } from "./pages/UploadPage";

/** The website lives at /, /features, …; the app itself at /app and /projects/:id. */
export function App() {
  return (
    <Routes>
      <Route element={<MarketingLayout />}>
        <Route path="/" element={<LandingPage />} />
        <Route path="/features" element={<FeaturesPage />} />
        <Route path="/solutions" element={<SolutionsPage />} />
        <Route path="/pricing" element={<PricingPage />} />
        <Route path="/resources" element={<ResourcesPage />} />
        <Route path="/resources/:slug" element={<GuidePage />} />
      </Route>
      <Route element={<AppLayout />}>
        <Route path="/app" element={<UploadPage />} />
        <Route path="/projects/:projectId" element={<ProjectPage />} />
      </Route>
    </Routes>
  );
}

function AppLayout() {
  const t = useT();
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-40 border-b border-line bg-canvas/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-6 px-4 py-3">
          <Link to="/app" aria-label="Twapza">
            <Logo />
          </Link>
          <nav className="hidden items-center gap-1 text-sm sm:flex">
            <NavLink
              to="/app"
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
              to="/app"
              className="rounded-lg bg-brand-500 px-3.5 py-1.5 text-sm font-semibold text-black transition hover:bg-brand-400"
            >
              {t("New project")}
            </Link>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10">
        <Outlet />
      </main>
      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-6 text-sm text-faint">
          <Link to="/" className="hover:text-ink">© {new Date().getFullYear()} Twapza</Link>
          <span>{t("Your videos are deleted automatically after 24 hours.")}</span>
        </div>
      </footer>
    </div>
  );
}
