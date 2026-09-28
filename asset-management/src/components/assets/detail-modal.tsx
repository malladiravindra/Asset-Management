"use client";

import { useState, type ReactNode } from "react";
import {
  CalendarClock,
  MapPin,
  Pencil,
  PackagePlus,
  QrCode,
  ShieldAlert,
  ShieldCheck,
  ShieldOff,
  Store,
  TrendingDown,
  Trash2,
  UserCheck,
  UserX,
  X,
} from "lucide-react";
import {
  CATEGORY_SINGULAR,
  CONDITION_STYLES,
  WARRANTY_STYLES,
  formatDate,
  statusChip,
  type Asset,
} from "@/components/assets/data";
import { useCan } from "@/components/auth/context";
import { cn } from "@/lib/utils";

const TABS = ["Overview", "History", "Warranty", "Timeline"] as const;
type Tab = (typeof TABS)[number];

export function AssetDetailModal({
  asset,
  onClose,
  onEdit,
  onAssign,
  onDelete,
}: {
  asset: Asset;
  onClose: () => void;
  onEdit: (asset: Asset) => void;
  onAssign: (asset: Asset) => void;
  onDelete: (id: number) => void;
}) {
  const [tab, setTab] = useState<Tab>("Overview");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const canChange = useCan("assets.change_asset");
  const canDelete = useCan("assets.delete_asset");
  const canAssign = useCan("operations.add_assignment");
  // From the backend, derived from the real warranty_end_date (null when none is on file).
  const daysToExpiry = asset.warrantyDaysRemaining;

  const basicInfo: [string, ReactNode][] = [
    ["Asset ID", asset.tag],
    ["Asset Tag", asset.assetTag],
    ["Serial Number", asset.serial],
    ["Category", CATEGORY_SINGULAR[asset.category] ?? asset.category],
    ["Brand / Model", asset.name],
    [
      "Status",
      <span key="status" className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold", statusChip(asset.status))}>
        <span className="h-1.5 w-1.5 rounded-full bg-current" />
        {asset.status}
      </span>,
    ],
    [
      "Condition",
      <span key="condition" className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold", CONDITION_STYLES[asset.condition])}>
        <span className="h-1.5 w-1.5 rounded-full bg-current" />
        {asset.condition}
      </span>,
    ],
    ["Department", asset.department],
    ["Location", asset.location],
    ["Assigned To", asset.assignedTo ?? "Unassigned"],
  ];

  const financialInfo: [string, string][] = [
    ["Purchase Cost", `₹${asset.cost.toLocaleString("en-IN")}`],
    ["Current Value", `₹${asset.currentValue.toLocaleString("en-IN")}`],
    ["Purchase Date", asset.purchaseDate ? formatDate(asset.purchaseDate) : "Not recorded"],
    ["Vendor", asset.vendor],
  ];

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-slate-900/40 p-4">
      <button aria-label="Close" className="absolute inset-0 cursor-default" onClick={onClose} />
      <div className="relative flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl dark:bg-slate-900">
        <div className="shrink-0 border-b border-slate-100 p-6 dark:border-slate-800">
          <div className="flex items-start justify-between">
            <div className="min-w-0">
              <h2 className="truncate text-xl font-bold text-slate-900 dark:text-white">
                {asset.name}
              </h2>
              <p className="mt-1 text-sm text-slate-400 dark:text-slate-500">
                <span className="font-medium text-blue-600 dark:text-blue-400">{asset.tag}</span>
                {" · "}
                {asset.assetTag}
                {" · "}
                {asset.serial}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <X className="h-4.5 w-4.5" />
            </button>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className={cn("inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold", statusChip(asset.status))}>
              <span className="h-1.5 w-1.5 rounded-full bg-current" />
              {asset.status}
            </span>
            <span className={cn("inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold", CONDITION_STYLES[asset.condition])}>
              <span className="h-1.5 w-1.5 rounded-full bg-current" />
              {asset.condition}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 px-3 py-1 text-xs font-medium text-slate-500 dark:border-slate-700 dark:text-slate-400">
              <MapPin className="h-3 w-3" />
              {asset.location}
            </span>
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
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                  Basic Information
                </p>
                <dl className="mt-3 divide-y divide-slate-50 dark:divide-slate-800/60">
                  {basicInfo.map(([label, value]) => (
                    <div key={label} className="flex items-center justify-between gap-4 py-2.5 text-sm">
                      <dt className="text-slate-500 dark:text-slate-400">{label}</dt>
                      <dd className="font-medium text-slate-800 dark:text-slate-100">{value}</dd>
                    </div>
                  ))}
                </dl>
              </div>

              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                  Financial
                </p>
                <dl className="mt-3 divide-y divide-slate-50 dark:divide-slate-800/60">
                  {financialInfo.map(([label, value]) => (
                    <div key={label} className="flex items-center justify-between gap-4 py-2.5 text-sm">
                      <dt className="text-slate-500 dark:text-slate-400">{label}</dt>
                      <dd className="font-medium text-slate-800 dark:text-slate-100">{value}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            </div>
          )}

          {tab === "History" && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                Assignment History
              </p>
              {asset.assignedTo ? (
                <div className="mt-3 flex items-center gap-3 rounded-xl border border-slate-100 p-4 dark:border-slate-800">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-100 text-sm font-semibold text-blue-700 dark:bg-blue-500/20 dark:text-blue-300">
                    {asset.assignedTo
                      .split(" ")
                      .map((p) => p[0])
                      .slice(0, 2)
                      .join("")}
                  </span>
                  <div>
                    <p className="font-medium text-slate-800 dark:text-slate-100">
                      {asset.assignedTo}
                    </p>
                    <p className="text-sm text-slate-400 dark:text-slate-500">
                      {asset.department} · {asset.location}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="mt-3 flex items-center gap-3 rounded-xl border border-dashed border-slate-200 p-4 text-sm text-slate-400 dark:border-slate-800">
                  <UserX className="h-4 w-4" />
                  Currently unassigned — no active assignment on record.
                </div>
              )}
            </div>
          )}

          {tab === "Warranty" && (
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
                  <p className="font-semibold text-slate-800 dark:text-slate-100">
                    {asset.warranty}
                  </p>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    {daysToExpiry === null
                      ? "No warranty end date on file"
                      : daysToExpiry >= 0
                        ? `${daysToExpiry} days of coverage remaining`
                        : `Coverage ended ${Math.abs(daysToExpiry)} days ago`}
                  </p>
                </div>
              </div>

              <dl className="divide-y divide-slate-50 rounded-xl border border-slate-100 px-4 dark:divide-slate-800/60 dark:border-slate-800">
                <div className="flex items-center justify-between py-3 text-sm">
                  <dt className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
                    <CalendarClock className="h-4 w-4" />
                    Warranty Start
                  </dt>
                  <dd className="font-medium text-slate-800 dark:text-slate-100">
                    {asset.warrantyStartDate ? formatDate(asset.warrantyStartDate) : "Not recorded"}
                  </dd>
                </div>
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
                  <dd className="font-medium text-slate-800 dark:text-slate-100">
                    {asset.warrantyProvider || "Not recorded"}
                  </dd>
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

          {tab === "Timeline" && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                Asset Lifecycle
              </p>
              <ul className="mt-3 space-y-1">
                <li className="flex items-start gap-3 rounded-lg px-2 py-2.5">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400">
                    <PackagePlus className="h-4 w-4" />
                  </span>
                  <div>
                    <p className="text-sm text-slate-700 dark:text-slate-200">
                      Purchased from {asset.vendor}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">
                      {asset.purchaseDate ? formatDate(asset.purchaseDate) : "Purchase date not recorded"} · ₹{asset.cost.toLocaleString("en-IN")}
                    </p>
                  </div>
                </li>

                {asset.assignedTo && (
                  <li className="flex items-start gap-3 rounded-lg px-2 py-2.5">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400">
                      <UserCheck className="h-4 w-4" />
                    </span>
                    <div>
                      <p className="text-sm text-slate-700 dark:text-slate-200">
                        Assigned to {asset.assignedTo}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">
                        {asset.department} · {asset.location}
                      </p>
                    </div>
                  </li>
                )}

                <li className="flex items-start gap-3 rounded-lg px-2 py-2.5">
                  <span
                    className={cn(
                      "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
                      WARRANTY_STYLES[asset.warranty]
                    )}
                  >
                    {asset.warranty === "Active" && <ShieldCheck className="h-4 w-4" />}
                    {asset.warranty === "Expiring" && <ShieldAlert className="h-4 w-4" />}
                    {asset.warranty === "Expired" && <ShieldOff className="h-4 w-4" />}
                  </span>
                  <div>
                    <p className="text-sm text-slate-700 dark:text-slate-200">
                      Warranty {asset.warranty.toLowerCase()}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">
                      {asset.warrantyEndDate
                        ? `${asset.warranty === "Expired" ? "Expired" : "Expires"} ${formatDate(asset.warrantyEndDate)}`
                        : "No end date on file"}
                    </p>
                  </div>
                </li>

                {asset.currentValue < asset.cost && (
                  <li className="flex items-start gap-3 rounded-lg px-2 py-2.5">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                      <TrendingDown className="h-4 w-4" />
                    </span>
                    <div>
                      <p className="text-sm text-slate-700 dark:text-slate-200">
                        Depreciated to ₹{asset.currentValue.toLocaleString("en-IN")}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">
                        Current book value
                      </p>
                    </div>
                  </li>
                )}
              </ul>
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2 border-t border-slate-100 p-4 dark:border-slate-800">
          {canChange && (
            <button
              type="button"
              onClick={() => onEdit(asset)}
              className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
            >
              <Pencil className="h-4 w-4" />
              Edit
            </button>
          )}
          {canAssign && (
            <button
              type="button"
              onClick={() => onAssign(asset)}
              title={
                asset.assignedTo
                  ? "Manage this asset's assignment on the Assignments page"
                  : "Assign this asset to an employee"
              }
              className="flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <UserCheck className="h-4 w-4" />
              Assign
            </button>
          )}
          <button
            type="button"
            title="Asset QR code"
            className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition hover:bg-slate-50 dark:border-slate-800 dark:text-slate-400 dark:hover:bg-slate-800"
          >
            <QrCode className="h-4 w-4" />
          </button>
          {!canDelete ? null : confirmDelete ? (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => onDelete(asset.id)}
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
