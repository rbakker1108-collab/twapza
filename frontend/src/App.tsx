import { Link, Route, Routes } from "react-router-dom";

import { ProjectPage } from "./pages/ProjectPage";
import { UploadPage } from "./pages/UploadPage";

export function App() {
  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center px-4 py-3">
          <Link to="/" className="flex items-center gap-2 text-lg font-semibold">
            <img src="/favicon.svg" alt="" className="h-7 w-7" />
            Twapza
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-10">
        <Routes>
          <Route path="/" element={<UploadPage />} />
          <Route path="/projects/:projectId" element={<ProjectPage />} />
        </Routes>
      </main>
    </div>
  );
}
