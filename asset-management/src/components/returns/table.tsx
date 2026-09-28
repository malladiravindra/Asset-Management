"use client";

import { useMemo, useState } from "react";
import {
  AlertOctagon,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Eye,
  Plus,
  Search,
  Undo2,
  X,
} from "lucide-react";
import { useCan } from "@/components/auth/context";
import { useAssignments } from "@/components/assignments/context";
import {
  RETURN_CONDITIONS,
  RETURN_CONDITION_STYLES,
  RETURN_REASONS,
  type Assignment,
  type ReturnCondition,
} from "@/components/assignments/data";
import { returnDurationDays } from "@/components/returns/data";
import { useReturns } from "@/components/returns/context";
import { ReturnDetailModal } from "@/components/returns/detail-modal";
import { useAssets } from "@/components/assets/context";
import { TODAY, formatDate } from "@/components/assets/data";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { parseDateOnly, toDateOnly } from "@/lib/dates";

const PAGE_SIZE = 10;

type PendingReturn = { assignment: Assignment; returnDate: string; condition: ReturnCondition; reason: string };

const AVATAR_TONES = [
  "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300",
  "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300",
  "bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300",
  "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300",
  "bg-cyan-100 text-cyan-700 dark:bg-cyan-500/20 dark:text-cyan-300",
];

function initials(name: string) {
  return name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function avatarTone(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash + name.charCodeAt(i)) % AVATAR_TONES.length;
  return AVATAR_TONES[hash];
}

function dateInputValue(d: Date) {
  return toDateOnly(d);
}

export function ReturnsTable() {
  const { assignments } = useAssignments();
  const { refreshAsset } = useAssets({ load: false });
  const { returns, createReturn } = useReturns();
  const { showSuccess, showErrorFromException } = useToast();
  const canAdd = useCan("operations.add_return");

  const [search, setSearch] = useState("");
  const [conditionFilter, setConditionFilter] = useState<ReturnCondition | "All">("All");
  const [page, setPage] = useState(1);
  const [viewId, setViewId] = useState<number | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [pendingReturn, setPendingReturn] = useState<PendingReturn | null>(null);

  const activeAssignments = useMemo(() => assignments.filter((a) => a.status === "Assigned"), [assignments]);

  const [assignmentId, setAssignmentId] = useState<number | null>(null);
  const [returnDate, setReturnDate] = useState(dateInputValue(TODAY));
  const [condition, setCondition] = useState<ReturnCondition | "">("");
  const [reason, setReason] = useState("");

  const sortedReturns = useMemo(
    () => [...returns].sort((a, b) => b.returnDate.getTime() - a.returnDate.getTime()),
    [returns]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return sortedReturns.filter((r) => {
      const matchesCondition = conditionFilter === "All" || r.condition === conditionFilter;
      const matchesQuery =
        !q ||
        r.assetTag.toLowerCase().includes(q) ||
        r.assetName.toLowerCase().includes(q) ||
        r.employeeName.toLowerCase().includes(q) ||
        r.department.toLowerCase().includes(q) ||
        (r.reason?.toLowerCase().includes(q) ?? false);
      return matchesCondition && matchesQuery;
    });
  }, [sortedReturns, search, conditionFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageItems = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const thisMonthCount = sortedReturns.filter(
    (r) => r.returnDate.getFullYear() === TODAY.getFullYear() && r.returnDate.getMonth() === TODAY.getMonth()
  ).length;
  const needsAttention = sortedReturns.filter((r) => r.condition === "Fair" || r.condition === "Poor").length;
  const avgDaysHeld =
    sortedReturns.length > 0
      ? Math.round(sortedReturns.reduce((sum, r) => sum + returnDurationDays(r), 0) / sortedReturns.length)
      : 0;

  const viewReturn = sortedReturns.find((r) => r.id === viewId) ?? null;

  function updateFilter(next: ReturnCondition | "All") {
    setConditionFilter(next);
    setPage(1);
  }

  function updateSearch(value: string) {
    setSearch(value);
    setPage(1);
  }

  function openAddModal() {
    setAssignmentId(null);
    setReturnDate(dateInputValue(TODAY));
    setCondition("");
    setReason("");
    setFormError(null);
    setFormOpen(true);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const assignment = activeAssignments.find((a) => a.id === assignmentId);
    if (!assignment) {
      setFormError("Select an assignment to return.");
      return;
    }
    if (!returnDate) {
      setFormError("Choose a return date.");
      return;
    }
    if (!condition) {
      setFormError("Select the returned condition.");
      return;
    }
    if (!reason) {
      setFormError("Select a reason for the return.");
      return;
    }

    setFormError(null);
    setPendingReturn({ assignment, returnDate, condition, reason });
  }

  async function finalizeReturn() {
    if (!pendingReturn) return;
    const { assignment, returnDate: dateValue, condition: cond, reason: reasonValue } = pendingReturn;

    setSubmitting(true);
    try {
      // createReturn also re-reads the closed assignment.
      await createReturn({ assignmentId: assignment.id, returnDate: dateValue, condition: cond, reason: reasonValue });
      // Re-read the asset whose status/condition the server just changed.
      await refreshAsset(assignment.assetId);
      showSuccess(`${assignment.assetTag} return processed.`);
      setPendingReturn(null);
      setFormOpen(false);
      setConditionFilter("All");
      setSearch("");
      setPage(1);
    } catch (error) {
      showErrorFromException(error, "Could not process this return.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center animate-swipe-in">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Returns</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{sortedReturns.length} assets returned</p>
        </div>
        {canAdd && (
          <button
            type="button"
            onClick={openAddModal}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
          >
            <Plus className="h-4 w-4" />
            Process Return
          </button>
        )}
      </div>

      <div
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 animate-swipe-in"
        style={{ animationDelay: "120ms" }}
      >
        <div className="cursor-pointer rounded-2xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-900/[0.02] transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md hover:shadow-slate-900/5 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400">
            <Undo2 className="h-5 w-5" />
          </span>
          <p className="mt-3 text-2xl font-bold text-slate-900 dark:text-white">{sortedReturns.length}</p>
          <p className="text-sm text-slate-500 dark:text-slate-400">Total Returns</p>
        </div>
        <div className="cursor-pointer rounded-2xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-900/[0.02] transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md hover:shadow-slate-900/5 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-400">
            <CalendarClock className="h-5 w-5" />
          </span>
          <p className="mt-3 text-2xl font-bold text-slate-900 dark:text-white">{thisMonthCount}</p>
          <p className="text-sm text-slate-500 dark:text-slate-400">Returned This Month</p>
        </div>
        <div className="cursor-pointer rounded-2xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-900/[0.02] transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md hover:shadow-slate-900/5 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400">
            <AlertOctagon className="h-5 w-5" />
          </span>
          <p className="mt-3 text-2xl font-bold text-slate-900 dark:text-white">{needsAttention}</p>
          <p className="text-sm text-slate-500 dark:text-slate-400">Fair / Poor Condition</p>
        </div>
        <div className="cursor-pointer rounded-2xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-900/[0.02] transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md hover:shadow-slate-900/5 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400">
            <CalendarClock className="h-5 w-5" />
          </span>
          <p className="mt-3 text-2xl font-bold text-slate-900 dark:text-white">{avgDaysHeld}d</p>
          <p className="text-sm text-slate-500 dark:text-slate-400">Avg. Days Held</p>
        </div>
      </div>

      <div
        className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-900/[0.02] dark:border-slate-800 dark:bg-slate-900 animate-swipe-in"
        style={{ animationDelay: "240ms" }}
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => updateSearch(e.target.value)}
              placeholder="Search asset, employee, department, reason..."
              className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-500/20 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-100"
            />
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => updateFilter("All")}
              className={cn(
                "rounded-full px-3 py-1.5 text-sm font-medium transition",
                conditionFilter === "All"
                  ? "bg-blue-600 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
              )}
            >
              All
            </button>
            {RETURN_CONDITIONS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => updateFilter(c)}
                className={cn(
                  "rounded-full px-3 py-1.5 text-sm font-medium transition",
                  conditionFilter === c
                    ? "bg-blue-600 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                )}
              >
                {c}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div
        className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm shadow-slate-900/[0.02] dark:border-slate-800 dark:bg-slate-900 animate-swipe-in"
        style={{ animationDelay: "360ms" }}
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/60 text-left text-xs uppercase tracking-wider text-slate-400 dark:border-slate-800 dark:bg-slate-800/30 dark:text-slate-500">
                <th className="px-5 py-3 font-semibold">Return ID</th>
                <th className="px-4 py-3 font-semibold">Asset</th>
                <th className="px-4 py-3 font-semibold">Employee</th>
                <th className="px-4 py-3 font-semibold">Department</th>
                <th className="px-4 py-3 font-semibold">Return Date</th>
                <th className="px-4 py-3 font-semibold">Condition</th>
                <th className="px-4 py-3 font-semibold">Reason</th>
                <th className="w-16 px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {pageItems.map((r) => (
                <tr
                  key={r.id}
                  onClick={() => setViewId(r.id)}
                  className="cursor-pointer border-b border-slate-50 transition last:border-0 hover:bg-slate-50 dark:border-slate-800/60 dark:hover:bg-slate-800/40"
                >
                  <td className="px-5 py-3.5 font-mono text-sm font-semibold text-blue-600 dark:text-blue-400">
                    {r.returnNumber}
                  </td>
                  <td className="px-4 py-3.5">
                    <p className="font-mono text-sm font-medium text-slate-800 dark:text-slate-100">{r.assetTag}</p>
                    <p className="text-xs text-slate-400 dark:text-slate-500">{r.assetName}</p>
                  </td>
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                          avatarTone(r.employeeName)
                        )}
                      >
                        {initials(r.employeeName)}
                      </span>
                      <span className="font-medium text-slate-800 dark:text-slate-100">{r.employeeName}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3.5 text-slate-600 dark:text-slate-300">{r.department}</td>
                  <td className="px-4 py-3.5 text-slate-500 dark:text-slate-400">{formatDate(r.returnDate)}</td>
                  <td className="px-4 py-3.5">
                    {r.condition && (
                      <span
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold",
                          RETURN_CONDITION_STYLES[r.condition]
                        )}
                      >
                        <span className="h-1.5 w-1.5 rounded-full bg-current" />
                        {r.condition}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3.5 text-slate-600 dark:text-slate-300">{r.reason ?? "—"}</td>
                  <td className="px-4 py-3.5 text-right">
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        setViewId(r.id);
                      }}
                      title="View details"
                      aria-label="View details"
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-blue-50 hover:text-blue-600 dark:hover:bg-blue-500/10 dark:hover:text-blue-400"
                    >
                      <Eye className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {pageItems.length === 0 && (
          <div className="py-12 text-center text-sm text-slate-400 dark:text-slate-500">
            No returns match your search or filters.
          </div>
        )}

        <div className="flex flex-col items-center justify-between gap-3 border-t border-slate-100 p-4 text-sm dark:border-slate-800 sm:flex-row">
          <p className="text-slate-500 dark:text-slate-400">
            Showing {pageItems.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1}–
            {Math.min(currentPage * PAGE_SIZE, filtered.length)} of {filtered.length} returns
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

      {formOpen && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-slate-900/40 p-4">
          <button aria-label="Close" className="absolute inset-0 cursor-default" onClick={() => setFormOpen(false)} />
          <div className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-xl dark:bg-slate-900">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Process Return</h2>
              <button
                type="button"
                onClick={() => setFormOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {activeAssignments.length === 0 ? (
              <p className="mt-5 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-600 dark:bg-amber-500/10 dark:text-amber-400">
                No active assignments to return right now — nothing is currently checked out to an employee.
              </p>
            ) : (
              <form onSubmit={handleSubmit} className="mt-5 space-y-4">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
                    Assignment
                  </label>
                  <select
                    value={assignmentId ?? ""}
                    onChange={(e) => setAssignmentId(e.target.value === "" ? null : Number(e.target.value))}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-100"
                  >
                    <option value="" disabled>
                      Select Assignment
                    </option>
                    {activeAssignments.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.assetTag} · {a.assetName} — {a.employeeName}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
                    Return Date
                  </label>
                  <input
                    type="date"
                    value={returnDate}
                    onChange={(e) => setReturnDate(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-100"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
                      Condition
                    </label>
                    <select
                      value={condition}
                      onChange={(e) => setCondition(e.target.value as ReturnCondition)}
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-100"
                    >
                      <option value="" disabled>
                        Select Condition
                      </option>
                      {RETURN_CONDITIONS.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
                      Reason
                    </label>
                    <select
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-100"
                    >
                      <option value="" disabled>
                        Select Reason
                      </option>
                      {RETURN_REASONS.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {formError && (
                  <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-500/10 dark:text-red-400">
                    {formError}
                  </p>
                )}

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setFormOpen(false)}
                    className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
                  >
                    Process Return
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {pendingReturn && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 p-4">
          <button aria-label="Close" className="absolute inset-0 cursor-default" onClick={() => setPendingReturn(null)} />
          <div className="relative w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl dark:bg-slate-900">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400">
                <ClipboardCheck className="h-5 w-5" />
              </span>
              <div>
                <h3 className="text-base font-semibold text-slate-900 dark:text-white">Confirm return</h3>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Review the details before processing.</p>
              </div>
            </div>

            <div className="mt-4 space-y-2 rounded-xl border border-slate-100 p-3 text-sm dark:border-slate-800">
              <div className="flex items-center justify-between gap-3">
                <span className="text-slate-400 dark:text-slate-500">Asset</span>
                <span className="text-right font-medium text-slate-800 dark:text-slate-100">
                  {pendingReturn.assignment.assetTag} · {pendingReturn.assignment.assetName}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-slate-400 dark:text-slate-500">Employee</span>
                <span className="font-medium text-slate-800 dark:text-slate-100">{pendingReturn.assignment.employeeName}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-slate-400 dark:text-slate-500">Return Date</span>
                <span className="font-medium text-slate-800 dark:text-slate-100">{formatDate(parseDateOnly(pendingReturn.returnDate))}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-slate-400 dark:text-slate-500">Condition</span>
                <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-semibold", RETURN_CONDITION_STYLES[pendingReturn.condition])}>
                  {pendingReturn.condition}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-slate-400 dark:text-slate-500">Reason</span>
                <span className="font-medium text-slate-800 dark:text-slate-100">{pendingReturn.reason}</span>
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPendingReturn(null)}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Edit Details
              </button>
              <button
                type="button"
                onClick={finalizeReturn}
                disabled={submitting}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {submitting ? "Processing…" : "Confirm Return"}
              </button>
            </div>
          </div>
        </div>
      )}

      {viewReturn && <ReturnDetailModal returnRecord={viewReturn} onClose={() => setViewId(null)} />}
    </div>
  );
}
