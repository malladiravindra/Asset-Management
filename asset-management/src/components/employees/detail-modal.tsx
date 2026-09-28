"use client";

import {
  Boxes,
  Briefcase,
  Building2,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Trash2,
  X,
} from "lucide-react";
import { statusChip } from "@/components/assets/data";
import { useAssets } from "@/components/assets/context";
import { assetsFor, EMPLOYEE_STATUS_STYLES, type Employee } from "@/components/employees/data";
import { Modal } from "@/components/ui/modal";
import { cn } from "@/lib/utils";

export function EmployeeDetailModal({
  employee,
  onClose,
  onEdit,
  onDelete,
}: {
  employee: Employee;
  onClose: () => void;
  onEdit?: (employee: Employee) => void;
  onDelete?: (employee: Employee) => void;
}) {
  const { assets: allAssets } = useAssets();
  const assets = assetsFor(allAssets, employee.name);
  const totalValue = assets.reduce((sum, a) => sum + a.currentValue, 0);

  return (
    <Modal onClose={onClose} maxWidthClassName="max-w-2xl" variant="content">
        <div className="shrink-0 border-b border-slate-100 p-6 dark:border-slate-800">
          <div className="flex items-start justify-between">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-blue-600 text-base font-semibold text-white">
                {employee.name
                  .split(" ")
                  .map((p) => p[0])
                  .slice(0, 2)
                  .join("")}
              </span>
              <div className="min-w-0">
                <h2 className="truncate text-xl font-bold text-slate-900 dark:text-white">
                  {employee.name}
                </h2>
                <p className="mt-0.5 text-sm text-slate-400 dark:text-slate-500">
                  {employee.employeeId} · {employee.designation}
                </p>
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

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className={cn("inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold", EMPLOYEE_STATUS_STYLES[employee.status])}>
              <span className="h-1.5 w-1.5 rounded-full bg-current" />
              {employee.status}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 px-3 py-1 text-xs font-medium text-slate-500 dark:border-slate-700 dark:text-slate-400">
              <Building2 className="h-3 w-3" />
              {employee.department}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 px-3 py-1 text-xs font-medium text-slate-500 dark:border-slate-700 dark:text-slate-400">
              <MapPin className="h-3 w-3" />
              {employee.location}
            </span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          <div className="space-y-6">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                Contact & Role
              </p>
              <dl className="mt-3 divide-y divide-slate-50 dark:divide-slate-800/60">
                {(
                  [
                    ["Email", employee.email, Mail],
                    ["Phone", employee.phone, Phone],
                    ["Department", employee.department, Building2],
                    ["Designation", employee.designation, Briefcase],
                  ] as [string, string, typeof Mail][]
                ).map(([label, value, Icon]) => (
                  <div key={label} className="flex items-center justify-between gap-4 py-2.5 text-sm">
                    <dt className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
                      <Icon className="h-3.5 w-3.5" />
                      {label}
                    </dt>
                    <dd className="font-medium text-slate-800 dark:text-slate-100">{value}</dd>
                  </div>
                ))}
              </dl>
            </div>

            <div>
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                  Assigned Assets
                </p>
                {assets.length > 0 && (
                  <span className="text-xs text-slate-400 dark:text-slate-500">
                    {assets.length} · ₹{totalValue.toLocaleString("en-IN")} book value
                  </span>
                )}
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
                          {a.tag} · {a.category}
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
                  No assets currently assigned.
                </div>
              )}
            </div>
          </div>
        </div>

        {(onEdit || onDelete) && (
          <div className="flex shrink-0 items-center gap-2 border-t border-slate-100 p-4 dark:border-slate-800">
            {onEdit && (
              <button
                type="button"
                onClick={() => onEdit(employee)}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
              >
                <Pencil className="h-4 w-4" />
                Edit Employee
              </button>
            )}
            {onDelete && (
              <button
                type="button"
                onClick={() => onDelete(employee)}
                title="Delete employee"
                aria-label="Delete employee"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-400 transition hover:bg-red-50 hover:text-red-600 dark:border-slate-800 dark:hover:bg-red-500/10 dark:hover:text-red-400"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>
        )}
    </Modal>
  );
}
