"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { useLoadOnDemand, useRequestLoad, type LoadOptions } from "@/lib/lazy";
import { createAuditLog, fetchAllAuditLogs, type BackendAuditLog } from "@/components/audit-logs/api";
import { type AuditAction, type AuditLogEntry } from "@/components/audit-logs/data";
import { ApiError } from "@/lib/api";

type LogEventInput = {
  action: AuditAction;
  title: string;
  context?: string;
};

type AuditLogContextValue = {
  requestLoad: () => void;
  logs: AuditLogEntry[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  /** Records a manual audit event via POST /api/audit-logs/, then refreshes
   * the list. NOTE: most events (Asset create/update/delete, Assignment,
   * Return) are now recorded automatically by the backend the moment the
   * underlying operation succeeds (see asset_backend/assets/views.py and
   * asset_backend/operations/services.py) — calling this for one of those
   * would create a duplicate entry. Use it only for an event the backend
   * doesn't already log on its own. */
  logEvent: (entry: LogEventInput) => Promise<void>;
};

const AuditLogContext = createContext<AuditLogContextValue | null>(null);

function fromBackend(log: BackendAuditLog): AuditLogEntry {
  return {
    id: log.id,
    action: log.action,
    title: log.title,
    actor: log.actor,
    context: log.context || undefined,
    timestamp: new Date(log.timestamp),
  };
}

export function AuditLogProvider({ children }: { children: ReactNode }) {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [loadRequested, requestLoad] = useLoadOnDemand();

  // Loads the first time the Audit Logs page (or another reader) uses this
  // context — see lib/lazy.ts. `loading`/`error` already start at their
  // correct initial values (true / null).
  useEffect(() => {
    if (!loadRequested) return;
    fetchAllAuditLogs()
      .then((backendLogs) => setLogs(backendLogs.map(fromBackend)))
      .catch((err) => setError(err instanceof ApiError ? err.message : "Could not load audit logs."))
      .finally(() => setLoading(false));
  }, [loadRequested]);

  // Exposed so other modules (Assets/Assignments tables) can re-pull the
  // list right after their own backend-logged operation succeeds — see
  // this file's LogEventInput/logEvent doc comment above.
  const refresh = useCallback(() => {
    if (!loadRequested) return Promise.resolve();
    setLoading(true);
    setError(null);
    return fetchAllAuditLogs()
      .then((backendLogs) => setLogs(backendLogs.map(fromBackend)))
      .catch((err) => setError(err instanceof ApiError ? err.message : "Could not load audit logs."))
      .finally(() => setLoading(false));
  }, [loadRequested]);

  async function logEvent(entry: LogEventInput) {
    await createAuditLog(entry);
    await refresh();
  }

  return (
    <AuditLogContext.Provider value={{ requestLoad, logs, loading, error, refresh, logEvent }}>
      {children}
    </AuditLogContext.Provider>
  );
}

export function useAuditLog(options?: LoadOptions) {
  const ctx = useContext(AuditLogContext);
  useRequestLoad(ctx?.requestLoad, options);
  if (!ctx) throw new Error("useAuditLog must be used within an AuditLogProvider");
  return ctx;
}
