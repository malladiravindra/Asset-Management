"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Eye,
  LayoutList,
  Plus,
  Search,
  Wrench,
  X,
} from "lucide-react";
import { useCan } from "@/components/auth/context";
import { useMaintenance } from "@/components/maintenance/context";
import {
  MAINTENANCE_DISPLAY_STATUSES,
  MAINTENANCE_PRIORITIES,
  MAINTENANCE_STATUS_META,
  MAINTENANCE_TYPES,
  MAINTENANCE_TYPE_META,
  PRIORITY_STYLES,
  compareMaintenanceRecords,
  daysFromToday,
  displayStatus,
  type MaintenanceDisplayStatus,
  type MaintenancePriority,
  type MaintenanceStatus,
  type MaintenanceType,
} from "@/components/maintenance/data";
import { MaintenanceDetailModal } from "@/components/maintenance/detail-modal";
import { MaintenanceCalendar } from "@/components/maintenance/calendar";
import { useAssets } from "@/components/assets/context";
import { TODAY, addDays, formatDate } from "@/components/assets/data";
import { useToast } from "@/components/ui/toast";
import { useRuntimeSettings } from "@/components/settings/runtime";
import { cn } from "@/lib/utils";
import { parseDateOnly, toDateOnly } from "@/lib/dates";

const PAGE_SIZE = 10;

function dateInputValue(d: Date) {
  return toDateOnly(d);
}

export function MaintenanceTable() {
  const { records, setRecords, createMaintenanceRecord, updateMaintenanceRecord, deleteMaintenanceRecord } =
    useMaintenance();
  const { assets, refreshAsset } = useAssets();
  const assetIdOf = (recordId: number) => records.find((r) => r.id === recordId)?.assetId;
  const { values: settings } = useRuntimeSettings();
  // Settings > Maintenance > Allow Preventive Maintenance (the backend
  // still rejects it if the setting is off — this just stops offering it).
  const typeOptions = settings?.allow_preventive_maintenance === false
    ? MAINTENANCE_TYPES.filter((t) => t !== "Preventive")
    : MAINTENANCE_TYPES;
  const { showSuccess, showErrorFromException } = useToast();
  const canAdd = useCan("operation.add_maintenancerecord");

  const [view, setView] = useState<"list" | "calendar">("list");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<MaintenanceDisplayStatus | "All">("All");
  const [page, setPage] = useState(1);
  const [viewId, setViewId] = useState<number | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [assetId, setAssetId] = useState<number | null>(null);
  const [type, setType] = useState<MaintenanceType | "">("");
  const [technician, setTechnician] = useState("");
  const [priority, setPriority] = useState<MaintenancePriority>("Medium");
  const [scheduledDate, setScheduledDate] = useState(dateInputValue(addDays(TODAY, 7)));
  const [notes, setNotes] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return records.filter((r) => {
      const matchesStatus = statusFilter === "All" || displayStatus(r) === statusFilter;
      const matchesQuery =
        !q ||
        r.assetTag.toLowerCase().includes(q) ||
        r.assetName.toLowerCase().includes(q) ||
        r.technician.toLowerCase().includes(q) ||
        r.type.toLowerCase().includes(q);
      return matchesStatus && matchesQuery;
    });
  }, [records, search, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageItems = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const scheduledCount = records.filter((r) => displayStatus(r) === "Scheduled").length;
  const inProgressCount = records.filter((r) => displayStatus(r) === "In Progress").length;
  const overdueCount = records.filter((r) => displayStatus(r) === "Overdue").length;
  const completedThisMonth = records.filter(
    (r) =>
      r.status === "Completed" &&
      r.completedDate &&
      r.completedDate.getFullYear() === TODAY.getFullYear() &&
      r.completedDate.getMonth() === TODAY.getMonth()
  ).length;

  const viewRecord = records.find((r) => r.id === viewId) ?? null;

  function updateFilter(next: MaintenanceDisplayStatus | "All") {
    setStatusFilter(next);
    setPage(1);
  }

  function updateSearch(value: string) {
    setSearch(value);
    setPage(1);
  }

  function openAddModal() {
    setAssetId(null);
    setType("");
    setTechnician("");
    setPriority("Medium");
    setScheduledDate(dateInputValue(addDays(TODAY, 7)));
    setNotes("");
    setFormError(null);
    setFormOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const asset = assets.find((a) => a.id === assetId);
    if (!asset) {
      setFormError("Select an asset.");
      return;
    }
    if (!type) {
      setFormError("Select a maintenance type.");
      return;
    }
    if (!technician.trim()) {
      setFormError("Enter a technician name.");
      return;
    }
    if (!scheduledDate) {
      setFormError("Choose a scheduled date.");
      return;
    }

    setSubmitting(true);
    setFormError(null);
    try {
      await createMaintenanceRecord({
        assetId: asset.id,
        type,
        technician: technician.trim(),
        priority,
        scheduledDate: parseDateOnly(scheduledDate),
        notes: notes.trim(),
      });
      // The backend moves the asset to Maintenance in the same transaction.
      await refreshAsset(asset.id);
      showSuccess("Maintenance job scheduled.");
      setFormOpen(false);
      setStatusFilter("All");
      setSearch("");
      setPage(1);
    } catch (error) {
      showErrorFromException(error);
      setFormError(error instanceof Error ? error.message : "Could not schedule this maintenance job.");
    } finally {
      setSubmitting(false);
    }
  }


  async function handleAdvance(id: number, status: MaintenanceStatus) {
    const assetId = assetIdOf(id);
    try {
      await updateMaintenanceRecord(id, {
        status,
        ...(status === "Completed" ? { completedDate: TODAY } : {}),
      });
      setRecords((prev) => [...prev].sort(compareMaintenanceRecords));
      showSuccess(`Marked as ${status}.`);
      // Asset status is released by the backend; re-read it.
      if (assetId) await refreshAsset(assetId);
    } catch (error) {
      showErrorFromException(error);
    }
  }

  async function handleCancel(id: number) {
    const assetId = assetIdOf(id);
    try {
      await updateMaintenanceRecord(id, { status: "Cancelled" });
      setRecords((prev) => [...prev].sort(compareMaintenanceRecords));
      showSuccess("Maintenance job cancelled.");
      if (assetId) await refreshAsset(assetId);
    } catch (error) {
      showErrorFromException(error);
    }
  }

  async function handleEdit(
    id: number,
    payload: {
      type: MaintenanceType;
      technician: string;
      priority: MaintenancePriority;
      scheduled_date: string;
      cost: number | null;
      notes: string;
    }
  ) {
    const [y, m, d] = payload.scheduled_date.split("-").map(Number);
    const updated = await updateMaintenanceRecord(id, {
      type: payload.type,
      technician: payload.technician,
      priority: payload.priority,
      scheduledDate: new Date(y, (m || 1) - 1, d || 1),
      cost: payload.cost,
      notes: payload.notes,
    });
    setRecords((prev) => [...prev].sort(compareMaintenanceRecords));
    showSuccess("Maintenance record updated.");
    return updated;
  }

  async function handleDelete(id: number) {
    const assetId = assetIdOf(id);
    try {
      await deleteMaintenanceRecord(id);
      if (assetId) await refreshAsset(assetId);
      showSuccess("Maintenance record deleted.");
    } catch (error) {
      showErrorFromException(error);
    } finally {
      setViewId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center animate-fade-in-up">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Maintenance</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {records.length} jobs · {overdueCount} overdue
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex w-64 divide-x divide-slate-200 overflow-hidden rounded-xl border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setView("list")}
              className={cn(
                "flex flex-1 items-center justify-center gap-2 py-2.5 text-sm font-medium transition",
                view === "list"
                  ? "bg-slate-900 text-white dark:bg-slate-700"
                  : "bg-white text-slate-500 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-400 dark:hover:bg-slate-800"
              )}
            >
              <LayoutList className="h-4 w-4" />
              List
            </button>
            <button
              type="button"
              onClick={() => setView("calendar")}
              className={cn(
                "flex flex-1 items-center justify-center gap-2 py-2.5 text-sm font-medium transition",
                view === "calendar"
                  ? "bg-slate-900 text-white dark:bg-slate-700"
                  : "bg-white text-slate-500 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-400 dark:hover:bg-slate-800"
              )}
            >
              <CalendarDays className="h-4 w-4" />
              Calendar
            </button>
          </div>
          {canAdd && (
            <button
              type="button"
              onClick={openAddModal}
              className="flex items-center gap-2 rounded-lg bg-blue-600 px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
            >
              <Plus className="h-4 w-4" />
              Schedule
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 animate-fade-in-up" style={{ animationDelay: "120ms" }}>
        <div className="cursor-pointer rounded-2xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-900/[0.02] transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md hover:shadow-slate-900/5 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400">
            <Clock3 className="h-5 w-5" />
          </span>
          <p className="mt-3 text-2xl font-bold text-slate-900 dark:text-white">{scheduledCount}</p>
          <p className="text-sm text-slate-500 dark:text-slate-400">Scheduled</p>
        </div>
        <div className="cursor-pointer rounded-2xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-900/[0.02] transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md hover:shadow-slate-900/5 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400">
            <Wrench className="h-5 w-5" />
          </span>
          <p className="mt-3 text-2xl font-bold text-slate-900 dark:text-white">{inProgressCount}</p>
          <p className="text-sm text-slate-500 dark:text-slate-400">In Progress</p>
        </div>
        <div className="cursor-pointer rounded-2xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-900/[0.02] transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md hover:shadow-slate-900/5 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400">
            <AlertTriangle className="h-5 w-5" />
          </span>
          <p className="mt-3 text-2xl font-bold text-slate-900 dark:text-white">{overdueCount}</p>
          <p className="text-sm text-slate-500 dark:text-slate-400">Overdue</p>
        </div>
        <div className="cursor-pointer rounded-2xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-900/[0.02] transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md hover:shadow-slate-900/5 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400">
            <CheckCircle2 className="h-5 w-5" />
          </span>
          <p className="mt-3 text-2xl font-bold text-slate-900 dark:text-white">{completedThisMonth}</p>
          <p className="text-sm text-slate-500 dark:text-slate-400">Completed This Month</p>
        </div>
      </div>

      {view === "calendar" ? (
        <MaintenanceCalendar records={records} onSelectRecord={setViewId} />
      ) : (
        <>
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-900/[0.02] dark:border-slate-800 dark:bg-slate-900 animate-fade-in-up" style={{ animationDelay: "240ms" }}>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => updateSearch(e.target.value)}
                  placeholder="Search asset, technician, type..."
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
                {MAINTENANCE_DISPLAY_STATUSES.map((s) => (
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

          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm shadow-slate-900/[0.02] dark:border-slate-800 dark:bg-slate-900 animate-fade-in-up" style={{ animationDelay: "360ms" }}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/60 text-left text-xs uppercase tracking-wider text-slate-400 dark:border-slate-800 dark:bg-slate-800/30 dark:text-slate-500">
                    <th className="px-5 py-3 font-semibold">Asset</th>
                    <th className="px-4 py-3 font-semibold">Type</th>
                    <th className="px-4 py-3 font-semibold">Technician</th>
                    <th className="px-4 py-3 font-semibold">Scheduled</th>
                    <th className="px-4 py-3 font-semibold">Priority</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="w-16 px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {pageItems.map((r) => {
                    const shown = displayStatus(r);
                    const meta = MAINTENANCE_STATUS_META[shown];
                    const StatusIcon = meta.icon;
                    const typeMeta = MAINTENANCE_TYPE_META[r.type];
                    const TypeIcon = typeMeta.icon;
                    const delta = daysFromToday(r.scheduledDate);
                    return (
                      <tr
                        key={r.id}
                        onClick={() => setViewId(r.id)}
                        className="cursor-pointer border-b border-slate-50 transition last:border-0 hover:bg-slate-50 dark:border-slate-800/60 dark:hover:bg-slate-800/40"
                      >
                        <td className="px-5 py-3.5">
                          <p className="font-mono text-sm font-semibold text-blue-600 dark:text-blue-400">{r.assetTag}</p>
                          <p className="text-xs text-slate-400 dark:text-slate-500">{r.assetName}</p>
                        </td>
                        <td className="px-4 py-3.5">
                          <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold", typeMeta.chip)}>
                            <TypeIcon className="h-3.5 w-3.5" />
                            {r.type}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 font-medium text-slate-800 dark:text-slate-100">{r.technician}</td>
                        <td className="px-4 py-3.5">
                          <p className="text-slate-600 dark:text-slate-300">{formatDate(r.scheduledDate)}</p>
                          {shown === "Overdue" && (
                            <p className="text-xs font-medium text-red-500 dark:text-red-400">
                              {Math.abs(delta)}d overdue
                            </p>
                          )}
                          {shown === "Scheduled" && delta >= 0 && delta <= 3 && (
                            <p className="text-xs font-medium text-blue-500 dark:text-blue-400">
                              {delta === 0 ? "Due today" : `Due in ${delta}d`}
                            </p>
                          )}
                        </td>
                        <td className="px-4 py-3.5">
                          <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold", PRIORITY_STYLES[r.priority])}>
                            {r.priority}
                          </span>
                        </td>
                        <td className="px-4 py-3.5">
                          <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold", meta.chip)}>
                            <StatusIcon className="h-3.5 w-3.5" />
                            {shown}
                          </span>
                        </td>
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
                    );
                  })}
                </tbody>
              </table>
            </div>

            {pageItems.length === 0 && (
              <div className="py-12 text-center text-sm text-slate-400 dark:text-slate-500">
                No maintenance jobs match your search or filters.
              </div>
            )}

            <div className="flex flex-col items-center justify-between gap-3 border-t border-slate-100 p-4 text-sm dark:border-slate-800 sm:flex-row">
              <p className="text-slate-500 dark:text-slate-400">
                Showing {pageItems.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1}–
                {Math.min(currentPage * PAGE_SIZE, filtered.length)} of {filtered.length} jobs
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
        </>
      )}

      {formOpen && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-slate-900/40 p-4">
          <button aria-label="Close" className="absolute inset-0 cursor-default" onClick={() => setFormOpen(false)} />
          <div className="relative flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-xl dark:bg-slate-900">
            <div className="flex shrink-0 items-center justify-between border-b border-slate-100 p-6 dark:border-slate-800">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Schedule Maintenance</h2>
              <button
                type="button"
                onClick={() => setFormOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6">
              <div className="space-y-4">
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
                    {assets.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.tag} · {a.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">Type</label>
                    <select
                      value={type}
                      onChange={(e) => setType(e.target.value as MaintenanceType)}
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-100"
                    >
                      <option value="" disabled>
                        Select Type
                      </option>
                      {typeOptions.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">Technician</label>
                    <input
                      type="text"
                      value={technician}
                      onChange={(e) => setTechnician(e.target.value)}
                      placeholder="e.g. Suresh Pillai"
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-100"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
                      Scheduled Date
                    </label>
                    <input
                      type="date"
                      value={scheduledDate}
                      onChange={(e) => setScheduledDate(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-100"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">Priority</label>
                    <select
                      value={priority}
                      onChange={(e) => setPriority(e.target.value as MaintenancePriority)}
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-100"
                    >
                      {MAINTENANCE_PRIORITIES.map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
                    Notes (optional)
                  </label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={2}
                    placeholder="Describe the issue or task..."
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-100"
                  />
                </div>

                {formError && (
                  <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-500/10 dark:text-red-400">
                    {formError}
                  </p>
                )}
              </div>

              <div className="mt-5 flex justify-end gap-2 border-t border-slate-100 pt-4 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setFormOpen(false)}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {submitting ? "Scheduling…" : "Schedule Job"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {viewRecord && (
        <MaintenanceDetailModal
          record={viewRecord}
          onClose={() => setViewId(null)}
          onAdvance={handleAdvance}
          onCancel={handleCancel}
          onDelete={handleDelete}
          onEdit={handleEdit}
        />
      )}
    </div>
  );
}
