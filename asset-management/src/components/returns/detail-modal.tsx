"use client";

import { useState } from "react";
import {
  Building2,
  Calendar,
  CalendarClock,
  MapPin,
  MessageSquare,
  ShieldAlert,
  ShieldCheck,
  ShieldOff,
  Store,
  User,
  X,
} from "lucide-react";
import { RETURN_CONDITION_STYLES } from "@/components/assignments/data";
import { returnDurationDays, type Return } from "@/components/returns/data";
import {
  WARRANTY_STYLES,
  formatDate,
} from "@/components/assets/data";
import { useAssets } from "@/components/assets/context";
import { cn } from "@/lib/utils";

const TABS = ["Overview", "Warranty"] as const;
type Tab = (typeof TABS)[number];

export function ReturnDetailModal({
  returnRecord,
  onClose,
}: {
  returnRecord: Return;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<Tab>("Overview");
  const { assets } = useAssets();
  const held = returnDurationDays(returnRecord);
  const asset = assets.find((a) => a.id === returnRecord.assetId);

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-slate-900/40 p-4">
      <button aria-label="Close" className="absolute inset-0 cursor-default" onClick={onClose} />
      <div className="relative flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-xl dark:bg-slate-900">
        <div className="shrink-0 border-b border-slate-100 p-6 dark:border-slate-800">
          <div className="flex items-start justify-between">
            <div>
              <p className="font-mono text-sm font-semibold text-blue-600 dark:text-blue-400">
                {returnRecord.returnNumber}
              </p>
              <h2 className="mt-1 text-xl font-bold text-slate-900 dark:text-white">{returnRecord.assetName}</h2>
              <p className="mt-1 font-mono text-sm text-slate-400 dark:text-slate-500">{returnRecord.assetTag}</p>
              {returnRecord.condition && (
                <span
                  className={cn(
                    "mt-2 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold",
                    RETURN_CONDITION_STYLES[returnRecord.condition]
                  )}
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-current" />
                  {returnRecord.condition}
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <X className="h-4.5 w-4.5" />
            </button>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-slate-100 p-3 text-center dark:border-slate-800">
              <p className="text-lg font-bold text-slate-900 dark:text-white">{held}</p>
              <p className="text-xs text-slate-400 dark:text-slate-500">Days Held</p>
            </div>
            <div className="col-span-2 rounded-xl border border-slate-100 p-3 text-center dark:border-slate-800 sm:col-span-1">
              <p className="text-lg font-bold text-slate-900 dark:text-white">{returnRecord.assetCategory}</p>
              <p className="text-xs text-slate-400 dark:text-slate-500">Category</p>
            </div>
          </div>

          <div className="mt-5 flex gap-5 overflow-x-auto border-b border-slate-100 dark:border-slate-800">
            {TABS.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={cn(
                  "relative shrink-0 pb-3 text-sm font-medium transition",
                  tab === t
                    ? "text-blue-600 dark:text-blue-400"
                    : "text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300"
                )}
              >
                {t}
                {tab === t && (
                  <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-blue-600" />
                )}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {tab === "Overview" && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-2">
                <div>
                  <p className="flex items-center gap-1.5 text-xs text-slate-400 dark:text-slate-500">
                    <User className="h-3.5 w-3.5" />
                    Employee
                  </p>
                  <p className="mt-1 font-medium text-slate-800 dark:text-slate-100">{returnRecord.employeeName}</p>
                </div>
                <div>
                  <p className="flex items-center gap-1.5 text-xs text-slate-400 dark:text-slate-500">
                    <Building2 className="h-3.5 w-3.5" />
                    Department
                  </p>
                  <p className="mt-1 font-medium text-slate-800 dark:text-slate-100">{returnRecord.department}</p>
                </div>
                <div>
                  <p className="flex items-center gap-1.5 text-xs text-slate-400 dark:text-slate-500">
                    <MapPin className="h-3.5 w-3.5" />
                    Location
                  </p>
                  <p className="mt-1 font-medium text-slate-800 dark:text-slate-100">{returnRecord.location}</p>
                </div>
                <div>
                  <p className="flex items-center gap-1.5 text-xs text-slate-400 dark:text-slate-500">
                    <Calendar className="h-3.5 w-3.5" />
                    Assigned Date
                  </p>
                  <p className="mt-1 font-medium text-slate-800 dark:text-slate-100">
                    {formatDate(returnRecord.assignedDate)}
                  </p>
                </div>
                <div>
                  <p className="flex items-center gap-1.5 text-xs text-slate-400 dark:text-slate-500">
                    <Calendar className="h-3.5 w-3.5" />
                    Return Date
                  </p>
                  <p className="mt-1 font-medium text-slate-800 dark:text-slate-100">
                    {formatDate(returnRecord.returnDate)}
                  </p>
                </div>
              </div>

              {returnRecord.reason && (
                <div>
                  <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                    <MessageSquare className="h-3.5 w-3.5" />
                    Reason
                  </p>
                  <p className="mt-2 rounded-xl border border-slate-100 p-3 text-sm text-slate-600 dark:border-slate-800 dark:text-slate-300">
                    {returnRecord.reason}
                  </p>
                </div>
              )}
            </div>
          )}

          {tab === "Warranty" && asset && (
            <div className="space-y-4">
              <div className="flex items-center gap-4 rounded-xl border border-slate-100 p-4 dark:border-slate-800">
                <span
                  className={cn(
                    "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl",
                    WARRANTY_STYLES[asset.warranty]
                  )}
                >
                  {asset.warranty === "Active" && <ShieldCheck className="h-5 w-5" />}
                  {asset.warranty === "Expiring" && <ShieldAlert className="h-5 w-5" />}
                  {asset.warranty === "Expired" && <ShieldOff className="h-5 w-5" />}
                </span>
                <div>
                  <p className="font-semibold text-slate-800 dark:text-slate-100">{asset.warranty}</p>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    {(() => {
                      // From the backend, derived from the real warranty_end_date.
                      const daysToExpiry = asset.warrantyDaysRemaining;
                      if (daysToExpiry === null) return "No warranty end date on file";
                      return daysToExpiry >= 0
                        ? `${daysToExpiry} days of coverage remaining`
                        : `Coverage ended ${Math.abs(daysToExpiry)} days ago`;
                    })()}
                  </p>
                </div>
              </div>

              <dl className="divide-y divide-slate-50 rounded-xl border border-slate-100 px-4 dark:divide-slate-800/60 dark:border-slate-800">
                <div className="flex items-center justify-between py-3 text-sm">
                  <dt className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
                    <CalendarClock className="h-4 w-4" />
                    Warranty End
                  </dt>
                  <dd className="font-medium text-slate-800 dark:text-slate-100">
                    {asset.warrantyEndDate ? formatDate(asset.warrantyEndDate) : "Not recorded"}
                  </dd>
                </div>
                <div className="flex items-center justify-between py-3 text-sm">
                  <dt className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
                    <Store className="h-4 w-4" />
                    Provider
                  </dt>
                  <dd className="font-medium text-slate-800 dark:text-slate-100">{asset.warrantyProvider || "Not recorded"}</dd>
                </div>
              </dl>

              {asset.warranty !== "Active" && (
                <div
                  className={cn(
                    "flex items-center gap-2.5 rounded-xl px-4 py-3 text-sm font-medium",
                    asset.warranty === "Expiring"
                      ? "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400"
                      : "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400"
                  )}
                >
                  <ShieldAlert className="h-4 w-4 shrink-0" />
                  {asset.warranty === "Expiring"
                    ? "Warranty expiring within 90 days."
                    : "Warranty has expired — coverage renewal recommended."}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
