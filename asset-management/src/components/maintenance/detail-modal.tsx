"use client";

import { Fragment, useState } from "react";
import {
  AlertTriangle,
  Calendar,
  IndianRupee,
  MapPin,
  Pencil,
  Trash2,
  User,
  Wrench,
  X,
  XCircle,
} from "lucide-react";
import { useCan } from "@/components/auth/context";
import {
  MAINTENANCE_PRIORITIES,
  MAINTENANCE_STATUS_FLOW,
  MAINTENANCE_STATUS_META,
  MAINTENANCE_TYPES,
  MAINTENANCE_TYPE_META,
  PRIORITY_STYLES,
  daysFromToday,
  displayStatus,
  nextMaintenanceStatus,
  type MaintenancePriority,
  type MaintenanceRecord,
  type MaintenanceStatus,
  type MaintenanceType,
} from "@/components/maintenance/data";
import { formatDate } from "@/components/assets/data";
import { useRuntimeSettings } from "@/components/settings/runtime";
import { cn } from "@/lib/utils";
import { toDateOnly } from "@/lib/dates";

function dateInputValue(d: Date) {
  return toDateOnly(d);
}

type EditPayload = {
  type: MaintenanceType;
  technician: string;
  priority: MaintenancePriority;
  scheduled_date: string;
  cost: number | null;
  notes: string;
};

export function MaintenanceDetailModal({
  record,
  onClose,
  onAdvance,
  onCancel,
  onDelete,
  onEdit,
}: {
  record: MaintenanceRecord;
  onClose: () => void;
  onAdvance: (id: number, status: MaintenanceStatus) => void;
  onCancel: (id: number) => void;
  onDelete: (id: number) => void;
  onEdit: (id: number, payload: EditPayload) => Promise<unknown>;
}) {
  const { values: settings } = useRuntimeSettings();
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [confirmingAdvance, setConfirmingAdvance] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [editing, setEditing] = useState(false);
  const canChange = useCan("operation.change_maintenancerecord");
  const canDelete = useCan("operation.delete_maintenancerecord");
  const [editForm, setEditForm] = useState({
    type: record.type,
    technician: record.technician,
    priority: record.priority,
    scheduledDate: dateInputValue(record.scheduledDate),
    cost: record.cost !== null ? String(record.cost) : "",
    notes: record.notes,
  });
  const [editError, setEditError] = useState<string | null>(null);
  const [editBusy, setEditBusy] = useState(false);

  function startEdit() {
    setEditForm({
      type: record.type,
      technician: record.technician,
      priority: record.priority,
      scheduledDate: dateInputValue(record.scheduledDate),
      cost: record.cost !== null ? String(record.cost) : "",
      notes: record.notes,
    });
    setEditError(null);
    setEditing(true);
  }

  async function handleEditSave(e: React.FormEvent) {
    e.preventDefault();
    const technician = editForm.technician.trim();
    if (!technician) {
      setEditError("Enter a technician name.");
      return;
    }
    if (!editForm.scheduledDate) {
      setEditError("Choose a scheduled date.");
      return;
    }
    setEditBusy(true);
    setEditError(null);
    try {
      await onEdit(record.id, {
        type: editForm.type,
        technician,
        priority: editForm.priority,
        scheduled_date: editForm.scheduledDate,
        cost: editForm.cost.trim() ? Number(editForm.cost) : null,
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
  const meta = MAINTENANCE_STATUS_META[shown];
  const StatusIcon = meta.icon;
  const typeMeta = MAINTENANCE_TYPE_META[record.type];
  const TypeIcon = typeMeta.icon;
  const upcoming = nextMaintenanceStatus(record.status);
  const flowIndex = MAINTENANCE_STATUS_FLOW.indexOf(record.status);
  const overdueBy = shown === "Overdue" ? Math.abs(daysFromToday(record.scheduledDate)) : 0;
  const isTerminal = record.status === "Completed" || record.status === "Cancelled";

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-slate-900/40 p-4">
      <button aria-label="Close" className="absolute inset-0 cursor-default" onClick={onClose} />
      <div className="relative flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl dark:bg-slate-900">
        <div className="shrink-0 border-b border-slate-100 p-6 dark:border-slate-800">
          <div className="flex items-start justify-between">
            <div>
              <p className="font-mono text-sm font-semibold text-blue-600 dark:text-blue-400">{record.assetTag}</p>
              <h2 className="mt-1 text-xl font-bold text-slate-900 dark:text-white">{record.assetName}</h2>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold", meta.chip)}>
                  <StatusIcon className="h-3.5 w-3.5" />
                  {shown}
                </span>
                <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold", typeMeta.chip)}>
                  <TypeIcon className="h-3.5 w-3.5" />
                  {record.type}
                </span>
                <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold", PRIORITY_STYLES[record.priority])}>
                  {record.priority} priority
                </span>
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
              Overdue by {overdueBy} day{overdueBy === 1 ? "" : "s"} — was due {formatDate(record.scheduledDate)}.
            </div>
          )}
        </div>

        {editing ? (
          <form onSubmit={handleEditSave} className="flex-1 overflow-y-auto p-6">
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">Type</label>
                  <select
                    value={editForm.type}
                    onChange={(e) => setEditForm((f) => ({ ...f, type: e.target.value as MaintenanceType }))}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-100"
                  >
                    {MAINTENANCE_TYPES.filter(
                      // Preventive stays selectable only for records that already have it.
                      (t) => t !== "Preventive" || settings?.allow_preventive_maintenance !== false || record.type === "Preventive"
                    ).map((t) => (
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
                    value={editForm.technician}
                    onChange={(e) => setEditForm((f) => ({ ...f, technician: e.target.value }))}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-100"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
                    Scheduled Date
                  </label>
                  <input
                    type="date"
                    value={editForm.scheduledDate}
                    onChange={(e) => setEditForm((f) => ({ ...f, scheduledDate: e.target.value }))}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-100"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">Priority</label>
                  <select
                    value={editForm.priority}
                    onChange={(e) => setEditForm((f) => ({ ...f, priority: e.target.value as MaintenancePriority }))}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-100"
                  >
                    {MAINTENANCE_PRIORITIES.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
                    Cost (optional)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={editForm.cost}
                    onChange={(e) => setEditForm((f) => ({ ...f, cost: e.target.value }))}
                    placeholder="₹"
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-100"
                  />
                </div>
              </div>

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
                {MAINTENANCE_STATUS_FLOW.map((step, i) => {
                  const StepIcon = MAINTENANCE_STATUS_META[step].icon;
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
                This maintenance job was cancelled.
              </div>
            ) : (
              <div className="flex items-center gap-3 rounded-xl border border-emerald-100 bg-emerald-50 p-4 text-sm text-emerald-600 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-400">
                <Wrench className="h-5 w-5 shrink-0" />
                Completed on {record.completedDate ? formatDate(record.completedDate) : "—"}.
              </div>
            )}

            <div className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
              <div>
                <p className="flex items-center gap-1.5 text-xs text-slate-400 dark:text-slate-500">
                  <User className="h-3.5 w-3.5" />
                  Technician
                </p>
                <p className="mt-1 font-medium text-slate-800 dark:text-slate-100">{record.technician}</p>
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
                  Scheduled
                </p>
                <p className="mt-1 font-medium text-slate-800 dark:text-slate-100">{formatDate(record.scheduledDate)}</p>
              </div>
              <div>
                <p className="flex items-center gap-1.5 text-xs text-slate-400 dark:text-slate-500">
                  <IndianRupee className="h-3.5 w-3.5" />
                  Cost
                </p>
                <p className="mt-1 font-medium text-slate-800 dark:text-slate-100">
                  {record.cost !== null ? `₹${record.cost.toLocaleString("en-IN")}` : "—"}
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
              Cancel Job
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
                <h3 className="text-base font-semibold text-slate-900 dark:text-white">Cancel this job?</h3>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  The {record.type} job for {record.assetTag} will be marked as cancelled. This action cannot be undone.
                </p>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmingCancel(false)}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Keep Job
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
                  const UpcomingIcon = MAINTENANCE_STATUS_META[upcoming].icon;
                  return <UpcomingIcon className="h-5 w-5" />;
                })()}
              </span>
              <div>
                <h3 className="text-base font-semibold text-slate-900 dark:text-white">Mark as {upcoming}?</h3>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  The {record.type} job for {record.assetTag} will move from {record.status} to {upcoming}.
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
                  The cancelled {record.type} job for {record.assetTag} will be permanently removed from maintenance history. This action cannot be undone.
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
