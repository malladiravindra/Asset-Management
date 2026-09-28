/**
 * Audit Logs API client — the single place that knows how to talk to the
 * Django /api/audit-logs/ endpoints. Uses the shared api.ts helper so JWT
 * auth, token refresh, and error handling are automatic (see
 * Asset-Management/src/lib/api.ts).
 *
 * Field names in BackendAuditLog EXACTLY match the JSON keys the Django
 * AuditLogSerializer produces (asset_backend/aduitlog/serializers.py):
 * id / action / title / actor / context / timestamp.
 */
import { apiGet, apiPost } from "@/lib/api";
import type { AuditAction } from "@/components/audit-logs/data";

const AUDIT_LOGS_BASE = "/audit-logs";

/** Raw shape returned by GET/POST /api/audit-logs/. */
export interface BackendAuditLog {
  id: number;
  action: AuditAction;
  title: string;
  actor: string;
  context: string;
  timestamp: string; // ISO 8601, server-generated
}

interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

/**
 * Fetch every audit log from the backend, following `next` links until
 * exhausted. The backend paginates (default page_size=8, see
 * aduitlog.views.AuditLogPagination) — the Audit Logs page's own search /
 * action-filter / day-grouping / client pagination
 * (components/audit-logs/log-view.tsx) all operate over the full,
 * already-loaded list, exactly as they did with the old in-memory mock, so
 * this loads the complete set once rather than re-fetching per page click.
 */
export async function fetchAllAuditLogs(): Promise<BackendAuditLog[]> {
  const results: BackendAuditLog[] = [];
  // Ask for a bounded page size (matches the shared apiGetAll() helper in
  // lib/api.ts) instead of the largest page the backend allows
  // (AuditLogPagination.max_page_size=1000) — `next` below still follows
  // however many pages that takes, so the complete log set returned here
  // is unchanged; this just avoids one very large single request.
  let path: string | null = `${AUDIT_LOGS_BASE}/?page_size=50`;
  while (path) {
    const page: PaginatedResponse<BackendAuditLog> = await apiGet<PaginatedResponse<BackendAuditLog>>(path);
    results.push(...page.results);
    path = page.next ? page.next.replace(/^https?:\/\/[^/]+\/api/, "") : null;
  }
  return results;
}

/** POST /api/audit-logs/ → create a manual audit-log entry. The
 * authenticated user automatically becomes the actor — the backend
 * ignores any `actor` field a caller might send (see
 * aduitlog.serializers.AuditLogWriteSerializer). */
export function createAuditLog(input: { action: AuditAction; title: string; context?: string }) {
  return apiPost<BackendAuditLog>(`${AUDIT_LOGS_BASE}/`, {
    action: input.action,
    title: input.title,
    context: input.context ?? "",
  });
}
