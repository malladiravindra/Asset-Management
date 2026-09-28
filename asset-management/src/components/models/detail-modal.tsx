"use client";

import { Boxes, Pencil, Trash2, X } from "lucide-react";
import { statusChip, type Asset } from "@/components/assets/data";
import type { ModelEntry } from "@/components/models/data";
import { Modal } from "@/components/ui/modal";
import { cn } from "@/lib/utils";

export function ModelDetailModal({
  model,
  assets,
  onClose,
  onEdit,
  onDelete,
}: {
  model: ModelEntry;
  assets: Asset[];
  onClose: () => void;
  onEdit?: (model: ModelEntry) => void;
  onDelete?: (model: ModelEntry) => void;
}) {
  const totalValue = assets.reduce((sum, a) => sum + a.currentValue, 0);

  return (
    <Modal onClose={onClose} maxWidthClassName="max-w-xl" variant="content">
        <div className="shrink-0 border-b border-slate-100 p-6 dark:border-slate-800">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">{model.name}</h2>
              <p className="mt-0.5 text-sm text-slate-400 dark:text-slate-500">
                {model.brand} · {model.category}
              </p>
              <p className="mt-1 font-mono text-xs text-slate-400 dark:text-slate-500">{model.spec}</p>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              {onEdit && (
                <button
                  type="button"
                  onClick={() => onEdit(model)}
                  title="Edit model"
                  aria-label="Edit model"
                  className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
                >
                  <Pencil className="h-4 w-4" />
                </button>
              )}
              {onDelete && (
                <button
                  type="button"
                  onClick={() => onDelete(model)}
                  title="Delete model"
                  aria-label="Delete model"
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

          <div className="mt-5 grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-slate-100 p-3 text-center dark:border-slate-800">
              <p className="text-lg font-bold text-slate-900 dark:text-white">{assets.length}</p>
              <p className="text-xs text-slate-400 dark:text-slate-500">Units in fleet</p>
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
          {assets.length > 0 ? (
            <div className="space-y-2">
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
                      {a.tag}
                    </p>
                    <p className="text-xs text-slate-400 dark:text-slate-500">
                      {a.assignedTo ?? "Unassigned"} · {a.location}
                    </p>
                  </div>
                  <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold", statusChip(a.status))}>
                    {a.status}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex items-center gap-3 rounded-xl border border-dashed border-slate-200 p-4 text-sm text-slate-400 dark:border-slate-800">
              No units of this model are currently in the fleet.
            </div>
          )}
        </div>
    </Modal>
  );
}
