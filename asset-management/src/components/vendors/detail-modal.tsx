"use client";

import { Boxes, IndianRupee, Mail, Pencil, Phone, Trash2, X } from "lucide-react";
import { statusChip, type Asset } from "@/components/assets/data";
import { initials, typeMeta, type Vendor } from "@/components/vendors/data";
import { Modal } from "@/components/ui/modal";
import { cn } from "@/lib/utils";

export function VendorDetailModal({
  vendor,
  assets,
  onClose,
  onEdit,
  onDelete,
}: {
  vendor: Vendor;
  assets: Asset[];
  onClose: () => void;
  onEdit?: (vendor: Vendor) => void;
  onDelete?: (vendor: Vendor) => void;
}) {
  const meta = typeMeta(vendor.type);
  const Icon = meta.icon;
  const totalSpend = assets.reduce((sum, a) => sum + a.cost, 0);

  const byCategory = new Map<string, { count: number; value: number }>();
  for (const a of assets) {
    const entry = byCategory.get(a.category) ?? { count: 0, value: 0 };
    entry.count += 1;
    entry.value += a.cost;
    byCategory.set(a.category, entry);
  }
  const categories = [...byCategory.entries()].sort((a, b) => b[1].value - a[1].value);

  return (
    <Modal onClose={onClose} maxWidthClassName="max-w-2xl" variant="content">
        <div className="shrink-0 border-b border-slate-100 p-6 dark:border-slate-800">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <span className={cn("flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-sm font-bold", meta.iconBg)}>
                {initials(vendor.name)}
              </span>
              <div>
                <h2 className="text-xl font-bold text-slate-900 dark:text-white">{vendor.name}</h2>
                <p className="mt-0.5 flex items-center gap-1 text-sm text-slate-400 dark:text-slate-500">
                  <Icon className="h-3.5 w-3.5" />
                  {vendor.type}
                </p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              {onEdit && (
                <button
                  type="button"
                  onClick={() => onEdit(vendor)}
                  title="Edit vendor"
                  aria-label="Edit vendor"
                  className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
                >
                  <Pencil className="h-4 w-4" />
                </button>
              )}
              {onDelete && (
                <button
                  type="button"
                  onClick={() => onDelete(vendor)}
                  title="Delete vendor"
                  aria-label="Delete vendor"
                  className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 transition hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10 dark:hover:text-red-400"
                >
                  <Trash2 className="h-4 w-4" />
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

          <div className="mt-4 flex flex-wrap gap-4 text-sm text-slate-500 dark:text-slate-400">
            <span className="flex items-center gap-1.5">
              <Mail className="h-3.5 w-3.5" />
              {vendor.email}
            </span>
            <span className="flex items-center gap-1.5">
              <Phone className="h-3.5 w-3.5" />
              {vendor.phone}
            </span>
          </div>

          <div className="mt-5 grid grid-cols-3 gap-3">
            <div className="rounded-xl border border-slate-100 p-3 text-center dark:border-slate-800">
              <p className="text-lg font-bold text-slate-900 dark:text-white">{assets.length}</p>
              <p className="text-xs text-slate-400 dark:text-slate-500">Assets Supplied</p>
            </div>
            <div className="rounded-xl border border-slate-100 p-3 text-center dark:border-slate-800">
              <p className="text-lg font-bold text-slate-900 dark:text-white">₹{(totalSpend / 100000).toFixed(1)}L</p>
              <p className="text-xs text-slate-400 dark:text-slate-500">Total Spend</p>
            </div>
            <div className="rounded-xl border border-slate-100 p-3 text-center dark:border-slate-800">
              <p className="text-lg font-bold text-slate-900 dark:text-white">{categories.length}</p>
              <p className="text-xs text-slate-400 dark:text-slate-500">Categories</p>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          <div className="space-y-6">
            <div>
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                <IndianRupee className="h-3.5 w-3.5" />
                Spend by Category
              </div>
              {categories.length > 0 ? (
                <div className="mt-3 space-y-2">
                  {categories.map(([category, stat]) => (
                    <div
                      key={category}
                      className="flex items-center justify-between rounded-xl border border-slate-100 p-3 dark:border-slate-800"
                    >
                      <p className="text-sm font-medium text-slate-800 dark:text-slate-100">
                        {category}
                        <span className="ml-2 text-xs font-normal text-slate-400 dark:text-slate-500">
                          {stat.count} asset{stat.count === 1 ? "" : "s"}
                        </span>
                      </p>
                      <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                        ₹{(stat.value / 100000).toFixed(1)}L
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-3 flex items-center gap-3 rounded-xl border border-dashed border-slate-200 p-4 text-sm text-slate-400 dark:border-slate-800">
                  No purchases recorded from this vendor yet.
                </div>
              )}
            </div>

            <div>
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                <Boxes className="h-3.5 w-3.5" />
                Assets Purchased
              </div>
              {assets.length > 0 ? (
                <div className="mt-3 space-y-2">
                  {assets.map((a) => (
                    <div
                      key={a.id}
                      className="flex items-center gap-3 rounded-xl border border-slate-100 p-3 dark:border-slate-800"
                    >
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                        <Boxes className="h-4 w-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">{a.name}</p>
                        <p className="text-xs text-slate-400 dark:text-slate-500">
                          {a.tag} · ₹{a.cost.toLocaleString("en-IN")}
                        </p>
                      </div>
                      <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold", statusChip(a.status))}>
                        {a.status}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-3 flex items-center gap-3 rounded-xl border border-dashed border-slate-200 p-4 text-sm text-slate-400 dark:border-slate-800">
                  No assets purchased from this vendor yet.
                </div>
              )}
            </div>
          </div>
        </div>
    </Modal>
  );
}
