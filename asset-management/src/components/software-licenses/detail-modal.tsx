"use client";

import { useState } from "react";
import {
  CalendarClock,
  Eye,
  EyeOff,
  IndianRupee,
  KeyRound,
  Minus,
  Pencil,
  Plus,
  RefreshCw,
  Repeat,
  Store,
  Trash2,
  X,
} from "lucide-react";
import { useCan } from "@/components/auth/context";
import {
  LICENSE_STATUS_META,
  LICENSE_TYPE_META,
  LICENSE_CATEGORY_META,
  availableSeats,
  daysToExpiry,
  formatDate,
  licenseStatus,
  maskLicenseKey,
  type SoftwareLicense,
} from "@/components/software-licenses/data";
import { cn } from "@/lib/utils";

export function SoftwareLicenseDetailModal({
  license,
  onClose,
  onEdit,
  onDelete,
  onAssignSeat,
  onReleaseSeat,
  onRenew,
}: {
  license: SoftwareLicense;
  onClose: () => void;
  onEdit: (license: SoftwareLicense) => void;
  onDelete: (id: number) => void;
  onAssignSeat: (id: number) => void;
  onReleaseSeat: (id: number) => void;
  onRenew: (id: number) => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showKey, setShowKey] = useState(false);
  // Seat +/- and renew are license updates too.
  const canChange = useCan("operation.change_softwarelicense");
  const canDelete = useCan("operation.delete_softwarelicense");

  const available = availableSeats(license);
  const status = licenseStatus(license);
  const statusMeta = LICENSE_STATUS_META[status];
  const StatusIcon = statusMeta.icon;
  const typeMeta = LICENSE_TYPE_META[license.licenseType];
  const TypeIcon = typeMeta.icon;
  const categoryMeta = LICENSE_CATEGORY_META[license.category];
  const CategoryIcon = categoryMeta.icon;
  const usedPct = license.totalSeats > 0 ? Math.round((license.seatsUsed / license.totalSeats) * 100) : 0;
  const expiry = daysToExpiry(license);

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-slate-900/40 p-4">
      <button aria-label="Close" className="absolute inset-0 cursor-default" onClick={onClose} />
      <div className="relative flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-xl dark:bg-slate-900">
        <div className="shrink-0 border-b border-slate-100 p-6 dark:border-slate-800">
          <div className="flex items-start justify-between">
            <div>
              <p className="font-mono text-sm font-semibold text-blue-600 dark:text-blue-400">{license.licenseId}</p>
              <h2 className="mt-1 text-xl font-bold text-slate-900 dark:text-white">{license.name}</h2>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold", categoryMeta.chip)}>
                  <CategoryIcon className="h-3.5 w-3.5" />
                  {license.category}
                </span>
                <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold", typeMeta.chip)}>
                  <TypeIcon className="h-3.5 w-3.5" />
                  {license.licenseType}
                </span>
                <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold", statusMeta.chip)}>
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
              <p className="text-lg font-bold text-slate-900 dark:text-white">{license.totalSeats}</p>
              <p className="text-xs text-slate-400 dark:text-slate-500">Total Seats</p>
            </div>
            <div className="rounded-xl border border-slate-100 p-3 text-center dark:border-slate-800">
              <p className="text-lg font-bold text-slate-900 dark:text-white">{license.seatsUsed}</p>
              <p className="text-xs text-slate-400 dark:text-slate-500">Used</p>
            </div>
            <div className="rounded-xl border border-slate-100 p-3 text-center dark:border-slate-800">
              <p className="text-lg font-bold text-slate-900 dark:text-white">{available}</p>
              <p className="text-xs text-slate-400 dark:text-slate-500">Available</p>
            </div>
          </div>

          <div className="mt-4">
            <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
              <div
                className={cn(
                  "h-full rounded-full",
                  usedPct >= 100 ? "bg-red-500" : usedPct >= 80 ? "bg-amber-500" : "bg-blue-500"
                )}
                style={{ width: `${usedPct}%` }}
              />
            </div>
            <p className="mt-1.5 text-xs text-slate-400 dark:text-slate-500">{usedPct}% of seats utilized</p>
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
                <p className="mt-1 font-medium text-slate-800 dark:text-slate-100">{license.vendor}</p>
              </div>
              <div>
                <p className="flex items-center gap-1.5 text-xs text-slate-400 dark:text-slate-500">
                  <IndianRupee className="h-3.5 w-3.5" />
                  Cost
                </p>
                <p className="mt-1 font-medium text-slate-800 dark:text-slate-100">
                  ₹{license.cost.toLocaleString("en-IN")} <span className="text-xs text-slate-400 dark:text-slate-500">{typeMeta.costSuffix}</span>
                </p>
              </div>
              <div>
                <p className="flex items-center gap-1.5 text-xs text-slate-400 dark:text-slate-500">
                  <CalendarClock className="h-3.5 w-3.5" />
                  Purchased
                </p>
                <p className="mt-1 font-medium text-slate-800 dark:text-slate-100">{license.purchaseDate ? formatDate(license.purchaseDate) : "Not recorded"}</p>
              </div>
              <div>
                <p className="flex items-center gap-1.5 text-xs text-slate-400 dark:text-slate-500">
                  <CalendarClock className="h-3.5 w-3.5" />
                  Expires
                </p>
                <p className="mt-1 font-medium text-slate-800 dark:text-slate-100">
                  {license.expiryDate ? formatDate(license.expiryDate) : "Perpetual"}
                  {expiry !== null && expiry >= 0 && (
                    <span className="ml-1.5 text-xs text-slate-400 dark:text-slate-500">({expiry}d)</span>
                  )}
                </p>
              </div>
              <div>
                <p className="flex items-center gap-1.5 text-xs text-slate-400 dark:text-slate-500">
                  <KeyRound className="h-3.5 w-3.5" />
                  License Key
                </p>
                <div className="mt-1 flex items-center gap-1.5">
                  <p className="font-mono text-sm font-medium text-slate-800 dark:text-slate-100">
                    {showKey ? license.licenseKey : maskLicenseKey(license.licenseKey)}
                  </p>
                  <button
                    type="button"
                    onClick={() => setShowKey((v) => !v)}
                    title={showKey ? "Hide key" : "Reveal key"}
                    className="flex h-6 w-6 items-center justify-center rounded-md text-slate-400 transition hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    {showKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </button>
                </div>
              </div>
              <div>
                <p className="flex items-center gap-1.5 text-xs text-slate-400 dark:text-slate-500">
                  <Repeat className="h-3.5 w-3.5" />
                  Auto-Renew
                </p>
                <p className="mt-1 font-medium text-slate-800 dark:text-slate-100">
                  {license.licenseType === "Perpetual" ? "—" : license.autoRenew ? "Enabled" : "Disabled"}
                </p>
              </div>
            </div>

            {license.notes && (
              <div className="rounded-xl border border-slate-100 p-3 text-sm text-slate-600 dark:border-slate-800 dark:text-slate-300">
                {license.notes}
              </div>
            )}

            <div className="flex items-center justify-between rounded-xl border border-slate-100 p-4 dark:border-slate-800">
              <div>
                <p className="text-xs text-slate-400 dark:text-slate-500">Seats</p>
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                  {license.seatsUsed}/{license.totalSeats} in use
                </p>
              </div>
              {canChange && (
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => onReleaseSeat(license.id)}
                    disabled={license.seatsUsed === 0}
                    title="Release one seat"
                    className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-800 dark:text-slate-400 dark:hover:bg-slate-800"
                  >
                    <Minus className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onAssignSeat(license.id)}
                    disabled={available === 0}
                    title="Assign one seat"
                    className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-800 dark:text-slate-400 dark:hover:bg-slate-800"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
              )}
            </div>

            {canChange && license.licenseType !== "Perpetual" && (
              <button
                type="button"
                onClick={() => onRenew(license.id)}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm font-semibold text-blue-600 transition hover:bg-blue-100 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-400 dark:hover:bg-blue-500/20"
              >
                <RefreshCw className="h-4 w-4" />
                Renew for another {license.licenseType === "Monthly" ? "month" : "year"}
              </button>
            )}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2 border-t border-slate-100 p-4 dark:border-slate-800">
          {canChange && (
            <button
              type="button"
              onClick={() => onEdit(license)}
              className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
            >
              <Pencil className="h-4 w-4" />
              Edit
            </button>
          )}
          {!canDelete ? null : confirmDelete ? (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => onDelete(license.id)}
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
