"use client";

import { useState } from "react";
import {
  CalendarClock,
  IndianRupee,
  MapPin,
  Minus,
  Pencil,
  Plus,
  Store,
  Tag,
  Trash2,
  UserPlus,
  X,
} from "lucide-react";
import { useCan } from "@/components/auth/context";
import {
  STOCK_STATUS_META,
  availableQty,
  stockStatus,
  stockValue,
  type Accessory,
} from "@/components/accessories/data";
import { useCategories } from "@/components/categories/context";
import { CATEGORY_COLORS, colorFor, iconFor } from "@/components/categories/data";
import { formatDate } from "@/components/assets/data";
import { cn } from "@/lib/utils";

export function AccessoryDetailModal({
  accessory,
  onClose,
  onEdit,
  onDelete,
  onAssignOne,
  onReturnOne,
  onAssignAccessory,
}: {
  accessory: Accessory;
  onClose: () => void;
  onEdit: (accessory: Accessory) => void;
  onDelete: (id: number) => void;
  onAssignOne: (id: number) => void;
  onReturnOne: (id: number) => void;
  onAssignAccessory: (accessory: Accessory) => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const canChange = useCan("operation.change_accessory");
  const canDelete = useCan("operation.delete_accessory");
  const canAssign = useCan("operation.add_accessoryassignment");
  const { categories } = useCategories();

  const available = availableQty(accessory);
  const status = stockStatus(accessory);
  const meta = STOCK_STATUS_META[status];
  const StatusIcon = meta.icon;
  const matchedCategory = categories.find((c) => c.name === accessory.category);
  let categoryHash = 0;
  for (let i = 0; i < accessory.category.length; i++) {
    categoryHash = (categoryHash * 31 + accessory.category.charCodeAt(i)) % 1000;
  }
  const categoryDisplay = matchedCategory
    ? { Icon: iconFor(matchedCategory.iconLabel), chip: colorFor(matchedCategory.colorKey).chip }
    : { Icon: Tag, chip: CATEGORY_COLORS[categoryHash % CATEGORY_COLORS.length].chip };
  const { Icon: CategoryIcon, chip: categoryChip } = categoryDisplay;
  const assignedPct = accessory.totalQty > 0 ? Math.round((accessory.assignedQty / accessory.totalQty) * 100) : 0;

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-slate-900/40 p-4">
      <button aria-label="Close" className="absolute inset-0 cursor-default" onClick={onClose} />
      <div className="relative flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-xl dark:bg-slate-900">
        <div className="shrink-0 border-b border-slate-100 p-6 dark:border-slate-800">
          <div className="flex items-start justify-between">
            <div>
              <p className="font-mono text-sm font-semibold text-blue-600 dark:text-blue-400">{accessory.sku}</p>
              <h2 className="mt-1 text-xl font-bold text-slate-900 dark:text-white">{accessory.name}</h2>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold", categoryChip)}>
                  <CategoryIcon className="h-3.5 w-3.5" />
                  {accessory.category}
                </span>
                <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold", meta.chip)}>
                  <StatusIcon className="h-3.5 w-3.5" />
                  {status}
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <X className="h-4.5 w-4.5" />
            </button>
          </div>

          <div className="mt-5 grid grid-cols-3 gap-3">
            <div className="rounded-xl border border-slate-100 p-3 text-center dark:border-slate-800">
              <p className="text-lg font-bold text-slate-900 dark:text-white">{accessory.totalQty}</p>
              <p className="text-xs text-slate-400 dark:text-slate-500">Total</p>
            </div>
            <div className="rounded-xl border border-slate-100 p-3 text-center dark:border-slate-800">
              <p className="text-lg font-bold text-slate-900 dark:text-white">{accessory.assignedQty}</p>
              <p className="text-xs text-slate-400 dark:text-slate-500">Assigned</p>
            </div>
            <div className="rounded-xl border border-slate-100 p-3 text-center dark:border-slate-800">
              <p className="text-lg font-bold text-slate-900 dark:text-white">{available}</p>
              <p className="text-xs text-slate-400 dark:text-slate-500">Available</p>
            </div>
          </div>

          <div className="mt-4">
            <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
              <div className="h-full rounded-full bg-blue-500" style={{ width: `${assignedPct}%` }} />
            </div>
            <p className="mt-1.5 text-xs text-slate-400 dark:text-slate-500">{assignedPct}% of stock assigned</p>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="flex items-center gap-1.5 text-xs text-slate-400 dark:text-slate-500">
                  <Store className="h-3.5 w-3.5" />
                  Vendor
                </p>
                <p className="mt-1 font-medium text-slate-800 dark:text-slate-100">{accessory.vendor}</p>
              </div>
              <div>
                <p className="flex items-center gap-1.5 text-xs text-slate-400 dark:text-slate-500">
                  <MapPin className="h-3.5 w-3.5" />
                  Location
                </p>
                <p className="mt-1 font-medium text-slate-800 dark:text-slate-100">{accessory.location}</p>
              </div>
              <div>
                <p className="flex items-center gap-1.5 text-xs text-slate-400 dark:text-slate-500">
                  <IndianRupee className="h-3.5 w-3.5" />
                  Unit Cost
                </p>
                <p className="mt-1 font-medium text-slate-800 dark:text-slate-100">
                  ₹{accessory.unitCost.toLocaleString("en-IN")}
                </p>
              </div>
              <div>
                <p className="flex items-center gap-1.5 text-xs text-slate-400 dark:text-slate-500">
                  <CalendarClock className="h-3.5 w-3.5" />
                  Last Restocked
                </p>
                <p className="mt-1 font-medium text-slate-800 dark:text-slate-100">
                  {accessory.lastRestocked ? formatDate(accessory.lastRestocked) : "Not recorded"}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-between rounded-xl border border-slate-100 p-4 dark:border-slate-800">
              <div>
                <p className="text-xs text-slate-400 dark:text-slate-500">Total Stock Value</p>
                <p className="text-lg font-bold text-slate-900 dark:text-white">
                  ₹{stockValue(accessory).toLocaleString("en-IN")}
                </p>
              </div>
              {canChange && (
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => onReturnOne(accessory.id)}
                    disabled={accessory.assignedQty === 0}
                    title="Return one unit to stock"
                    className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-800 dark:text-slate-400 dark:hover:bg-slate-800"
                  >
                    <Minus className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onAssignOne(accessory.id)}
                    disabled={available === 0}
                    title="Assign one unit"
                    className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-800 dark:text-slate-400 dark:hover:bg-slate-800"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2 border-t border-slate-100 p-4 dark:border-slate-800">
          {canChange && (
            <button
              type="button"
              onClick={() => onEdit(accessory)}
              className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
            >
              <Pencil className="h-4 w-4" />
              Edit
            </button>
          )}
          {canAssign && (
            <button
              type="button"
              onClick={() => onAssignAccessory(accessory)}
              disabled={available === 0}
              title="Assign Accessory"
              className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-800 dark:text-slate-400 dark:hover:bg-slate-800"
            >
              <UserPlus className="h-4 w-4" />
            </button>
          )}
          {!canDelete ? null : confirmDelete ? (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => onDelete(accessory.id)}
                className="rounded-lg bg-red-600 px-3 py-2.5 text-sm font-semibold text-white transition hover:bg-red-700"
              >
                Confirm
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="rounded-lg border border-slate-200 px-3 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="flex h-10 w-10 items-center justify-center rounded-lg border border-red-200 text-red-500 transition hover:bg-red-50 dark:border-red-500/30 dark:text-red-400 dark:hover:bg-red-500/10"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
