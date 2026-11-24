import { useState, type ReactNode } from "react";
import { Link, NavLink, Outlet, Route, Routes } from "react-router-dom";

import { api } from "./api/client";
import { useAuth } from "./auth/AuthProvider";
import { RequireAuth } from "./auth/RequireAuth";
import { LanguageSwitcher } from "./components/LanguageSwitcher";
import { Logo } from "./components/Logo";
import { useT } from "./i18n";
import { FeaturesPage } from "./marketing/FeaturesPage";
import { ComingSoonPage } from "./marketing/ComingSoonPage";
import { HowItWorksPage } from "./marketing/HowItWorksPage";
import { LandingPage } from "./marketing/LandingPage";
import { PrivacyPage, TermsPage } from "./marketing/LegalPage";
import { PREFIXED_LANGS } from "./marketing/locale";
import { MarketingLayout } from "./marketing/MarketingLayout";
import { PricingPage } from "./marketing/PricingPage";
import { GuidePage, ResourcesPage } from "./marketing/ResourcesPage";
import { SolutionsPage } from "./marketing/SolutionsPage";
import { AccountPage } from "./pages/AccountPage";
import { ForgotPasswordPage, LoginPage, ResetPasswordPage, SignupPage, VerifyEmailPage } from "./pages/AuthPages";
import { ProjectPage } from "./pages/ProjectPage";
import { UploadPage } from "./pages/UploadPage";

/** The website pages, in English at the plain address and under /nl, /es, … in other languages. */
function websitePages(prefix: string) {
  const pages: [string, ReactNode][] = [
    ["/", <LandingPage />],
    ["/features", <FeaturesPage />],
    ["/solutions", <SolutionsPage />],
    ["/pricing", <PricingPage />],
    ["/resources", <ResourcesPage />],
    ["/resources/:slug", <GuidePage />],
    ["/how-it-works", <HowItWorksPage />],
    ["/coming-soon", <ComingSoonPage />],
    ["/privacy", <PrivacyPage />],
    ["/terms", <TermsPage />],
  ];
  return pages.map(([path, element]) => {
    const full = prefix + (path === "/" && prefix ? "" : path);
    return <Route key={full} path={full} element={element} />;
  });
}

/** The website lives at /, /features, … (+ login pages); the app (logged in only) at /app, /projects/:id, /account. */
export function App() {
  return (
    <Routes>
      <Route element={<MarketingLayout />}>
        {websitePages("")}
        {PREFIXED_LANGS.map((lang) => websitePages(`/${lang}`))}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/verify-email" element={<VerifyEmailPage />} />
      </Route>
      <Route element={<RequireAuth><AppLayout /></RequireAuth>}>
        <Route path="/app" element={<UploadPage />} />
        <Route path="/projects/:projectId" element={<ProjectPage />} />
        <Route path="/account" element={<AccountPage />} />
      </Route>
    </Routes>
  );
}

/** Shown in the app until the email address is confirmed (videos can't be added before that). */
function ConfirmEmailBanner({ email }: { email: string }) {
  const t = useT();
  const [state, setState] = useState<"idle" | "sending" | "sent" | "failed">("idle");
  const [error, setError] = useState<string | null>(null);
  return (
    <div role="status" className="border-b border-brand-500/30 bg-brand-500/10">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 text-sm">
        <span className="text-ink">
          {t("Confirm your email address to add videos. We sent a link to {email}.", { email })}
        </span>
        {state === "sent" ? (
          <span className="text-emerald-300">✓ {t("Sent! Check your inbox (and spam folder).")}</span>
        ) : (
          <button
            type="button"
            disabled={state === "sending"}
            onClick={async () => {
              setState("sending");
              setError(null);
              try {
                await api.resendVerification();
                setState("sent");
              } catch (err) {
                setError(err instanceof Error ? err.message : String(err));
                setState("failed");
              }
            }}
            className="font-medium text-brand-400 underline-offset-2 hover:underline disabled:opacity-60"
          >
            {t("Send the email again")}
          </button>
        )}
        {error && <span className="text-red-400">{error}</span>}
      </div>
    </div>
  );
}

function AppLayout() {
  const t = useT();
  const { account } = useAuth();
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-40 border-b border-line bg-canvas/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-6 px-4 py-3">
          <Link to="/" aria-label={t("Twapza home page")}>
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
            <NavLink
              to="/how-it-works"
              className="rounded-lg px-3 py-1.5 text-muted transition hover:text-ink"
            >
              {t("Help")}
            </NavLink>
          </nav>
          <div className="ms-auto flex items-center gap-3">
            <LanguageSwitcher />
            <Link
              to="/app"
              className="hidden rounded-lg bg-brand-500 px-3.5 py-1.5 text-sm font-semibold text-black transition hover:bg-brand-400 sm:inline-block"
            >
              {t("New project")}
            </Link>
            {account && (
              <Link
                to="/account"
                title={account.email}
                aria-label={t("Your account")}
                className="flex items-center gap-2 rounded-lg border border-line px-2 py-1 text-sm hover:bg-surface-2"
              >
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-500 text-xs font-bold uppercase text-black">
                  {account.email[0]}
                </span>
                <span className="text-xs font-semibold uppercase tracking-wide text-brand-300">
                  {account.plan.id === "pro" ? t("Pro") : account.plan.id === "creator" ? t("Creator") : t("Free")}
                </span>
              </Link>
            )}
          </div>
        </div>
      </header>
      {account && !account.email_verified && <ConfirmEmailBanner email={account.email} />}
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10">
        <Outlet />
      </main>
      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-6 text-sm text-faint">
          <Link to="/" className="hover:text-ink">© {new Date().getFullYear()} Twapza</Link>
          <span>{t("Your videos are deleted automatically after 24 hours.")}</span>
          <span className="flex gap-4">
            <Link to="/coming-soon#contact" className="hover:text-ink">{t("Contact")}</Link>
            <Link to="/privacy" className="hover:text-ink">{t("Privacy policy")}</Link>
            <Link to="/terms" className="hover:text-ink">{t("Terms of service")}</Link>
          </span>
        </div>
      </footer>
    </div>
  );
}
