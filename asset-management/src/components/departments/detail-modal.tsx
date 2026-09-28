"use client";

import { createElement } from "react";
import { Boxes, IndianRupee, Pencil, Trash2, Users, X } from "lucide-react";
import { statusChip, type Asset } from "@/components/assets/data";
import { EMPLOYEE_STATUS_STYLES, type Employee } from "@/components/employees/data";
import { colorFor, iconFor, type Department } from "@/components/departments/data";
import { Modal } from "@/components/ui/modal";
import { cn } from "@/lib/utils";

export function DepartmentDetailModal({
  department,
  assets,
  employees,
  onClose,
  onEdit,
  onDelete,
}: {
  department: Department;
  assets: Asset[];
  employees: Employee[];
  onClose: () => void;
  onEdit?: (department: Department) => void;
  onDelete?: (department: Department) => void;
}) {
  const Icon = iconFor(department.iconLabel);
  const color = colorFor(department.colorKey);
  const totalValue = assets.reduce((sum, a) => sum + a.currentValue, 0);

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
                  {department.name}
                </h2>
                <p className="mt-0.5 text-sm text-slate-400 dark:text-slate-500">
                  {assets.length} assets · {employees.length} team members
                </p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              {onEdit && (
                <button
                  type="button"
                  onClick={() => onEdit(department)}
                  title="Edit department"
                  aria-label="Edit department"
                  className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
                >
                  <Pencil className="h-4 w-4" />
                </button>
              )}
              {onDelete && (
                <button
                  type="button"
                  onClick={() => onDelete(department)}
                  title="Delete department"
                  aria-label="Delete department"
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
              <p className="text-lg font-bold text-slate-900 dark:text-white">{employees.length}</p>
              <p className="text-xs text-slate-400 dark:text-slate-500">Employees</p>
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
                <Users className="h-3.5 w-3.5" />
                Team Members
              </div>
              {employees.length > 0 ? (
                <div className="mt-3 space-y-2">
                  {employees.map((e) => (
                    <div
                      key={e.id}
                      className="flex items-center gap-3 rounded-xl border border-slate-100 p-3 dark:border-slate-800"
                    >
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-semibold text-blue-700 dark:bg-blue-500/20 dark:text-blue-300">
                        {e.name
                          .split(" ")
                          .map((p) => p[0])
                          .slice(0, 2)
                          .join("")}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">
                          {e.name}
                        </p>
                        <p className="text-xs text-slate-400 dark:text-slate-500">{e.designation}</p>
                      </div>
                      <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold", EMPLOYEE_STATUS_STYLES[e.status])}>
                        {e.status}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-3 flex items-center gap-3 rounded-xl border border-dashed border-slate-200 p-4 text-sm text-slate-400 dark:border-slate-800">
                  No team members assigned to this department yet.
                </div>
              )}
            </div>

            <div>
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                <IndianRupee className="h-3.5 w-3.5" />
                Assets in this Department
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
                  No assets allocated to this department yet.
                </div>
              )}
            </div>
          </div>
        </div>
    </Modal>
  );
}
