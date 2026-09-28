"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Eye,
  IndianRupee,
  Plus,
  Search,
  Wrench,
  X,
} from "lucide-react";
import { useCan } from "@/components/auth/context";
import { useRepairs } from "@/components/repairs/context";
import {
  REPAIR_DISPLAY_STATUSES,
  REPAIR_ISSUE_META,
  REPAIR_ISSUE_TYPES,
  REPAIR_PRIORITIES,
  REPAIR_STATUS_META,
  compareRepairRecords,
  daysFromToday,
  displayStatus,
  type RepairDisplayStatus,
  type RepairIssueType,
  type RepairPriority,
  type RepairStatus,
} from "@/components/repairs/data";
import { RepairDetailModal } from "@/components/repairs/detail-modal";
import { useAssets } from "@/components/assets/context";
import { TODAY, addDays, formatDate } from "@/components/assets/data";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { parseDateOnly, toDateOnly } from "@/lib/dates";

const PAGE_SIZE = 10;

function dateInputValue(d: Date) {
  return toDateOnly(d);
}

export function RepairsTable() {
  const { records, setRecords, createRepairRecord, updateRepairRecord, deleteRepairRecord } = useRepairs();
  const { assets, refreshAsset } = useAssets();
  const assetIdOf = (recordId: number) => records.find((r) => r.id === recordId)?.assetId;
  const { showSuccess, showErrorFromException } = useToast();
  const canAdd = useCan("operation.add_repairrecord");

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<RepairDisplayStatus | "All">("All");
  const [page, setPage] = useState(1);
  const [viewId, setViewId] = useState<number | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [assetId, setAssetId] = useState<number | null>(null);
  const [issueType, setIssueType] = useState<RepairIssueType | "">("");
  const [issue, setIssue] = useState("");
  const [vendor, setVendor] = useState("");
  const [priority, setPriority] = useState<RepairPriority>("Medium");
  const [underWarranty, setUnderWarranty] = useState(false);
  const [cost, setCost] = useState("");
  const [reportedDate, setReportedDate] = useState(dateInputValue(TODAY));
  const [expectedReturnDate, setExpectedReturnDate] = useState(dateInputValue(addDays(TODAY, 5)));
  const [notes, setNotes] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return records.filter((r) => {
      const matchesStatus = statusFilter === "All" || displayStatus(r) === statusFilter;
      const matchesQuery =
        !q ||
        r.assetTag.toLowerCase().includes(q) ||
        r.assetName.toLowerCase().includes(q) ||
        r.issue.toLowerCase().includes(q) ||
        r.vendor.toLowerCase().includes(q);
      return matchesStatus && matchesQuery;
    });
  }, [records, search, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageItems = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const openCount = records.filter((r) => {
    const s = displayStatus(r);
    return s === "Reported" || s === "In Progress";
  }).length;
  const overdueCount = records.filter((r) => displayStatus(r) === "Overdue").length;
  const completedThisMonth = records.filter(
    (r) =>
      r.status === "Completed" &&
      r.completedDate &&
      r.completedDate.getFullYear() === TODAY.getFullYear() &&
      r.completedDate.getMonth() === TODAY.getMonth()
  ).length;
  const totalCost = records.reduce((sum, r) => sum + r.cost, 0);

  const viewRecord = records.find((r) => r.id === viewId) ?? null;

  function updateFilter(next: RepairDisplayStatus | "All") {
    setStatusFilter(next);
    setPage(1);
  }

  function updateSearch(value: string) {
    setSearch(value);
    setPage(1);
  }

  function openAddModal() {
    setAssetId(null);
    setIssueType("");
    setIssue("");
    setVendor("");
    setPriority("Medium");
    setUnderWarranty(false);
    setCost("");
    setReportedDate(dateInputValue(TODAY));
    setExpectedReturnDate(dateInputValue(addDays(TODAY, 5)));
    setNotes("");
    setFormError(null);
    setFormOpen(true);
  }

  function handleAssetChange(id: number | null) {
    setAssetId(id);
    const asset = assets.find((a) => a.id === id);
    if (asset) {
      // Real warranty status from the backend (derived from warranty_end_date).
      setUnderWarranty(asset.warranty === "Active" || asset.warranty === "Expiring");
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const asset = assets.find((a) => a.id === assetId);
    if (!asset) {
      setFormError("Select an asset.");
      return;
    }

    const openExisting = records.find((r) => {
      const s = displayStatus(r);
      return r.assetId === asset.id && (s === "Reported" || s === "In Progress" || s === "Overdue");
    });
    if (openExisting) {
      setFormError(`${asset.tag} already has an open repair (${openExisting.repairId}).`);
      return;
    }
    if (!issueType) {
      setFormError("Select an issue type.");
      return;
    }
    if (!issue.trim()) {
      setFormError("Describe the issue.");
      return;
    }
    if (!vendor.trim()) {
      setFormError("Enter a repair vendor.");
      return;
    }
    if (!reportedDate) {
      setFormError("Choose a reported date.");
      return;
    }
    if (!expectedReturnDate || parseDateOnly(expectedReturnDate) < parseDateOnly(reportedDate)) {
      setFormError("Expected return date must be on or after the reported date.");
      return;
    }
    const costValue = Number(cost);
    if (!underWarranty && (!cost.trim() || Number.isNaN(costValue) || costValue < 0)) {
      setFormError("Enter a valid repair cost, or mark it as under warranty.");
      return;
    }

    setSubmitting(true);
    setFormError(null);
    try {
      await createRepairRecord({
        assetId: asset.id,
        issueType,
        issue: issue.trim(),
        vendor: vendor.trim(),
        priority,
        underWarranty,
        // The cost field is hidden for warranty repairs (cost covered); the
        // backend exempts them from Settings > Require Repair Cost.
        cost: underWarranty ? 0 : costValue,
        reportedDate: parseDateOnly(reportedDate),
        expectedReturnDate: parseDateOnly(expectedReturnDate),
        notes: notes.trim(),
      });
      // The backend moves the asset to In Repair in the same transaction.
      await refreshAsset(asset.id);
      showSuccess("Repair logged.");
      setFormOpen(false);
      setStatusFilter("All");
      setSearch("");
      setPage(1);
    } catch (error) {
      showErrorFromException(error);
      setFormError(error instanceof Error ? error.message : "Could not log this repair.");
    } finally {
      setSubmitting(false);
    }
  }


  async function handleAdvance(id: number, status: RepairStatus) {
    const assetId = assetIdOf(id);
    try {
      await updateRepairRecord(id, {
        status,
        ...(status === "Completed" ? { completedDate: TODAY } : {}),
      });
      setRecords((prev) => [...prev].sort(compareRepairRecords));
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
      await updateRepairRecord(id, { status: "Cancelled" });
      setRecords((prev) => [...prev].sort(compareRepairRecords));
      showSuccess("Repair cancelled.");
      if (assetId) await refreshAsset(assetId);
    } catch (error) {
      showErrorFromException(error);
    }
  }

  async function handleEdit(
    id: number,
    payload: {
      issue_type: RepairIssueType;
      issue: string;
      vendor: string;
      priority: RepairPriority;
      under_warranty: boolean;
      cost: number;
      expected_return_date: string;
      notes: string;
    }
  ) {
    const [y, m, d] = payload.expected_return_date.split("-").map(Number);
    const updated = await updateRepairRecord(id, {
      issueType: payload.issue_type,
      issue: payload.issue,
      vendor: payload.vendor,
      priority: payload.priority,
      underWarranty: payload.under_warranty,
      cost: payload.cost,
      expectedReturnDate: new Date(y, (m || 1) - 1, d || 1),
      notes: payload.notes,
    });
    setRecords((prev) => [...prev].sort(compareRepairRecords));
    showSuccess("Repair record updated.");
    return updated;
  }

  async function handleDelete(id: number) {
    const assetId = assetIdOf(id);
    try {
      await deleteRepairRecord(id);
      if (assetId) await refreshAsset(assetId);
      showSuccess("Repair record deleted.");
    } catch (error) {
      showErrorFromException(error);
    } finally {
      setViewId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center animate-fade-in-down">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Repairs</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {records.length} repairs · {overdueCount} overdue
          </p>
        </div>
        {canAdd && (
          <button
            type="button"
            onClick={openAddModal}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
          >
            <Plus className="h-4 w-4" />
            Log Repair
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 animate-fade-in-down" style={{ animationDelay: "120ms" }}>
        <div className="cursor-pointer rounded-2xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-900/[0.02] transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md hover:shadow-slate-900/5 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400">
            <Wrench className="h-5 w-5" />
          </span>
          <p className="mt-3 text-2xl font-bold text-slate-900 dark:text-white">{openCount}</p>
          <p className="text-sm text-slate-500 dark:text-slate-400">Open Repairs</p>
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
        <div className="cursor-pointer rounded-2xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-900/[0.02] transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md hover:shadow-slate-900/5 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-400">
            <IndianRupee className="h-5 w-5" />
          </span>
          <p className="mt-3 text-2xl font-bold text-slate-900 dark:text-white">₹{totalCost.toLocaleString("en-IN")}</p>
          <p className="text-sm text-slate-500 dark:text-slate-400">Total Repair Cost</p>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-900/[0.02] dark:border-slate-800 dark:bg-slate-900 animate-fade-in-down" style={{ animationDelay: "240ms" }}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => updateSearch(e.target.value)}
              placeholder="Search asset, issue, vendor..."
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
            {REPAIR_DISPLAY_STATUSES.map((s) => (
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

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm shadow-slate-900/[0.02] dark:border-slate-800 dark:bg-slate-900 animate-fade-in-down" style={{ animationDelay: "360ms" }}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/60 text-left text-xs uppercase tracking-wider text-slate-400 dark:border-slate-800 dark:bg-slate-800/30 dark:text-slate-500">
                <th className="px-5 py-3 font-semibold">Repair ID</th>
                <th className="px-4 py-3 font-semibold">Asset</th>
                <th className="px-4 py-3 font-semibold">Issue</th>
                <th className="px-4 py-3 font-semibold">Vendor</th>
                <th className="px-4 py-3 font-semibold">Cost</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Reported</th>
                <th className="w-16 px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {pageItems.map((r) => {
                const shown = displayStatus(r);
                const meta = REPAIR_STATUS_META[shown];
                const StatusIcon = meta.icon;
                const issueMeta = REPAIR_ISSUE_META[r.issueType];
                const IssueIcon = issueMeta.icon;
                const delta = daysFromToday(r.expectedReturnDate);
                return (
                  <tr
                    key={r.id}
                    onClick={() => setViewId(r.id)}
                    className="cursor-pointer border-b border-slate-50 transition last:border-0 hover:bg-slate-50 dark:border-slate-800/60 dark:hover:bg-slate-800/40"
                  >
                    <td className="px-5 py-3.5 font-mono text-sm font-semibold text-blue-600 dark:text-blue-400">
                      {r.repairId}
                    </td>
                    <td className="px-4 py-3.5">
                      <p className="font-mono text-sm font-medium text-slate-800 dark:text-slate-100">{r.assetTag}</p>
                      <p className="text-xs text-slate-400 dark:text-slate-500">{r.assetName}</p>
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-2">
                        <span className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-lg", issueMeta.chip)}>
                          <IssueIcon className="h-3.5 w-3.5" />
                        </span>
                        <div>
                          <p className="text-slate-700 dark:text-slate-200">{r.issue}</p>
                          <p className="text-xs text-slate-400 dark:text-slate-500">{r.issueType}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-slate-600 dark:text-slate-300">{r.vendor}</td>
                    <td className="px-4 py-3.5">
                      {r.underWarranty ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400">
                          Under Warranty
                        </span>
                      ) : (
                        <span className="font-medium text-slate-800 dark:text-slate-100">
                          ₹{r.cost.toLocaleString("en-IN")}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3.5">
                      <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold", meta.chip)}>
                        <StatusIcon className="h-3.5 w-3.5" />
                        {shown}
                      </span>
                    </td>
                    <td className="px-4 py-3.5">
                      <p className="text-slate-600 dark:text-slate-300">{formatDate(r.reportedDate)}</p>
                      {shown === "Overdue" && (
                        <p className="text-xs font-medium text-red-500 dark:text-red-400">
                          {Math.abs(delta)}d overdue
                        </p>
                      )}
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
            No repairs match your search or filters.
          </div>
        )}

        <div className="flex flex-col items-center justify-between gap-3 border-t border-slate-100 p-4 text-sm dark:border-slate-800 sm:flex-row">
          <p className="text-slate-500 dark:text-slate-400">
            Showing {pageItems.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1}–
            {Math.min(currentPage * PAGE_SIZE, filtered.length)} of {filtered.length} repairs
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
          <div className="relative flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-xl dark:bg-slate-900">
            <div className="flex shrink-0 items-center justify-between border-b border-slate-100 p-6 dark:border-slate-800">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Log Repair</h2>
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
                    onChange={(e) => handleAssetChange(e.target.value === "" ? null : Number(e.target.value))}
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
                    <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">Issue Type</label>
                    <select
                      value={issueType}
                      onChange={(e) => setIssueType(e.target.value as RepairIssueType)}
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-100"
                    >
                      <option value="" disabled>
                        Select Type
                      </option>
                      {REPAIR_ISSUE_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">Priority</label>
                    <select
                      value={priority}
                      onChange={(e) => setPriority(e.target.value as RepairPriority)}
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-100"
                    >
                      {REPAIR_PRIORITIES.map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
                    Issue Description
                  </label>
                  <input
                    type="text"
                    value={issue}
                    onChange={(e) => setIssue(e.target.value)}
                    placeholder="e.g. Screen cracked after drop"
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-100"
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">Vendor</label>
                  <input
                    type="text"
                    value={vendor}
                    onChange={(e) => setVendor(e.target.value)}
                    placeholder="e.g. Dell Service Center"
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-100"
                  />
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
                      Reported Date
                    </label>
                    <input
                      type="date"
                      value={reportedDate}
                      onChange={(e) => setReportedDate(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-100"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
                      Expected Return
                    </label>
                    <input
                      type="date"
                      value={expectedReturnDate}
                      onChange={(e) => setExpectedReturnDate(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-100"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300">
                    <input
                      type="checkbox"
                      checked={underWarranty}
                      onChange={(e) => setUnderWarranty(e.target.checked)}
                      className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500/30 dark:border-slate-700"
                    />
                    Covered under warranty
                  </label>
                </div>

                {!underWarranty && (
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
                      Repair Cost (₹)
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={cost}
                      onChange={(e) => setCost(e.target.value)}
                      placeholder="e.g. 4500"
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-100 sm:w-56"
                    />
                  </div>
                )}

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
                    Notes (optional)
                  </label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={2}
                    placeholder="Additional context for the vendor..."
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
                  {submitting ? "Logging…" : "Log Repair"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {viewRecord && (
        <RepairDetailModal
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
