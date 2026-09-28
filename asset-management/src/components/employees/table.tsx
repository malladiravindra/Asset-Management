"use client";

import { useMemo, useState } from "react";
import {
  Briefcase,
  ChevronLeft,
  ChevronRight,
  Eye,
  Mail,
  Pencil,
  Phone,
  Plus,
  Search,
  UserCheck,
  Users,
  X,
} from "lucide-react";
import { useCan } from "@/components/auth/context";
import { useEmployees } from "@/components/employees/context";
import { useDepartments } from "@/components/departments/context";
import { useLocations } from "@/components/locations/context";
import { useAssets } from "@/components/assets/context";
import { isValidEmail, normalizeEmail, normalizeIndianPhone } from "@/lib/contact";
import {
  EMPLOYEE_STATUS_STYLES,
  assetsFor,
  type Employee,
  type EmployeeStatus,
} from "@/components/employees/data";
import type { Department } from "@/components/departments/data";
import type { Location } from "@/components/locations/data";
import { EmployeeDetailModal } from "@/components/employees/detail-modal";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import type { OrganizationViewMode } from "@/components/organization/tabs";

const PAGE_SIZE = 12;
// The backend only knows two states (Employee.is_active bridges "active"/
// "inactive") — there is no "On Leave" column, so the Add/Edit form only
// offers the two states it can actually persist. EmployeeStatus itself
// still allows "On Leave" for display purposes elsewhere in the app.
const STATUSES: EmployeeStatus[] = ["Active", "Inactive"];

function emptyForm(departments: Department[], locations: Location[]) {
  return {
    name: "",
    department: "",
    designation: "",
    location: locations[0]?.name ?? "",
    status: "Active" as EmployeeStatus,
    email: "",
    phone: "",
  };
}

const AVATAR_TONES = [
  "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300",
  "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300",
  "bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300",
  "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300",
  "bg-cyan-100 text-cyan-700 dark:bg-cyan-500/20 dark:text-cyan-300",
];

function initials(name: string) {
  return name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function avatarTone(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash + name.charCodeAt(i)) % AVATAR_TONES.length;
  return AVATAR_TONES[hash];
}

export function EmployeesTable({ viewMode = "cards" }: { viewMode?: OrganizationViewMode }) {
  const { employees, createEmployee, updateEmployee, deleteEmployee } = useEmployees();
  const { departments } = useDepartments();
  const { locations } = useLocations();
  const { assets } = useAssets();
  const { showSuccess, showErrorFromException } = useToast();
  const canAdd = useCan("assets.add_employee");
  const canChange = useCan("assets.change_employee");
  const canDelete = useCan("assets.delete_employee");
  const [search, setSearch] = useState("");
  const [deptFilter, setDeptFilter] = useState<string | "All">("All");
  const [page, setPage] = useState(1);
  const [formMode, setFormMode] = useState<"add" | "edit" | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState(() => emptyForm(departments, locations));
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [viewEmployee, setViewEmployee] = useState<Employee | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Employee | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return employees.filter((e) => {
      const matchesDept = deptFilter === "All" || e.department === deptFilter;
      const matchesQuery =
        !q ||
        e.name.toLowerCase().includes(q) ||
        e.employeeId.toLowerCase().includes(q) ||
        e.email.toLowerCase().includes(q) ||
        e.designation.toLowerCase().includes(q);
      return matchesDept && matchesQuery;
    });
  }, [employees, search, deptFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageItems = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const activeCount = employees.filter((e) => e.status === "Active").length;
  const departmentCount = departments.length;
  const avgAssets = (
    employees.reduce((sum, e) => sum + assetsFor(assets, e.name).length, 0) / Math.max(1, employees.length)
  ).toFixed(1);

  function updateFilter(next: string | "All") {
    setDeptFilter(next);
    setPage(1);
  }

  function updateSearch(value: string) {
    setSearch(value);
    setPage(1);
  }

  function openAddModal() {
    setForm(emptyForm(departments, locations));
    setFormError(null);
    setEditingId(null);
    setFormMode("add");
  }

  function openEditModal(employee: Employee) {
    setForm({
      name: employee.name,
      department: employee.department,
      designation: employee.designation,
      location: employee.location,
      status: employee.status,
      email: employee.email,
      phone: employee.phone,
    });
    setFormError(null);
    setEditingId(employee.id);
    setFormMode("edit");
  }

  function openViewModal(employee: Employee) {
    setViewEmployee(employee);
  }

  function closeFormModal() {
    setFormMode(null);
    setEditingId(null);
  }

  async function handleSubmitForm(e: React.FormEvent) {
    e.preventDefault();

    if (!form.name.trim()) {
      setFormError("Enter the employee's name.");
      return;
    }
    if (!form.email.trim()) {
      setFormError("Enter an email address.");
      return;
    }
    if (!isValidEmail(form.email)) {
      setFormError("Enter a valid email address.");
      return;
    }
    if (!form.phone.trim()) {
      setFormError("Enter a phone number.");
      return;
    }
    const normalizedPhone = normalizeIndianPhone(form.phone);
    if (normalizedPhone === null) {
      setFormError("Enter a valid 10-digit phone number, e.g. 9876543210 (optionally with a +91 prefix).");
      return;
    }
    const location = locations.find((l) => l.name === form.location);
    if (!location) {
      setFormError("Select a location.");
      return;
    }
    const department = departments.find((d) => d.name === form.department);

    const input = {
      name: form.name.trim(),
      email: normalizeEmail(form.email),
      phone: normalizedPhone,
      designation: form.designation.trim(),
      departmentId: department?.id ?? null,
      locationId: location.id,
      status: (form.status === "Active" ? "active" : "inactive") as "active" | "inactive",
    };

    setSubmitting(true);
    setFormError(null);
    try {
      if (formMode === "edit" && editingId !== null) {
        await updateEmployee(editingId, input);
        showSuccess(`Employee "${input.name}" updated.`);
      } else {
        await createEmployee(input);
        showSuccess(`Employee "${input.name}" added.`);
        setDeptFilter("All");
        setSearch("");
        setPage(1);
      }
      closeFormModal();
    } catch (error) {
      showErrorFromException(error);
      setFormError(error instanceof Error ? error.message : "Could not save this employee.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(employee: Employee) {
    try {
      await deleteEmployee(employee.id);
      showSuccess(`Employee "${employee.name}" deleted.`);
    } catch (error) {
      showErrorFromException(error, "Could not delete this employee.");
    } finally {
      setConfirmDelete(null);
      setViewEmployee(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Employee Directory</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {employees.length} employees across {departmentCount} departments
          </p>
        </div>
        {canAdd && (
          <button
            type="button"
            onClick={openAddModal}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
          >
            <Plus className="h-4 w-4" />
            Add Employee
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="cursor-pointer rounded-2xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-900/[0.02] transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md hover:shadow-slate-900/5 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400">
            <Users className="h-5 w-5" />
          </span>
          <p className="mt-3 text-2xl font-bold text-slate-900 dark:text-white">{employees.length}</p>
          <p className="text-sm text-slate-500 dark:text-slate-400">Total Employees</p>
        </div>
        <div className="cursor-pointer rounded-2xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-900/[0.02] transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md hover:shadow-slate-900/5 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400">
            <UserCheck className="h-5 w-5" />
          </span>
          <p className="mt-3 text-2xl font-bold text-slate-900 dark:text-white">{activeCount}</p>
          <p className="text-sm text-slate-500 dark:text-slate-400">Active</p>
        </div>
        <div className="cursor-pointer rounded-2xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-900/[0.02] transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md hover:shadow-slate-900/5 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-400">
            <Briefcase className="h-5 w-5" />
          </span>
          <p className="mt-3 text-2xl font-bold text-slate-900 dark:text-white">{departmentCount}</p>
          <p className="text-sm text-slate-500 dark:text-slate-400">Departments</p>
        </div>
        <div className="cursor-pointer rounded-2xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-900/[0.02] transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md hover:shadow-slate-900/5 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400">
            <UserCheck className="h-5 w-5" />
          </span>
          <p className="mt-3 text-2xl font-bold text-slate-900 dark:text-white">{avgAssets}</p>
          <p className="text-sm text-slate-500 dark:text-slate-400">Avg. Assets / Employee</p>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-900/[0.02] dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => updateSearch(e.target.value)}
              placeholder="Search employees, IDs, designations..."
              className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-500/20 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-100"
            />
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => updateFilter("All")}
              className={cn(
                "rounded-full px-3 py-1.5 text-sm font-medium transition",
                deptFilter === "All"
                  ? "bg-blue-600 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
              )}
            >
              All
            </button>
            {departments.map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => updateFilter(d.name)}
                className={cn(
                  "rounded-full px-3 py-1.5 text-sm font-medium transition",
                  deptFilter === d.name
                    ? "bg-blue-600 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                )}
              >
                {d.name}
              </button>
            ))}
          </div>
        </div>
      </div>

      {pageItems.length > 0 && viewMode === "table" ? (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs uppercase tracking-wider text-slate-400 dark:border-slate-800 dark:text-slate-500">
                <th className="py-3 pl-4 pr-4 font-semibold">Employee</th>
                <th className="py-3 pr-4 font-semibold">Designation</th>
                <th className="py-3 pr-4 font-semibold">Department</th>
                <th className="py-3 pr-4 font-semibold">Contact</th>
                <th className="py-3 pr-4 text-center font-semibold">Assets</th>
                <th className="py-3 pr-4 font-semibold">Status</th>
                <th className="w-20 py-3 pr-4" />
              </tr>
            </thead>
            <tbody>
              {pageItems.map((e) => {
                const assetCount = assetsFor(assets, e.name).length;
                return (
                  <tr
                    key={e.id}
                    onClick={() => openViewModal(e)}
                    className="cursor-pointer border-b border-slate-50 transition hover:bg-slate-50 dark:border-slate-800/60 dark:hover:bg-slate-800/40"
                  >
                    <td className="py-3 pl-4 pr-4">
                      <div className="flex items-center gap-2.5">
                        <span
                          className={cn(
                            "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                            avatarTone(e.name)
                          )}
                        >
                          {initials(e.name)}
                        </span>
                        <div>
                          <p className="font-medium text-slate-800 dark:text-slate-100">{e.name}</p>
                          <p className="text-xs text-slate-400 dark:text-slate-500">{e.employeeId}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 pr-4 text-slate-600 dark:text-slate-300">{e.designation}</td>
                    <td className="py-3 pr-4 text-slate-600 dark:text-slate-300">{e.department}</td>
                    <td className="py-3 pr-4 text-slate-600 dark:text-slate-300">
                      <p className="flex items-center gap-1.5 text-xs">
                        <Mail className="h-3 w-3 shrink-0 text-slate-400" />
                        {e.email}
                      </p>
                      <p className="mt-0.5 flex items-center gap-1.5 text-xs">
                        <Phone className="h-3 w-3 shrink-0 text-slate-400" />
                        {e.phone}
                      </p>
                    </td>
                    <td className="py-3 pr-4 text-center font-medium text-slate-800 dark:text-slate-100">
                      {assetCount}
                    </td>
                    <td className="py-3 pr-4">
                      <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold", EMPLOYEE_STATUS_STYLES[e.status])}>
                        <span className="h-1.5 w-1.5 rounded-full bg-current" />
                        {e.status}
                      </span>
                    </td>
                    <td className="py-3 pr-4">
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            openViewModal(e);
                          }}
                          title="View details"
                          aria-label="View details"
                          className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 transition hover:bg-blue-50 hover:text-blue-600 dark:hover:bg-blue-500/10 dark:hover:text-blue-400"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                        {canChange && (
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              openEditModal(e);
                            }}
                            title="Edit employee"
                            aria-label="Edit employee"
                            className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-300"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : pageItems.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {pageItems.map((e) => {
            const assetCount = assetsFor(assets, e.name).length;
            return (
              <div
                key={e.id}
                onClick={() => openViewModal(e)}
                className="group relative flex cursor-pointer flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-900/[0.02] transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md hover:shadow-slate-900/5 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700"
              >
                <div className="absolute right-3 top-3 flex items-center gap-1">
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      openViewModal(e);
                    }}
                    title="View details"
                    aria-label="View details"
                    className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 transition hover:bg-blue-50 hover:text-blue-600 dark:hover:bg-blue-500/10 dark:hover:text-blue-400"
                  >
                    <Eye className="h-4 w-4" />
                  </button>
                  {canChange && (
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        openEditModal(e);
                      }}
                      title="Edit employee"
                      aria-label="Edit employee"
                      className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-300"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>

                <div className="flex flex-col items-center text-center">
                  <span
                    className={cn(
                      "flex h-16 w-16 shrink-0 items-center justify-center rounded-full text-lg font-semibold",
                      avatarTone(e.name)
                    )}
                  >
                    {initials(e.name)}
                  </span>
                  <p className="mt-3 truncate text-base font-semibold text-slate-900 dark:text-white">
                    {e.name}
                  </p>
                  <p className="mt-0.5 truncate text-sm text-slate-500 dark:text-slate-400">
                    {e.designation} · {e.department}
                  </p>
                  <p className="mt-2 flex items-center gap-1.5 truncate text-xs text-slate-400 dark:text-slate-500">
                    <Mail className="h-3 w-3 shrink-0" />
                    <span className="truncate">{e.email}</span>
                  </p>
                  <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-400 dark:text-slate-500">
                    <Phone className="h-3 w-3 shrink-0" />
                    {e.phone}
                  </p>
                </div>

                <div className="mt-5 grid grid-cols-2 divide-x divide-slate-100 border-t border-slate-100 pt-4 dark:divide-slate-800 dark:border-slate-800">
                  <div className="text-center">
                    <p className="text-lg font-bold text-slate-900 dark:text-white">{assetCount}</p>
                    <p className="text-xs text-slate-400 dark:text-slate-500">Assets</p>
                  </div>
                  <div className="text-center">
                    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold", EMPLOYEE_STATUS_STYLES[e.status])}>
                      <span className="h-1.5 w-1.5 rounded-full bg-current" />
                      {e.status}
                    </span>
                    <p className="mt-1.5 text-xs text-slate-400 dark:text-slate-500">Status</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-white py-12 text-center text-sm text-slate-400 dark:border-slate-800 dark:bg-slate-900">
          No employees match your search or filters.
        </div>
      )}

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm shadow-slate-900/[0.02] dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col items-center justify-between gap-3 p-4 text-sm sm:flex-row">
          <p className="text-slate-500 dark:text-slate-400">
            Showing {pageItems.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1}–
            {Math.min(currentPage * PAGE_SIZE, filtered.length)} of {filtered.length} employees
          </p>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-800 dark:text-slate-400 dark:hover:bg-slate-800"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="px-2 text-slate-600 dark:text-slate-300">
              Page {currentPage} of {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-800 dark:text-slate-400 dark:hover:bg-slate-800"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {formMode && (
        <Modal onClose={closeFormModal} maxWidthClassName="max-w-lg">
          <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                  {formMode === "edit" ? "Edit Employee" : "Add Employee"}
                </h2>
                {formMode === "edit" && (
                  <p className="text-xs text-slate-400 dark:text-slate-500">
                    {employees.find((e) => e.id === editingId)?.employeeId}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={closeFormModal}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSubmitForm} className="mt-5 space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
                  Full name
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Anjali Singh"
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-100"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
                    Department
                  </label>
                  <select
                    value={form.department}
                    onChange={(e) => setForm((f) => ({ ...f, department: e.target.value }))}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-100"
                  >
                    <option value="">No department</option>
                    {departments.map((d) => (
                      <option key={d.id} value={d.name}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
                    Designation
                  </label>
                  <input
                    type="text"
                    value={form.designation}
                    onChange={(e) => setForm((f) => ({ ...f, designation: e.target.value }))}
                    placeholder="e.g. Software Engineer"
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-100"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
                    Location
                  </label>
                  <select
                    value={form.location}
                    onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-100"
                  >
                    {locations.length === 0 && <option value="">No locations yet</option>}
                    {locations.map((l) => (
                      <option key={l.id} value={l.name}>
                        {l.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
                    Status
                  </label>
                  <select
                    value={form.status}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, status: e.target.value as EmployeeStatus }))
                    }
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-100"
                  >
                    {STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
                    Email
                  </label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                    placeholder="name@assetflow.com"
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-100"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
                    Phone
                  </label>
                  <input
                    type="text"
                    value={form.phone}
                    onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                    placeholder="+91 98765 43210"
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-100"
                  />
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
                  onClick={closeFormModal}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {submitting ? "Saving…" : formMode === "edit" ? "Save Changes" : "Add Employee"}
                </button>
              </div>
            </form>
        </Modal>
      )}

      {viewEmployee && (
        <EmployeeDetailModal
          employee={viewEmployee}
          onClose={() => setViewEmployee(null)}
          onEdit={
            canChange
              ? (employee) => {
                  setViewEmployee(null);
                  openEditModal(employee);
                }
              : undefined
          }
          onDelete={canDelete ? setConfirmDelete : undefined}
        />
      )}

      {confirmDelete && (
        <Modal onClose={() => setConfirmDelete(null)} maxWidthClassName="max-w-sm" zIndexClassName="z-40">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Delete employee?</h2>
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
