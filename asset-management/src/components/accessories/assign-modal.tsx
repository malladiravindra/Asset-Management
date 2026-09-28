"use client";

import { useMemo, useState } from "react";
import { X } from "lucide-react";
import { useAccessories } from "@/components/accessories/context";
import { availableQty } from "@/components/accessories/data";
import { useAccessoryAssignments } from "@/components/accessory-assignments/context";
import { assignedAccessoriesFor } from "@/components/accessory-assignments/data";
import { useAssets } from "@/components/assets/context";
import { TODAY } from "@/components/assets/data";
import { useEmployees } from "@/components/employees/context";
import { assetsFor } from "@/components/employees/data";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

const labelClass = "mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300";
const inputClass =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-100";

function toInputDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function AssignAccessoryModal({
  defaultAccessoryId = null,
  onClose,
}: {
  defaultAccessoryId?: number | null;
  onClose: () => void;
}) {
  const { accessories, refreshAccessories } = useAccessories();
  const { employees } = useEmployees();
  const { assets, loading: assetsLoading } = useAssets();
  const {
    accessoryAssignments,
    loading: assignmentsLoading,
    loadError,
    createAccessoryAssignment,
  } = useAccessoryAssignments();
  const { showSuccess, showErrorFromException } = useToast();

  const [employeeId, setEmployeeId] = useState<number | "">("");
  const [accessoryId, setAccessoryId] = useState<number | "">(defaultAccessoryId ?? "");
  const [quantity, setQuantity] = useState("1");
  const [assignedDate, setAssignedDate] = useState(toInputDate(TODAY));
  const [notes, setNotes] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const employee = employees.find((e) => e.id === employeeId) ?? null;
  const accessory = accessories.find((a) => a.id === accessoryId) ?? null;
  const available = accessory ? availableQty(accessory) : 0;
  const quantityNumber = Number(quantity);
  const exceedsAvailable = accessory !== null && quantity.trim() !== "" && !Number.isNaN(quantityNumber) && quantityNumber > available;

  // Accessories with nothing left in stock are excluded, except whichever
  // one is already selected — an edge case (e.g. it just ran out while this
  // modal was open) shouldn't make the current selection vanish silently.
  const selectableAccessories = useMemo(
    () => accessories.filter((a) => availableQty(a) > 0 || a.id === accessoryId),
    [accessories, accessoryId]
  );

  const loadingAssigned = assetsLoading || assignmentsLoading;
  const assignedAssets = employee ? assetsFor(assets, employee.name) : [];
  const assignedAccessorySummaries = employee ? assignedAccessoriesFor(accessoryAssignments, employee.id) : [];
  const hasNothingAssigned =
    !!employee &&
    !loadingAssigned &&
    !loadError &&
    assignedAssets.length === 0 &&
    assignedAccessorySummaries.length === 0;

  function handleAccessoryChange(value: string) {
    const id = value ? Number(value) : "";
    setAccessoryId(id);
    setFormError(null);
    const next = accessories.find((a) => a.id === id);
    setQuantity(next && availableQty(next) > 0 ? "1" : "0");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!employeeId) {
      setFormError("Select an employee.");
      return;
    }
    if (!accessoryId || !accessory) {
      setFormError("Select an accessory to assign.");
      return;
    }
    if (!quantity.trim() || Number.isNaN(quantityNumber) || !Number.isInteger(quantityNumber) || quantityNumber < 1) {
      setFormError("Enter a quantity of at least 1.");
      return;
    }
    if (quantityNumber > available) {
      setFormError(`Only ${available} units are available.`);
      return;
    }
    if (!assignedDate) {
      setFormError("Choose an assignment date.");
      return;
    }

    setSubmitting(true);
    setFormError(null);
    try {
      await createAccessoryAssignment({
        accessoryId,
        employeeId,
        quantity: quantityNumber,
        assignedDate,
        notes: notes.trim(),
      });
      await refreshAccessories();
      showSuccess(`${quantityNumber} x ${accessory.name} assigned to ${employee?.name}.`);
      onClose();
    } catch (error) {
      showErrorFromException(error);
      setFormError(error instanceof Error ? error.message : "Could not assign this accessory.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal onClose={onClose} maxWidthClassName="max-w-lg" variant="content">
      <div className="flex shrink-0 items-center justify-between border-b border-slate-100 p-6 dark:border-slate-800">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Assign Accessory</h2>
        <button
          type="button"
          onClick={onClose}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6">
        <div className="space-y-4">
          <div>
            <label className={labelClass}>
              Employee <span className="text-red-500">*</span>
            </label>
            <select
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value ? Number(e.target.value) : "")}
              className={inputClass}
            >
              <option value="">Select Employee</option>
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.name} ({emp.employeeId})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className={labelClass}>Currently Assigned</label>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-800/40">
              {!employee ? (
                <p className="text-sm text-slate-400 dark:text-slate-500">
                  Select an employee to view currently assigned items.
                </p>
              ) : loadingAssigned ? (
                <p className="text-sm text-slate-400 dark:text-slate-500">Loading assigned items...</p>
              ) : loadError ? (
                <p className="text-sm text-red-500 dark:text-red-400">
                  Unable to load currently assigned items. Please try again.
                </p>
              ) : hasNothingAssigned ? (
                <p className="text-sm text-slate-400 dark:text-slate-500">
                  No assets or accessories are currently assigned to this employee.
                </p>
              ) : (
                <div className="space-y-3">
                  {assignedAssets.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                        Assets
                      </p>
                      <ul className="mt-1.5 space-y-1">
                        {assignedAssets.map((a) => (
                          <li
                            key={a.id}
                            className="flex items-center justify-between gap-3 text-sm text-slate-700 dark:text-slate-200"
                          >
                            <span className="truncate">{a.name}</span>
                            <span className="shrink-0 font-mono text-xs text-slate-400 dark:text-slate-500">
                              {a.tag} · 1
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {assignedAccessorySummaries.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                        Accessories
                      </p>
                      <ul className="mt-1.5 space-y-1">
                        {assignedAccessorySummaries.map((s) => (
                          <li
                            key={s.accessoryId}
                            className="flex items-center justify-between gap-3 text-sm text-slate-700 dark:text-slate-200"
                          >
                            <span className="truncate">{s.accessoryName}</span>
                            <span className="shrink-0 font-mono text-xs text-slate-400 dark:text-slate-500">
                              {s.accessorySku} · {s.quantity}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <div>
            <label className={labelClass}>
              Accessory to Assign <span className="text-red-500">*</span>
            </label>
            <select value={accessoryId} onChange={(e) => handleAccessoryChange(e.target.value)} className={inputClass}>
              <option value="">Select Accessory</option>
              {selectableAccessories.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} ({a.sku})
                </option>
              ))}
            </select>
            {accessory && (
              <p className="mt-1.5 text-xs text-slate-400 dark:text-slate-500">Available: {available}</p>
            )}
          </div>

          <div>
            <label className={labelClass}>
              Quantity <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              min={1}
              max={accessory ? available : undefined}
              value={quantity}
              onChange={(e) => {
                setQuantity(e.target.value);
                setFormError(null);
              }}
              disabled={!accessory}
              className={inputClass}
            />
            {exceedsAvailable && (
              <p className="mt-1.5 text-xs font-medium text-red-500 dark:text-red-400">
                Only {available} units are available.
              </p>
            )}
          </div>

          <div>
            <label className={labelClass}>
              Assignment Date <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              value={assignedDate}
              onChange={(e) => setAssignedDate(e.target.value)}
              className={inputClass}
            />
          </div>

          <div>
            <label className={labelClass}>Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Optional"
              className={cn(inputClass, "resize-none")}
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
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {submitting ? "Assigning…" : "Assign"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
