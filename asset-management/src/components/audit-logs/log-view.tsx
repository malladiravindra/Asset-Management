"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Download, Search } from "lucide-react";
import { useAuditLog } from "@/components/audit-logs/context";
import {
  ACTION_META,
  ACTION_ORDER,
  auditLogsToCSV,
  dayLabel,
  timeAgo,
  type AuditAction,
  type AuditLogEntry,
} from "@/components/audit-logs/data";
import { cn } from "@/lib/utils";
import { toDateOnly } from "@/lib/dates";

const PAGE_SIZE = 8;

function downloadCSV(csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `assetflow-audit-log-${toDateOnly(new Date())}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function AuditLogView() {
  const { logs, loading, error } = useAuditLog();
  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState<AuditAction | "All">("All");
  const [page, setPage] = useState(1);

  const sorted = useMemo(
    () => [...logs].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime()),
    [logs]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return sorted.filter((l) => {
      const matchesAction = actionFilter === "All" || l.action === actionFilter;
      const matchesSearch =
        !q ||
        l.title.toLowerCase().includes(q) ||
        l.actor.toLowerCase().includes(q) ||
        (l.context ?? "").toLowerCase().includes(q);
      return matchesAction && matchesSearch;
    });
  }, [sorted, search, actionFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageItems = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const groups = useMemo(() => {
    const map = new Map<string, AuditLogEntry[]>();
    for (const entry of pageItems) {
      const key = dayLabel(entry.timestamp);
      const bucket = map.get(key);
      if (bucket) bucket.push(entry);
      else map.set(key, [entry]);
    }
    return Array.from(map.entries());
  }, [pageItems]);

  function updateSearch(value: string) {
    setSearch(value);
    setPage(1);
  }

  function updateFilter(action: AuditAction | "All") {
    setActionFilter((prev) => (prev === action ? "All" : action));
    setPage(1);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center animate-wipe-in">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Audit Logs</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Track every change across your fleet in real time.
          </p>
        </div>
        <button
          type="button"
          onClick={() => downloadCSV(auditLogsToCSV(filtered))}
          className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          <Download className="h-4 w-4" />
          Export
        </button>
      </div>

      <section
        className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6 animate-wipe-in"
        style={{ animationDelay: "120ms" }}
      >
        <button
          type="button"
          onClick={() => updateFilter("All")}
          className={cn(
            "rounded-2xl border p-4 text-left transition hover:-translate-y-0.5 hover:shadow-md hover:shadow-slate-900/5",
            actionFilter === "All"
              ? "border-blue-500 bg-blue-50/60 dark:border-blue-500 dark:bg-blue-500/10"
              : "border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
          )}
        >
          <p className="text-2xl font-bold text-slate-900 dark:text-white">{logs.length}</p>
          <p className="mt-1 text-xs font-medium text-slate-500 dark:text-slate-400">All Activity</p>
        </button>
        {ACTION_ORDER.map((action) => {
          const meta = ACTION_META[action];
          const count = logs.filter((l) => l.action === action).length;
          const active = actionFilter === action;
          return (
            <button
              key={action}
              type="button"
              onClick={() => updateFilter(action)}
              className={cn(
                "rounded-2xl border p-4 text-left transition hover:-translate-y-0.5 hover:shadow-md hover:shadow-slate-900/5",
                active
                  ? "border-slate-300 bg-slate-50 dark:border-slate-600 dark:bg-slate-800"
                  : "border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
              )}
            >
              <span className={cn("flex h-8 w-8 items-center justify-center rounded-lg", meta.chip)}>
                <meta.icon className="h-4 w-4" strokeWidth={2} />
              </span>
              <p className="mt-3 text-2xl font-bold text-slate-900 dark:text-white">{count}</p>
              <p className="mt-1 text-xs font-medium text-slate-500 dark:text-slate-400">{meta.label}</p>
            </button>
          );
        })}
      </section>

      <div
        className="rounded-2xl border border-slate-200 bg-white shadow-sm shadow-slate-900/[0.02] dark:border-slate-800 dark:bg-slate-900 animate-wipe-in"
        style={{ animationDelay: "240ms" }}
      >
        <div className="border-b border-slate-100 p-4 dark:border-slate-800">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => updateSearch(e.target.value)}
              placeholder="Search activity, assets, employees..."
              className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-500/20 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-100"
            />
          </div>
        </div>

        <div className="p-4">
          {groups.length === 0 ? (
            <p className="py-12 text-center text-sm text-slate-400 dark:text-slate-500">
              {loading
                ? "Loading activity…"
                : error
                ? "Could not load activity. Please try again."
                : "No activity matches your filters."}
            </p>
          ) : (
            groups.map(([label, entries]) => (
              <div key={label} className="mb-5 last:mb-0">
                <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                  {label}
                </p>
                <div className="space-y-1">
                  {entries.map((entry) => {
                    const meta = ACTION_META[entry.action];
                    return (
                      <div
                        key={entry.id}
                        className="flex items-start gap-3 rounded-xl px-2 py-2.5 transition hover:bg-slate-50 dark:hover:bg-slate-800/60"
                      >
                        <span
                          className={cn(
                            "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
                            meta.chip
                          )}
                        >
                          <meta.icon className="h-5 w-5" strokeWidth={2} />
                        </span>
                        <div className="min-w-0 flex-1">
                          <span
                            className={cn(
                              "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
                              meta.chip
                            )}
                          >
                            {meta.label}
                          </span>
                          <p className="mt-1 text-sm font-semibold text-slate-800 dark:text-slate-100">
                            {entry.title}
                          </p>
                          <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">
                            by {entry.actor}
                            {entry.context ? ` · ${entry.context}` : ""} · {timeAgo(entry.timestamp)}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>

        <div className="flex flex-col items-center justify-between gap-3 border-t border-slate-100 p-4 text-sm dark:border-slate-800 sm:flex-row">
          <p className="text-slate-500 dark:text-slate-400">
            Showing {pageItems.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1}–
            {Math.min(currentPage * PAGE_SIZE, filtered.length)} of {filtered.length} events
          </p>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-800 dark:text-slate-400 dark:hover:bg-slate-800"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="px-2 text-slate-600 dark:text-slate-300">
              Page {currentPage} of {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-800 dark:text-slate-400 dark:hover:bg-slate-800"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
