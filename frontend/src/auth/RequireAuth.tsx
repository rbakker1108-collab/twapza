import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";

import { useT } from "../i18n";
import { useAuth } from "./AuthProvider";

/** Shows the page only when logged in; otherwise sends the visitor to /login (and back after). */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { account, loading } = useAuth();
  const location = useLocation();
  const t = useT();
  if (loading) return <p className="py-20 text-center text-muted">{t("Loading…")}</p>;
  if (!account) {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?next=${next}`} replace />;
  }
  return <>{children}</>;
}
