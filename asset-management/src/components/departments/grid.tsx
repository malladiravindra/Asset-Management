"use client";

import { useMemo, useState } from "react";
import { Boxes, IndianRupee, Plus, Users, X } from "lucide-react";
import { useCan } from "@/components/auth/context";
import { useAssets } from "@/components/assets/context";
import { useEmployees } from "@/components/employees/context";
import { useDepartments } from "@/components/departments/context";
import {
  DEPARTMENT_COLORS,
  DEPARTMENT_ICONS,
  colorFor,
  iconFor,
  type Department,
} from "@/components/departments/data";
import { DepartmentDetailModal } from "@/components/departments/detail-modal";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import type { OrganizationViewMode } from "@/components/organization/tabs";

export function DepartmentsGrid({ viewMode = "cards" }: { viewMode?: OrganizationViewMode }) {
  const { departments, createDepartment, updateDepartment, deleteDepartment } = useDepartments();
  const { assets } = useAssets();
  const { employees } = useEmployees();
  const { showSuccess, showErrorFromException } = useToast();
  const canAdd = useCan("assets.add_department");
  const canChange = useCan("assets.change_department");
  const canDelete = useCan("assets.delete_department");
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<"add" | "edit">("add");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({
    name: "",
    iconLabel: DEPARTMENT_ICONS[0].label,
    colorKey: DEPARTMENT_COLORS[0].key,
  });
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [viewDeptId, setViewDeptId] = useState<number | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Department | null>(null);

  const stats = useMemo(() => {
    return departments.map((d) => {
      const deptAssets = assets.filter((a) => a.department === d.name);
      const deptEmployees = employees.filter((e) => e.department === d.name);
      const totalValue = deptAssets.reduce((sum, a) => sum + a.currentValue, 0);
      return { ...d, deptAssets, deptEmployees, totalValue };
    });
  }, [departments, assets, employees]);

  const maxAssets = Math.max(1, ...stats.map((s) => s.deptAssets.length));
  const totalAssets = assets.length;
  const viewDept = stats.find((s) => s.id === viewDeptId) ?? null;

  function openAddModal() {
    setFormMode("add");
    setEditingId(null);
    setForm({
      name: "",
      iconLabel: DEPARTMENT_ICONS[0].label,
      colorKey: DEPARTMENT_COLORS[departments.length % DEPARTMENT_COLORS.length].key,
    });
    setFormError(null);
    setFormOpen(true);
  }

  function openEditModal(department: Department) {
    setFormMode("edit");
    setEditingId(department.id);
    setForm({
      name: department.name,
      iconLabel: department.iconLabel,
      colorKey: department.colorKey,
    });
    setFormError(null);
    setFormOpen(true);
    setViewDeptId(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const name = form.name.trim();
    if (!name) {
      setFormError("Enter a department name.");
      return;
    }
    if (
      departments.some(
        (d) => d.name.toLowerCase() === name.toLowerCase() && d.id !== editingId
      )
    ) {
      setFormError("A department with this name already exists.");
      return;
    }

    setSubmitting(true);
    setFormError(null);
    try {
      if (formMode === "edit" && editingId !== null) {
        await updateDepartment(editingId, { name, iconLabel: form.iconLabel, colorKey: form.colorKey });
        showSuccess(`Department "${name}" updated.`);
      } else {
        await createDepartment({ name, iconLabel: form.iconLabel, colorKey: form.colorKey });
        showSuccess(`Department "${name}" created.`);
      }
      setFormOpen(false);
    } catch (error) {
      showErrorFromException(error);
      setFormError(error instanceof Error ? error.message : "Could not save this department.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(department: Department) {
    try {
      await deleteDepartment(department.id);
      showSuccess(`Department "${department.name}" deleted.`);
    } catch (error) {
      showErrorFromException(error, "Could not delete this department.");
    } finally {
      setConfirmDelete(null);
      setViewDeptId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Departments</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {departments.length} departments · {totalAssets} assets · {employees.length} employees
          </p>
        </div>
        {canAdd && (
          <button
            type="button"
            onClick={openAddModal}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
          >
            <Plus className="h-4 w-4" />
            Add Department
          </button>
        )}
      </div>

      {viewMode === "table" ? (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <table className="w-full min-w-[700px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs uppercase tracking-wider text-slate-400 dark:border-slate-800 dark:text-slate-500">
                <th className="py-3 pl-4 pr-4 font-semibold">Department</th>
                <th className="py-3 pr-4 text-center font-semibold">Assets</th>
                <th className="py-3 pr-4 text-center font-semibold">Employees</th>
                <th className="py-3 pr-4 text-center font-semibold">Fleet</th>
                <th className="py-3 pr-4 font-semibold">Asset Value</th>
              </tr>
            </thead>
            <tbody>
              {stats.map((d) => {
                const Icon = iconFor(d.iconLabel);
                const color = colorFor(d.colorKey);
                const assetCount = d.deptAssets.length;
                const fleetShare = totalAssets > 0 ? Math.round((assetCount / totalAssets) * 100) : 0;
                return (
                  <tr
                    key={d.id}
                    onClick={() => setViewDeptId(d.id)}
                    className="cursor-pointer border-b border-slate-50 transition hover:bg-slate-50 dark:border-slate-800/60 dark:hover:bg-slate-800/40"
                  >
                    <td className="py-3 pl-4 pr-4">
                      <div className="flex items-center gap-2.5">
                        <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", color.icon)}>
                          <Icon className="h-4 w-4" strokeWidth={2} />
                        </span>
                        <span className="font-medium text-slate-800 dark:text-slate-100">{d.name}</span>
                      </div>
                    </td>
                    <td className="py-3 pr-4 text-center font-medium text-slate-800 dark:text-slate-100">
                      {assetCount}
                    </td>
                    <td className="py-3 pr-4 text-center text-slate-600 dark:text-slate-300">
                      {d.deptEmployees.length}
                    </td>
                    <td className="py-3 pr-4 text-center text-slate-600 dark:text-slate-300">{fleetShare}%</td>
                    <td className="py-3 pr-4 text-slate-600 dark:text-slate-300">
                      ₹{(d.totalValue / 100000).toFixed(1)}L
                    </td>
                  </tr>
                );
              })}
              {stats.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-sm text-slate-400">
                    No departments yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      ) : stats.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white py-12 text-center text-sm text-slate-400 dark:border-slate-800 dark:bg-slate-900">
          No departments yet.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {stats.map((d) => {
            const Icon = iconFor(d.iconLabel);
            const color = colorFor(d.colorKey);
            const assetCount = d.deptAssets.length;
            const fleetShare = totalAssets > 0 ? Math.round((assetCount / totalAssets) * 100) : 0;
            return (
              <button
                type="button"
                key={d.id}
                onClick={() => setViewDeptId(d.id)}
                className="group flex flex-col rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm shadow-slate-900/[0.02] transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md hover:shadow-slate-900/5 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700"
              >
                <div className="flex items-center justify-between">
                  <span className={cn("flex h-11 w-11 items-center justify-center rounded-xl transition group-hover:scale-105", color.icon)}>
                    <Icon className="h-5 w-5" strokeWidth={2} />
                  </span>
                  <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", color.chip)}>
                    {fleetShare}% of fleet
                  </span>
                </div>

                <p className="mt-4 text-base font-semibold text-slate-900 dark:text-white">{d.name}</p>
                <p className="mt-1 flex items-center gap-3 text-xs text-slate-400 dark:text-slate-500">
                  <span className="flex items-center gap-1">
                    <Boxes className="h-3 w-3" />
                    {assetCount} asset{assetCount === 1 ? "" : "s"}
                  </span>
                  <span className="flex items-center gap-1">
                    <Users className="h-3 w-3" />
                    {d.deptEmployees.length} employee{d.deptEmployees.length === 1 ? "" : "s"}
                  </span>
                </p>

                <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                  <div
                    className={cn("h-full rounded-full bg-gradient-to-r", color.bar)}
                    style={{ width: `${(assetCount / maxAssets) * 100}%` }}
                  />
                </div>

                <p className="mt-3 flex items-center gap-1 text-xs text-slate-400 dark:text-slate-500">
                  <IndianRupee className="h-3 w-3" />
                  {(d.totalValue / 100000).toFixed(1)}L current asset value
                </p>
              </button>
            );
          })}
        </div>
      )}

      {formOpen && (
        <Modal onClose={() => setFormOpen(false)}>
          <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                {formMode === "edit" ? "Edit Department" : "Add Department"}
              </h2>
              <button
                type="button"
                onClick={() => setFormOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="mt-5 space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
                  Department name
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Legal"
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-100"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
                  Icon
                </label>
                <div className="flex flex-wrap gap-2">
                  {DEPARTMENT_ICONS.map((opt) => {
                    const Icon = opt.icon;
                    const active = form.iconLabel === opt.label;
                    return (
                      <button
                        key={opt.label}
                        type="button"
                        title={opt.label}
                        onClick={() => setForm((f) => ({ ...f, iconLabel: opt.label }))}
                        className={cn(
                          "flex h-10 w-10 items-center justify-center rounded-lg border transition",
                          active
                            ? "border-blue-500 bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400"
                            : "border-slate-200 text-slate-500 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-400 dark:hover:bg-slate-800"
                        )}
                      >
                        <Icon className="h-4.5 w-4.5" />
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
                  Color
                </label>
                <div className="flex flex-wrap gap-2">
                  {DEPARTMENT_COLORS.map((c) => {
                    const active = form.colorKey === c.key;
                    return (
                      <button
                        key={c.key}
                        type="button"
                        title={c.key}
                        onClick={() => setForm((f) => ({ ...f, colorKey: c.key }))}
                        className={cn(
                          "flex h-8 w-8 items-center justify-center rounded-full ring-2 ring-offset-2 ring-offset-white transition dark:ring-offset-slate-900",
                          c.icon,
                          active ? "ring-slate-400 dark:ring-slate-500" : "ring-transparent"
                        )}
                      />
                    );
                  })}
                </div>
              </div>

              {formError && (
                <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-500/10 dark:text-red-400">
                  {formError}
                </p>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setFormOpen(false)}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {submitting ? "Saving…" : formMode === "edit" ? "Save Changes" : "Add Department"}
                </button>
              </div>
            </form>
        </Modal>
      )}

      {viewDept && (
        <DepartmentDetailModal
          department={viewDept}
          assets={viewDept.deptAssets}
          employees={viewDept.deptEmployees}
          onClose={() => setViewDeptId(null)}
          onEdit={canChange ? openEditModal : undefined}
          onDelete={canDelete ? setConfirmDelete : undefined}
        />
      )}

      {confirmDelete && (
        <Modal onClose={() => setConfirmDelete(null)} maxWidthClassName="max-w-sm" zIndexClassName="z-40">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Delete department?</h2>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
              This will permanently delete &quot;{confirmDelete.name}&quot;. This can&apos;t be undone.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmDelete(null)}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleDelete(confirmDelete)}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-red-700"
              >
                Delete
              </button>
            </div>
        </Modal>
      )}
    </div>
  );
}
