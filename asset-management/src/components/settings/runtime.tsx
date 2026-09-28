"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { ApiError } from "@/lib/api";
import { fetchSettings, type SettingsResponse, type SettingsValues } from "@/components/settings/api";

/**
 * The single owner of GET /settings/. Modules that consume a setting at
 * runtime (Add Asset form defaults, PO default status, maintenance banner)
 * read `values`; the Settings page reads the full `data` (values + meta) to
 * seed its form and hands the PATCH response back through `apply`, so a save
 * never triggers a second GET.
 *
 * `values` is null until loaded or if the request fails; every consumer
 * falls back to its previous built-in behavior in that case.
 */
type RuntimeSettingsValue = {
  values: SettingsValues | null;
  canEdit: boolean;
  data: SettingsResponse | null;
  error: string | null;
  refresh: () => Promise<void>;
  apply: (data: SettingsResponse) => void;
};

const RuntimeSettingsContext = createContext<RuntimeSettingsValue | null>(null);

export function RuntimeSettingsProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<SettingsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const apply = useCallback((next: SettingsResponse) => {
    setData(next);
    setError(null);
  }, []);

  const refresh = useCallback(
    () =>
      fetchSettings().then(apply, (err) => {
        setError(err instanceof ApiError ? err.message : "Could not load settings.");
      }),
    [apply]
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <RuntimeSettingsContext.Provider
      value={{ values: data?.settings ?? null, canEdit: Boolean(data?.meta.can_edit), data, error, refresh, apply }}
    >
      {children}
    </RuntimeSettingsContext.Provider>
  );
}

export function useRuntimeSettings() {
  const ctx = useContext(RuntimeSettingsContext);
  if (!ctx) throw new Error("useRuntimeSettings must be used within a RuntimeSettingsProvider");
  return ctx;
}
