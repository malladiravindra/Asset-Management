"use client";

import { Fragment, useState } from "react";
import {
  AlertTriangle,
  Calendar,
  IndianRupee,
  MapPin,
  Pencil,
  ShieldCheck,
  Store,
  Trash2,
  Wrench,
  X,
  XCircle,
} from "lucide-react";
import { useCan } from "@/components/auth/context";
import {
  REPAIR_ISSUE_META,
  REPAIR_ISSUE_TYPES,
  REPAIR_PRIORITIES,
  REPAIR_PRIORITY_STYLES,
  REPAIR_STATUS_FLOW,
  REPAIR_STATUS_META,
  daysFromToday,
  displayStatus,
  nextRepairStatus,
  type RepairIssueType,
  type RepairPriority,
  type RepairRecord,
  type RepairStatus,
} from "@/components/repairs/data";
import { formatDate } from "@/components/assets/data";
import { cn } from "@/lib/utils";
import { toDateOnly } from "@/lib/dates";

function dateInputValue(d: Date) {
  return toDateOnly(d);
}

type EditPayload = {
  issue_type: RepairIssueType;
  issue: string;
  vendor: string;
  priority: RepairPriority;
  under_warranty: boolean;
  cost: number;
  expected_return_date: string;
  notes: string;
};

export function RepairDetailModal({
  record,
  onClose,
  onAdvance,
  onCancel,
  onDelete,
  onEdit,
}: {
  record: RepairRecord;
  onClose: () => void;
  onAdvance: (id: number, status: RepairStatus) => void;
  onCancel: (id: number) => void;
  onDelete: (id: number) => void;
  onEdit: (id: number, payload: EditPayload) => Promise<unknown>;
}) {
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [confirmingAdvance, setConfirmingAdvance] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [editing, setEditing] = useState(false);
  const canChange = useCan("operation.change_repairrecord");
  const canDelete = useCan("operation.delete_repairrecord");
  const [editForm, setEditForm] = useState({
    issueType: record.issueType,
    issue: record.issue,
    vendor: record.vendor,
    priority: record.priority,
    underWarranty: record.underWarranty,
    cost: String(record.cost),
    expectedReturnDate: dateInputValue(record.expectedReturnDate),
    notes: record.notes,
  });
  const [editError, setEditError] = useState<string | null>(null);
  const [editBusy, setEditBusy] = useState(false);

  function startEdit() {
    setEditForm({
      issueType: record.issueType,
      issue: record.issue,
      vendor: record.vendor,
      priority: record.priority,
      underWarranty: record.underWarranty,
      cost: String(record.cost),
      expectedReturnDate: dateInputValue(record.expectedReturnDate),
      notes: record.notes,
    });
    setEditError(null);
    setEditing(true);
  }

  async function handleEditSave(e: React.FormEvent) {
    e.preventDefault();
    const issue = editForm.issue.trim();
    const vendor = editForm.vendor.trim();
    if (!issue) {
      setEditError("Describe the issue.");
      return;
    }
    if (!vendor) {
      setEditError("Enter a vendor.");
      return;
    }
    if (!editForm.expectedReturnDate) {
      setEditError("Choose an expected return date.");
      return;
    }
    setEditBusy(true);
    setEditError(null);
    try {
      await onEdit(record.id, {
        issue_type: editForm.issueType,
        issue,
        vendor,
        priority: editForm.priority,
        under_warranty: editForm.underWarranty,
        // Covered by warranty -> no cost (backend exempts these from "Require Repair Cost").
        cost: editForm.underWarranty ? 0 : Number(editForm.cost || 0),
        expected_return_date: editForm.expectedReturnDate,
        notes: editForm.notes.trim(),
      });
      setEditing(false);
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Unable to update this record.");
    } finally {
      setEditBusy(false);
    }
  }

  const shown = displayStatus(record);
  const meta = REPAIR_STATUS_META[shown];
  const StatusIcon = meta.icon;
  const issueMeta = REPAIR_ISSUE_META[record.issueType];
  const IssueIcon = issueMeta.icon;
  const upcoming = nextRepairStatus(record.status);
  const flowIndex = REPAIR_STATUS_FLOW.indexOf(record.status);
  const overdueBy = shown === "Overdue" ? Math.abs(daysFromToday(record.expectedReturnDate)) : 0;
  const isTerminal = record.status === "Completed" || record.status === "Cancelled";

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-slate-900/40 p-4">
      <button aria-label="Close" className="absolute inset-0 cursor-default" onClick={onClose} />
      <div className="relative flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl dark:bg-slate-900">
        <div className="shrink-0 border-b border-slate-100 p-6 dark:border-slate-800">
          <div className="flex items-start justify-between">
            <div>
              <p className="font-mono text-sm font-semibold text-blue-600 dark:text-blue-400">{record.repairId}</p>
              <h2 className="mt-1 text-xl font-bold text-slate-900 dark:text-white">{record.assetName}</h2>
              <p className="mt-1 font-mono text-sm text-slate-400 dark:text-slate-500">{record.assetTag}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold", meta.chip)}>
                  <StatusIcon className="h-3.5 w-3.5" />
                  {shown}
                </span>
                <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold", issueMeta.chip)}>
                  <IssueIcon className="h-3.5 w-3.5" />
                  {record.issueType}
                </span>
                <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold", REPAIR_PRIORITY_STYLES[record.priority])}>
                  {record.priority} priority
                </span>
                {record.underWarranty && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400">
                    <ShieldCheck className="h-3.5 w-3.5" />
                    Under Warranty
                  </span>
                )}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {canChange && !editing && (
                <button
                  type="button"
                  title="Edit record"
                  aria-label="Edit record"
                  onClick={startEdit}
                  className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 transition hover:bg-blue-50 hover:text-blue-600 dark:hover:bg-blue-500/10 dark:hover:text-blue-400"
                >
                  <Pencil className="h-4.5 w-4.5" />
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="h-4.5 w-4.5" />
              </button>
            </div>
          </div>

          {shown === "Overdue" && (
            <div className="mt-4 flex items-center gap-2 rounded-xl border border-red-100 bg-red-50 p-3 text-sm text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              Overdue by {overdueBy} day{overdueBy === 1 ? "" : "s"} — expected back {formatDate(record.expectedReturnDate)}.
            </div>
          )}
        </div>

        {editing ? (
          <form onSubmit={handleEditSave} className="flex-1 overflow-y-auto p-6">
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">Issue Type</label>
                  <select
                    value={editForm.issueType}
                    onChange={(e) => setEditForm((f) => ({ ...f, issueType: e.target.value as RepairIssueType }))}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-100"
                  >
                    {REPAIR_ISSUE_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">Vendor</label>
                  <input
                    type="text"
                    value={editForm.vendor}
                    onChange={(e) => setEditForm((f) => ({ ...f, vendor: e.target.value }))}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-100"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">Issue</label>
                <textarea
                  value={editForm.issue}
                  onChange={(e) => setEditForm((f) => ({ ...f, issue: e.target.value }))}
                  rows={2}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-100"
                />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
                    Expected Return
                  </label>
                  <input
                    type="date"
                    value={editForm.expectedReturnDate}
                    onChange={(e) => setEditForm((f) => ({ ...f, expectedReturnDate: e.target.value }))}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-100"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">Priority</label>
                  <select
                    value={editForm.priority}
                    onChange={(e) => setEditForm((f) => ({ ...f, priority: e.target.value as RepairPriority }))}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-100"
                  >
                    {REPAIR_PRIORITIES.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">Cost</label>
                  <input
                    type="number"
                    min="0"
                    value={editForm.cost}
                    disabled={editForm.underWarranty}
                    onChange={(e) => setEditForm((f) => ({ ...f, cost: e.target.value }))}
                    placeholder="₹"
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-100"
                  />
                </div>
              </div>

              <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                <input
                  type="checkbox"
                  checked={editForm.underWarranty}
                  onChange={(e) => setEditForm((f) => ({ ...f, underWarranty: e.target.checked }))}
                  className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 dark:border-slate-700"
                />
                Under warranty (cost covered)
              </label>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
                  Notes (optional)
                </label>
                <textarea
                  value={editForm.notes}
                  onChange={(e) => setEditForm((f) => ({ ...f, notes: e.target.value }))}
                  rows={3}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-100"
                />
              </div>

              {editError && (
                <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-500/10 dark:text-red-400">
                  {editError}
                </p>
              )}
            </div>

            <div className="mt-5 flex justify-end gap-2 border-t border-slate-100 pt-4 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={editBusy}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {editBusy ? "Saving…" : "Save changes"}
              </button>
            </div>
          </form>
        ) : (
        <div className="flex-1 overflow-y-auto p-6">
          <div className="space-y-6">
            {!isTerminal ? (
              <div className="flex items-start">
                {REPAIR_STATUS_FLOW.map((step, i) => {
                  const StepIcon = REPAIR_STATUS_META[step].icon;
                  const reached = i <= flowIndex;
                  return (
                    <Fragment key={step}>
                      {i > 0 && (
                        <div className="flex h-8 flex-1 items-center px-1.5">
                          <span
                            className={cn(
                              "h-0.5 w-full",
                              reached ? "bg-blue-500" : "bg-slate-200 dark:bg-slate-800"
                            )}
                          />
                        </div>
                      )}
                      <div className="flex shrink-0 flex-col items-center">
                        <span
                          className={cn(
                            "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2",
                            reached
                              ? "border-blue-500 bg-blue-500 text-white"
                              : "border-slate-200 bg-white text-slate-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-600"
                          )}
                        >
                          <StepIcon className="h-4 w-4" />
                        </span>
                        <p
                          className={cn(
                            "mt-2 max-w-[70px] text-center text-[10px] font-medium leading-tight",
                            reached ? "text-slate-700 dark:text-slate-200" : "text-slate-400 dark:text-slate-600"
                          )}
                        >
                          {step}
                        </p>
                      </div>
                    </Fragment>
                  );
                })}
              </div>
            ) : record.status === "Cancelled" ? (
              <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-800/40 dark:text-slate-400">
                <XCircle className="h-5 w-5 shrink-0" />
                This repair job was cancelled.
              </div>
            ) : (
              <div className="flex items-center gap-3 rounded-xl border border-emerald-100 bg-emerald-50 p-4 text-sm text-emerald-600 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-400">
                <Wrench className="h-5 w-5 shrink-0" />
                Completed on {record.completedDate ? formatDate(record.completedDate) : "—"}.
              </div>
            )}

            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                Reported Issue
              </p>
              <p className="mt-2 rounded-xl border border-slate-100 p-3 text-sm text-slate-600 dark:border-slate-800 dark:text-slate-300">
                {record.issue}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
              <div>
                <p className="flex items-center gap-1.5 text-xs text-slate-400 dark:text-slate-500">
                  <Store className="h-3.5 w-3.5" />
                  Vendor
                </p>
                <p className="mt-1 font-medium text-slate-800 dark:text-slate-100">{record.vendor}</p>
              </div>
              <div>
                <p className="flex items-center gap-1.5 text-xs text-slate-400 dark:text-slate-500">
                  <MapPin className="h-3.5 w-3.5" />
                  Location
                </p>
                <p className="mt-1 font-medium text-slate-800 dark:text-slate-100">{record.location}</p>
              </div>
              <div>
                <p className="flex items-center gap-1.5 text-xs text-slate-400 dark:text-slate-500">
                  <Calendar className="h-3.5 w-3.5" />
                  Reported
                </p>
                <p className="mt-1 font-medium text-slate-800 dark:text-slate-100">{formatDate(record.reportedDate)}</p>
              </div>
              <div>
                <p className="flex items-center gap-1.5 text-xs text-slate-400 dark:text-slate-500">
                  <IndianRupee className="h-3.5 w-3.5" />
                  Cost
                </p>
                <p className="mt-1 font-medium text-slate-800 dark:text-slate-100">
                  {record.underWarranty ? "Covered" : `₹${record.cost.toLocaleString("en-IN")}`}
                </p>
              </div>
            </div>

            {record.notes && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">Notes</p>
                <p className="mt-2 rounded-xl border border-slate-100 p-3 text-sm text-slate-600 dark:border-slate-800 dark:text-slate-300">
                  {record.notes}
                </p>
              </div>
            )}
          </div>
        </div>
        )}

        {canChange && !editing && !isTerminal && (
          <div className="flex shrink-0 justify-end gap-2 border-t border-slate-100 p-4 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setConfirmingCancel(true)}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-red-600 transition hover:bg-red-50 dark:border-slate-800 dark:hover:bg-red-500/10"
            >
              Cancel Repair
            </button>
            {upcoming && (
              <button
                type="button"
                onClick={() => setConfirmingAdvance(true)}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
              >
                Mark as {upcoming}
              </button>
            )}
          </div>
        )}

        {canDelete && !editing && record.status === "Cancelled" && (
          <div className="flex shrink-0 justify-end gap-2 border-t border-slate-100 p-4 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setConfirmingDelete(true)}
              className="flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-red-600 transition hover:bg-red-50 dark:border-slate-800 dark:hover:bg-red-500/10"
            >
              <Trash2 className="h-4 w-4" />
              Delete Record
            </button>
          </div>
        )}
      </div>

      {confirmingCancel && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 p-4">
          <button aria-label="Close" className="absolute inset-0 cursor-default" onClick={() => setConfirmingCancel(false)} />
          <div className="relative w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl dark:bg-slate-900">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400">
                <AlertTriangle className="h-5 w-5" />
              </span>
              <div>
                <h3 className="text-base font-semibold text-slate-900 dark:text-white">Cancel this repair?</h3>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  The {record.issueType} job for {record.assetTag} will be marked as cancelled. This action cannot be undone.
                </p>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmingCancel(false)}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Keep Repair
              </button>
              <button
                type="button"
                onClick={() => {
                  onCancel(record.id);
                  setConfirmingCancel(false);
                }}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-red-700"
              >
                Confirm Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmingAdvance && upcoming && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 p-4">
          <button aria-label="Close" className="absolute inset-0 cursor-default" onClick={() => setConfirmingAdvance(false)} />
          <div className="relative w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl dark:bg-slate-900">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400">
                {(() => {
                  const UpcomingIcon = REPAIR_STATUS_META[upcoming].icon;
                  return <UpcomingIcon className="h-5 w-5" />;
                })()}
              </span>
              <div>
                <h3 className="text-base font-semibold text-slate-900 dark:text-white">Mark as {upcoming}?</h3>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  {record.repairId} for {record.assetTag} will move from {record.status} to {upcoming}.
                  {upcoming === "Completed" && " The asset will be marked available again."}
                </p>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmingAdvance(false)}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  onAdvance(record.id, upcoming);
                  setConfirmingAdvance(false);
                }}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmingDelete && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 p-4">
          <button aria-label="Close" className="absolute inset-0 cursor-default" onClick={() => setConfirmingDelete(false)} />
          <div className="relative w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl dark:bg-slate-900">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400">
                <Trash2 className="h-5 w-5" />
              </span>
              <div>
                <h3 className="text-base font-semibold text-slate-900 dark:text-white">Delete this record?</h3>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  The cancelled {record.issueType} job for {record.assetTag} will be permanently removed from repair history. This action cannot be undone.
                </p>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmingDelete(false)}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Keep Record
              </button>
              <button
                type="button"
                onClick={() => {
                  onDelete(record.id);
                  setConfirmingDelete(false);
                }}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-red-700"
              >
                Confirm Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
