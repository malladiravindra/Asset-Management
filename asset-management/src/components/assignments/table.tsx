"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  ClipboardList,
  Eye,
  Plus,
  RotateCcw,
  Search,
  Users,
  X,
} from "lucide-react";
import { useCan } from "@/components/auth/context";
import { useAssignments } from "@/components/assignments/context";
import { useAuditLog } from "@/components/audit-logs/context";
import { useReturns } from "@/components/returns/context";
import {
  ASSIGNMENT_STATUSES,
  ASSIGNMENT_STATUS_META,
  durationDays,
  type AssignmentStatus,
} from "@/components/assignments/data";
import { AssignmentDetailModal } from "@/components/assignments/detail-modal";
import { useAssets } from "@/components/assets/context";
import { type Asset, TODAY, formatDate } from "@/components/assets/data";
import { useEmployees } from "@/components/employees/context";
import { type Employee } from "@/components/employees/data";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { parseDateOnly, toDateOnly } from "@/lib/dates";

const PAGE_SIZE = 10;

type FilterValue = AssignmentStatus | "All";

type PendingAssignment = { asset: Asset; employee: Employee; assignedDate: string };

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

export function AssignmentsTable() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { assignments, createAssignment } = useAssignments();
  const { createReturn } = useReturns({ load: false });
  const { assets, refreshAsset } = useAssets();
  // The backend now records ASSIGN/RETURN audit entries itself the moment
  // the underlying operation succeeds (see
  // asset_backend/operations/services.py) — this only refreshes the shared
  // audit log state afterward, so it shows up immediately elsewhere in the
  // app without creating a duplicate entry (see
  // components/audit-logs/context.tsx).
  // Only to refresh the log if it is already loaded — never loads it here.
  const { refresh: refreshAuditLog } = useAuditLog({ load: false });
  const { employees } = useEmployees();
  const { showSuccess, showErrorFromException } = useToast();
  const canAssign = useCan("operations.add_assignment");
  // Unassigning creates a Return record.
  const canReturn = useCan("operations.add_return");

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<FilterValue>("All");
  const [page, setPage] = useState(1);
  const [formOpen, setFormOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmUnassignId, setConfirmUnassignId] = useState<number | null>(null);
  const [confirmAssignment, setConfirmAssignment] = useState<PendingAssignment | null>(null);
  const [viewId, setViewId] = useState<number | null>(null);

  const availableAssets = useMemo(() => assets.filter((a) => a.status === "Available"), [assets]);

  const [assetId, setAssetId] = useState<number | null>(null);

  const formAssetOptions = useMemo(() => {
    if (assetId !== null && !availableAssets.some((a) => a.id === assetId)) {
      const preset = assets.find((a) => a.id === assetId);
      if (preset) return [preset, ...availableAssets];
    }
    return availableAssets;
  }, [assets, availableAssets, assetId]);

  const [employeeName, setEmployeeName] = useState("");
  const [assignedDate, setAssignedDate] = useState(dateInputValue(TODAY));

  // An employee already holding an asset shouldn't show up as an assignment
  // target until that asset is returned — same idea as availableAssets above.
  const assignedEmployeeNames = useMemo(
    () => new Set(assignments.filter((a) => a.status === "Assigned").map((a) => a.employeeName)),
    [assignments]
  );
  const availableEmployees = useMemo(
    () => employees.filter((e) => !assignedEmployeeNames.has(e.name)),
    [employees, assignedEmployeeNames]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return assignments.filter((a) => {
      const matchesStatus = statusFilter === "All" || a.status === statusFilter;
      const matchesQuery =
        !q ||
        a.assetTag.toLowerCase().includes(q) ||
        a.assetName.toLowerCase().includes(q) ||
        a.employeeName.toLowerCase().includes(q) ||
        a.department.toLowerCase().includes(q);
      return matchesStatus && matchesQuery;
    });
  }, [assignments, search, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageItems = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const activeAssignments = assignments.filter((a) => a.status === "Assigned");
  const unassignedAssignments = assignments.filter((a) => a.status === "Unassigned");
  const uniqueEmployees = new Set(activeAssignments.map((a) => a.employeeName)).size;
  const avgDuration =
    unassignedAssignments.length > 0
      ? Math.round(unassignedAssignments.reduce((sum, a) => sum + durationDays(a), 0) / unassignedAssignments.length)
      : 0;

  const confirmUnassign = assignments.find((a) => a.id === confirmUnassignId) ?? null;
  const viewAssignment = assignments.find((a) => a.id === viewId) ?? null;

  function updateFilter(next: FilterValue) {
    setStatusFilter(next);
    setPage(1);
  }

  function updateSearch(value: string) {
    setSearch(value);
    setPage(1);
  }

  function openAddModal(presetAssetId?: number) {
    setAssetId(presetAssetId ?? null);
    setEmployeeName("");
    setAssignedDate(dateInputValue(TODAY));
    setFormError(null);
    setFormOpen(true);
  }

  // Entry point for the Asset Detail modal's "Assign" button
  // (src/components/assets/detail-modal.tsx) — it navigates here with
  // ?assetId=<id> instead of duplicating the create-assignment API call.
  // Reuses the exact same openAddModal() flow the "Click to assign" status
  // chip below already uses; only opens when the asset is still Available
  // (an already-assigned asset just lands on this page's list instead,
  // where its current assignment is visible/manageable).
  useEffect(() => {
    const requested = searchParams.get("assetId");
    if (!requested) return;
    const requestedId = Number(requested);
    // Deferred a tick so the modal-opening setState calls don't run
    // synchronously inside the effect body (react-hooks/set-state-in-effect).
    queueMicrotask(() => {
      if (canAssign && Number.isFinite(requestedId) && availableAssets.some((a) => a.id === requestedId)) {
        openAddModal(requestedId);
      }
    });
    router.replace("/dashboard/assignments", { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, availableAssets]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const asset = assets.find((a) => a.id === assetId);
    const employee = employees.find((e) => e.name === employeeName);

    if (!asset) {
      setFormError("Select an asset to assign.");
      return;
    }
    if (!employee) {
      setFormError("Select an employee.");
      return;
    }
    if (!assignedDate) {
      setFormError("Choose an assignment date.");
      return;
    }

    setFormError(null);
    setConfirmAssignment({ asset, employee, assignedDate });
  }

  async function finalizeAssignment() {
    if (!confirmAssignment) return;
    const { asset, employee, assignedDate: dateValue } = confirmAssignment;

    try {
      await createAssignment({ assetId: asset.id, personId: employee.id, assignedDate: dateValue });
      // Re-read the asset from the backend rather than hand-patching it so
      // its status/assignedTo reflect what the server actually persisted
      // (see asset_backend/operations/services.py).
      await refreshAsset(asset.id);
      showSuccess(`${asset.tag} assigned to ${employee.name}.`);
      void refreshAuditLog();
      setConfirmAssignment(null);
      setFormOpen(false);
      setStatusFilter("All");
      setSearch("");
      setPage(1);
    } catch (error) {
      showErrorFromException(error, "Could not create this assignment.");
    }
  }

  async function handleUnassign(id: number) {
    const assignment = assignments.find((a) => a.id === id);
    if (!assignment) return;
    try {
      // Same endpoint as the Returns page (POST /operations/returns/).
      await createReturn({ assignmentId: id });
      // Re-read the asset the server just freed.
      await refreshAsset(assignment.assetId);
      showSuccess(`${assignment.assetTag} unassigned.`);
      void refreshAuditLog();
    } catch (error) {
      showErrorFromException(error, "Could not unassign this asset.");
    } finally {
      setConfirmUnassignId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center animate-slide-in-right">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Assignments</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {activeAssignments.length} active assignment{activeAssignments.length === 1 ? "" : "s"}
          </p>
        </div>
        {canAssign && (
          <button
            type="button"
            onClick={() => openAddModal()}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
          >
            <Plus className="h-4 w-4" />
            New Assignment
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 animate-slide-in-right" style={{ animationDelay: "120ms" }}>
        <div className="cursor-pointer rounded-2xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-900/[0.02] transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md hover:shadow-slate-900/5 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400">
            <ClipboardList className="h-5 w-5" />
          </span>
          <p className="mt-3 text-2xl font-bold text-slate-900 dark:text-white">{activeAssignments.length}</p>
          <p className="text-sm text-slate-500 dark:text-slate-400">Active Assignments</p>
        </div>
        <div className="cursor-pointer rounded-2xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-900/[0.02] transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md hover:shadow-slate-900/5 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
            <RotateCcw className="h-5 w-5" />
          </span>
          <p className="mt-3 text-2xl font-bold text-slate-900 dark:text-white">{unassignedAssignments.length}</p>
          <p className="text-sm text-slate-500 dark:text-slate-400">Unassigned</p>
        </div>
        <div className="cursor-pointer rounded-2xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-900/[0.02] transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md hover:shadow-slate-900/5 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-400">
            <Users className="h-5 w-5" />
          </span>
          <p className="mt-3 text-2xl font-bold text-slate-900 dark:text-white">{uniqueEmployees}</p>
          <p className="text-sm text-slate-500 dark:text-slate-400">Employees Holding Assets</p>
        </div>
        <div className="cursor-pointer rounded-2xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-900/[0.02] transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md hover:shadow-slate-900/5 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400">
            <CalendarClock className="h-5 w-5" />
          </span>
          <p className="mt-3 text-2xl font-bold text-slate-900 dark:text-white">{avgDuration}d</p>
          <p className="text-sm text-slate-500 dark:text-slate-400">Avg. Assignment Length</p>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-900/[0.02] dark:border-slate-800 dark:bg-slate-900 animate-slide-in-right" style={{ animationDelay: "240ms" }}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => updateSearch(e.target.value)}
              placeholder="Search asset tag, employee, department..."
              className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-500/20 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-100"
            />
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => updateFilter("All")}
              className={cn(
                "rounded-full px-3 py-1.5 text-sm font-medium transition",
                statusFilter === "All"
                  ? "bg-blue-600 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
              )}
            >
              All
            </button>
            {ASSIGNMENT_STATUSES.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => updateFilter(s)}
                className={cn(
                  "rounded-full px-3 py-1.5 text-sm font-medium transition",
                  statusFilter === s
                    ? "bg-blue-600 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                )}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm shadow-slate-900/[0.02] dark:border-slate-800 dark:bg-slate-900 animate-slide-in-right" style={{ animationDelay: "360ms" }}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/60 text-left text-xs uppercase tracking-wider text-slate-400 dark:border-slate-800 dark:bg-slate-800/30 dark:text-slate-500">
                <th className="px-5 py-3 font-semibold">Asset</th>
                <th className="px-4 py-3 font-semibold">Employee</th>
                <th className="px-4 py-3 font-semibold">Department</th>
                <th className="px-4 py-3 font-semibold">Location</th>
                <th className="px-4 py-3 font-semibold">Since</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="w-16 px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {pageItems.map((a) => {
                const meta = ASSIGNMENT_STATUS_META[a.status];
                const StatusIcon = meta.icon;
                const isAssigned = a.status === "Assigned";
                return (
                  <tr
                    key={a.id}
                    onClick={() => setViewId(a.id)}
                    className="cursor-pointer border-b border-slate-50 transition last:border-0 hover:bg-slate-50 dark:border-slate-800/60 dark:hover:bg-slate-800/40"
                  >
                    <td className="px-5 py-3.5">
                      <p className="font-mono text-sm font-semibold text-blue-600 dark:text-blue-400">{a.assetTag}</p>
                      <p className="text-xs text-slate-400 dark:text-slate-500">{a.assetName}</p>
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-2">
                        <span
                          className={cn(
                            "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                            avatarTone(a.employeeName)
                          )}
                        >
                          {initials(a.employeeName)}
                        </span>
                        <span className="font-medium text-slate-800 dark:text-slate-100">{a.employeeName}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-slate-600 dark:text-slate-300">{a.department}</td>
                    <td className="px-4 py-3.5 text-slate-600 dark:text-slate-300">{a.location}</td>
                    <td className="px-4 py-3.5">
                      <p className="text-slate-600 dark:text-slate-300">{formatDate(a.assignedDate)}</p>
                      <p className="text-xs text-slate-400 dark:text-slate-500">
                        {durationDays(a)} day{durationDays(a) === 1 ? "" : "s"}
                        {isAssigned ? " and counting" : " total"}
                      </p>
                    </td>
                    <td className="px-4 py-3.5">
                      {isAssigned && canReturn ? (
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            setConfirmUnassignId(a.id);
                          }}
                          title="Click to unassign"
                          className={cn(
                            "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold transition hover:opacity-80",
                            meta.chip
                          )}
                        >
                          <StatusIcon className="h-3.5 w-3.5" />
                          {a.status}
                        </button>
                      ) : !isAssigned && canAssign && assets.find((x) => x.id === a.assetId)?.status === "Available" ? (
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            openAddModal(a.assetId);
                          }}
                          title="Click to assign"
                          className={cn(
                            "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold transition hover:opacity-80",
                            meta.chip
                          )}
                        >
                          <StatusIcon className="h-3.5 w-3.5" />
                          {a.status}
                        </button>
                      ) : (
                        <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold", meta.chip)}>
                          <StatusIcon className="h-3.5 w-3.5" />
                          {a.status}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          setViewId(a.id);
                        }}
                        title="View details"
                        aria-label="View details"
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-blue-50 hover:text-blue-600 dark:hover:bg-blue-500/10 dark:hover:text-blue-400"
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {pageItems.length === 0 && (
          <div className="py-12 text-center text-sm text-slate-400 dark:text-slate-500">
            No assignments match your search or filters.
          </div>
        )}

        <div className="flex flex-col items-center justify-between gap-3 border-t border-slate-100 p-4 text-sm dark:border-slate-800 sm:flex-row">
          <p className="text-slate-500 dark:text-slate-400">
            Showing {pageItems.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1}–
            {Math.min(currentPage * PAGE_SIZE, filtered.length)} of {filtered.length} assignments
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
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">New Assignment</h2>
              <button
                type="button"
                onClick={() => setFormOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {formAssetOptions.length === 0 ? (
              <p className="mt-5 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-600 dark:bg-amber-500/10 dark:text-amber-400">
                No available assets to assign right now — every asset is already assigned, in repair, or reserved.
              </p>
            ) : (
              <form onSubmit={handleSubmit} className="mt-5 space-y-4">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">Asset</label>
                  <select
                    value={assetId ?? ""}
                    onChange={(e) => setAssetId(e.target.value === "" ? null : Number(e.target.value))}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-100"
                  >
                    <option value="" disabled>
                      Select Asset
                    </option>
                    {formAssetOptions.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.tag} · {a.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">Employee</label>
                  <select
                    value={employeeName}
                    onChange={(e) => setEmployeeName(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-100"
                  >
                    <option value="" disabled>
                      Select Employee
                    </option>
                    {availableEmployees.map((e) => (
                      <option key={e.id} value={e.name}>
                        {e.name} · {e.department}
                      </option>
                    ))}
                  </select>
                  {availableEmployees.length === 0 && (
                    <p className="mt-1.5 text-xs text-slate-400 dark:text-slate-500">
                      Every employee already holds an asset — return one before assigning a new one.
                    </p>
                  )}
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
                    Assigned Date
                  </label>
                  <input
                    type="date"
                    value={assignedDate}
                    onChange={(e) => setAssignedDate(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-100"
                  />
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
                    Assign Asset
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {confirmAssignment && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 p-4">
          <button aria-label="Close" className="absolute inset-0 cursor-default" onClick={() => setConfirmAssignment(null)} />
          <div className="relative w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl dark:bg-slate-900">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400">
                <ClipboardCheck className="h-5 w-5" />
              </span>
              <div>
                <h3 className="text-base font-semibold text-slate-900 dark:text-white">Confirm assignment</h3>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Review the details before assigning.</p>
              </div>
            </div>

            <div className="mt-4 space-y-2 rounded-xl border border-slate-100 p-3 text-sm dark:border-slate-800">
              <div className="flex items-center justify-between gap-3">
                <span className="text-slate-400 dark:text-slate-500">Asset</span>
                <span className="text-right font-medium text-slate-800 dark:text-slate-100">
                  {confirmAssignment.asset.tag} · {confirmAssignment.asset.name}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-slate-400 dark:text-slate-500">Employee</span>
                <span className="font-medium text-slate-800 dark:text-slate-100">{confirmAssignment.employee.name}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-slate-400 dark:text-slate-500">Department</span>
                <span className="font-medium text-slate-800 dark:text-slate-100">{confirmAssignment.employee.department}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-slate-400 dark:text-slate-500">Location</span>
                <span className="font-medium text-slate-800 dark:text-slate-100">{confirmAssignment.employee.location}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-slate-400 dark:text-slate-500">Assigned Date</span>
                <span className="font-medium text-slate-800 dark:text-slate-100">
                  {formatDate(parseDateOnly(confirmAssignment.assignedDate))}
                </span>
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmAssignment(null)}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Edit Details
              </button>
              <button
                type="button"
                onClick={finalizeAssignment}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
              >
                Confirm Assignment
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmUnassign && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-slate-900/40 p-4">
          <button aria-label="Close" className="absolute inset-0 cursor-default" onClick={() => setConfirmUnassignId(null)} />
          <div className="relative w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl dark:bg-slate-900">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                <AlertTriangle className="h-5 w-5" />
              </span>
              <div>
                <h3 className="text-base font-semibold text-slate-900 dark:text-white">Unassign this asset?</h3>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  {confirmUnassign.assetTag} will be unassigned from {confirmUnassign.employeeName} and become
                  available again.
                </p>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmUnassignId(null)}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Keep Assigned
              </button>
              <button
                type="button"
                onClick={() => handleUnassign(confirmUnassign.id)}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
              >
                Confirm Unassign
              </button>
            </div>
          </div>
        </div>
      )}

      {viewAssignment && (
        <AssignmentDetailModal
          assignment={viewAssignment}
          onClose={() => setViewId(null)}
          onUnassign={(id) => {
            setViewId(null);
            setConfirmUnassignId(id);
          }}
          onReassign={(assetId) => {
            setViewId(null);
            openAddModal(assetId);
          }}
        />
      )}
    </div>
  );
}
