import { StrictMode } from "react";
import { createRoot, hydrateRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import { App } from "./App";
import { AuthProvider } from "./auth/AuthProvider";
import { I18nProvider, LANGUAGES, type Lang } from "./i18n";
import "./index.css";

const root = document.getElementById("root")!;
// Website pages arrive pre-rendered (scripts/prerender.mjs) in the language of their URL, set on
// <html lang>; React takes over that HTML. Everything else starts empty and renders here.
const prerendered = root.firstElementChild !== null;
const htmlLang = document.documentElement.lang;
const initial = prerendered && LANGUAGES.some((l) => l.code === htmlLang) ? (htmlLang as Lang) : undefined;

const app = (
  <StrictMode>
    <I18nProvider initial={initial}>
      <AuthProvider>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </AuthProvider>
    </I18nProvider>
  </StrictMode>
);

if (prerendered) hydrateRoot(root, app);
else createRoot(root).render(app);
