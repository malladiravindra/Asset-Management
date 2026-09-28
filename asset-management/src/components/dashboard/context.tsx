"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { fetchDashboardSummary, type DashboardSummary } from "@/components/dashboard/api";

type DashboardContextValue = {
  data: DashboardSummary | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  /** Re-fetch only if the summary is older than maxAgeMs; concurrent calls share one request. */
  revalidate: (maxAgeMs: number) => void;
};

const DashboardContext = createContext<DashboardContextValue | null>(null);

/**
 * Single owner of GET /api/dashboard/. The Dashboard page renders it and the
 * sidebar reads its counts for the All Assets / Service / Accessories badges,
 * so one request serves both instead of the sidebar loading five full lists.
 */
export function DashboardProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const loadedAt = useRef(0);
  const inFlight = useRef<Promise<void> | null>(null);

  // Unlike most providers in this app (see models/context.tsx), a failed
  // fetch here does NOT fall back to an empty/zeroed dataset — the
  // Dashboard page must show a real error, never fake zeros standing in
  // for a load failure.
  const refresh = useCallback(() => {
    if (inFlight.current) return inFlight.current;
    setError(null);
    inFlight.current = fetchDashboardSummary()
      .then((summary) => {
        setData(summary);
        loadedAt.current = Date.now();
      })
      .catch((err) => {
        // ApiError (and Error generally) already carries a human-readable
        // .message — see ApiError's constructor in lib/api.ts.
        setError(err instanceof Error ? err.message : "Failed to load dashboard.");
      })
      .finally(() => {
        inFlight.current = null;
        setLoading(false);
      });
    return inFlight.current;
  }, []);

  const revalidate = useCallback(
    (maxAgeMs: number) => {
      if (Date.now() - loadedAt.current >= maxAgeMs) void refresh();
    },
    [refresh]
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <DashboardContext.Provider value={{ data, loading, error, refresh, revalidate }}>
      {children}
    </DashboardContext.Provider>
  );
}

export function useDashboard() {
  const ctx = useContext(DashboardContext);
  if (!ctx) throw new Error("useDashboard must be used within a DashboardProvider");
  return ctx;
}
