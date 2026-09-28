"use client";

import { createElement } from "react";
import { Boxes, IndianRupee, Layers, Pencil, Trash2, X } from "lucide-react";
import { statusChip, type Asset } from "@/components/assets/data";
import { colorFor, iconFor, type Category } from "@/components/categories/data";
import { Modal } from "@/components/ui/modal";
import { cn } from "@/lib/utils";

export function CategoryDetailModal({
  category,
  assets,
  onClose,
  onEdit,
  onDelete,
}: {
  category: Category;
  assets: Asset[];
  onClose: () => void;
  onEdit?: (category: Category) => void;
  onDelete?: (category: Category) => void;
}) {
  const Icon = iconFor(category.iconLabel);
  const color = colorFor(category.colorKey);
  const totalValue = assets.reduce((sum, a) => sum + a.currentValue, 0);

  const models = assets.reduce<Record<string, number>>((acc, a) => {
    acc[a.name] = (acc[a.name] ?? 0) + 1;
    return acc;
  }, {});
  const modelEntries = Object.entries(models).sort((a, b) => b[1] - a[1]);

  return (
    <Modal onClose={onClose} maxWidthClassName="max-w-2xl" variant="content">
        <div className="shrink-0 border-b border-slate-100 p-6 dark:border-slate-800">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <span className={cn("flex h-12 w-12 shrink-0 items-center justify-center rounded-xl", color.icon)}>
                {createElement(Icon, { className: "h-6 w-6" })}
              </span>
              <div>
                <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                  {category.name}
                </h2>
                <p className="mt-0.5 text-sm text-slate-400 dark:text-slate-500">
                  {assets.length} assets · {modelEntries.length} distinct models
                </p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              {onEdit && (
                <button
                  type="button"
                  onClick={() => onEdit(category)}
                  title="Edit category"
                  aria-label="Edit category"
                  className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
                >
                  <Pencil className="h-4 w-4" />
                </button>
              )}
              {onDelete && (
                <button
                  type="button"
                  onClick={() => onDelete(category)}
                  title="Delete category"
                  aria-label="Delete category"
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

          <div className="mt-5 grid grid-cols-3 gap-3">
            <div className="rounded-xl border border-slate-100 p-3 text-center dark:border-slate-800">
              <p className="text-lg font-bold text-slate-900 dark:text-white">{assets.length}</p>
              <p className="text-xs text-slate-400 dark:text-slate-500">Assets</p>
            </div>
            <div className="rounded-xl border border-slate-100 p-3 text-center dark:border-slate-800">
              <p className="text-lg font-bold text-slate-900 dark:text-white">{modelEntries.length}</p>
              <p className="text-xs text-slate-400 dark:text-slate-500">Models</p>
            </div>
            <div className="rounded-xl border border-slate-100 p-3 text-center dark:border-slate-800">
              <p className="text-lg font-bold text-slate-900 dark:text-white">
                ₹{(totalValue / 100000).toFixed(1)}L
              </p>
              <p className="text-xs text-slate-400 dark:text-slate-500">Asset Value</p>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          <div className="space-y-6">
            <div>
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                <Layers className="h-3.5 w-3.5" />
                Models in this Category
              </div>
              {modelEntries.length > 0 ? (
                <dl className="mt-3 divide-y divide-slate-50 dark:divide-slate-800/60">
                  {modelEntries.map(([model, count]) => (
                    <div key={model} className="flex items-center justify-between gap-4 py-2.5 text-sm">
                      <dt className="text-slate-600 dark:text-slate-300">{model}</dt>
                      <dd className="font-medium text-slate-800 dark:text-slate-100">
                        {count} unit{count === 1 ? "" : "s"}
                      </dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <div className="mt-3 flex items-center gap-3 rounded-xl border border-dashed border-slate-200 p-4 text-sm text-slate-400 dark:border-slate-800">
                  No models recorded in this category yet.
                </div>
              )}
            </div>

            <div>
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                <IndianRupee className="h-3.5 w-3.5" />
                Assets
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
                        <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">
                          {a.name}
                        </p>
                        <p className="text-xs text-slate-400 dark:text-slate-500">
                          {a.tag} · {a.assignedTo ?? "Unassigned"}
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
                  No assets recorded in this category yet.
                </div>
              )}
            </div>
          </div>
        </div>
    </Modal>
  );
}
