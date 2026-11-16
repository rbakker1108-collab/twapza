import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { api, ApiError, type Account, type BillingPeriod, type PlanId } from "../api/client";

interface AuthState {
  /** The logged-in account, or null. */
  account: Account | null;
  /** True until the first /api/auth/me answer. */
  loading: boolean;
  setAccount: (account: Account | null) => void;
  refresh: () => Promise<Account | null>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState>({
  account: null,
  loading: false,
  setAccount: () => {},
  refresh: async () => null,
  logout: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [account, setAccount] = useState<Account | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const me = await api.me();
      setAccount(me);
      return me;
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) setAccount(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const logout = useCallback(async () => {
    try {
      await api.logout();
    } finally {
      setAccount(null);
    }
  }, []);

  const value = useMemo(() => ({ account, loading, setAccount, refresh, logout }), [account, loading, refresh, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  return useContext(AuthContext);
}

/**
 * What the current plan allows. Without an account loaded (e.g. in component tests) everything is
 * allowed: the server enforces the real limits either way.
 */
export function usePlan(): Account["plan"] {
  const { account } = useAuth();
  return (
    account?.plan ?? {
      id: "pro",
      minutes: 0,
      max_video_minutes: 0,
      watermark: false,
      editing: true,
      zip: true,
      priority: false,
    }
  );
}

/** Start paying for a plan: a new Lemon Squeezy checkout, or a switch of the current subscription. */
export async function choosePlan(
  account: Account,
  plan: PlanId,
  period: BillingPeriod,
): Promise<Account | null> {
  const sub = account.subscription;
  const active = sub && sub.plan !== "free" && ["active", "on_trial", "past_due", "paused"].includes(sub.status ?? "");
  if (active) return api.changePlan(plan, period);
  const { url } = await api.checkout(plan, period);
  window.location.assign(url);
  return null;
}
