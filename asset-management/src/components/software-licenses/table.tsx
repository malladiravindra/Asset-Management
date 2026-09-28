"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  Boxes,
  ChevronLeft,
  ChevronRight,
  Eye,
  IndianRupee,
  KeySquare,
  Pencil,
  Plus,
  Search,
  X,
} from "lucide-react";
import { useCan } from "@/components/auth/context";
import { useSoftwareLicenses, type SoftwareLicenseInput } from "@/components/software-licenses/context";
import {
  LICENSE_CATEGORIES,
  LICENSE_CATEGORY_META,
  LICENSE_STATUSES,
  LICENSE_STATUS_META,
  LICENSE_TYPES,
  LICENSE_TYPE_META,
  daysToExpiry,
  formatDate,
  licenseStatus,
  termDaysFor,
  utilizationPct,
  type LicenseCategory,
  type LicenseStatus,
  type LicenseType,
  type SoftwareLicense,
} from "@/components/software-licenses/data";
import { SoftwareLicenseDetailModal } from "@/components/software-licenses/detail-modal";
import { TODAY, addDays } from "@/components/assets/data";
import { useVendors } from "@/components/vendors/context";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 10;

function toInputDate(d: Date | null) {
  if (!d) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Blank input -> null (not recorded); dates are never invented.
function fromInputDate(value: string): Date | null {
  if (!value) return null;
  const [y, m, d] = value.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

function licenseToInput(l: SoftwareLicense): SoftwareLicenseInput {
  return {
    name: l.name,
    vendor: l.vendor,
    category: l.category,
    licenseType: l.licenseType,
    licenseKey: l.licenseKey,
    totalSeats: l.totalSeats,
    seatsUsed: l.seatsUsed,
    purchaseDate: l.purchaseDate,
    expiryDate: l.expiryDate,
    autoRenew: l.autoRenew,
    cost: l.cost,
    notes: l.notes,
  };
}

const labelClass = "mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300";
const inputClass =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-100";

function OptionalTag() {
  return <span className="ml-1 text-xs font-normal text-slate-400 dark:text-slate-500">(Optional)</span>;
}

function SectionDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 pt-2">
      <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
        {label}
      </span>
      <div className="h-px flex-1 bg-slate-100 dark:bg-slate-800" />
    </div>
  );
}

const emptyForm = {
  name: "",
  vendor: "",
  category: LICENSE_CATEGORIES[0] as LicenseCategory,
  licenseType: "Annual" as LicenseType,
  licenseKey: "",
  totalSeats: "",
  seatsUsed: "",
  cost: "",
  purchaseDate: toInputDate(TODAY),
  expiryDate: toInputDate(addDays(TODAY, 365)),
  autoRenew: true,
  notes: "",
};

export function SoftwareLicensesTable() {
  const { licenses, createLicense, updateLicense, deleteLicense } = useSoftwareLicenses();
  const { vendors } = useVendors();
  const { showSuccess, showErrorFromException } = useToast();
  const canAdd = useCan("operation.add_softwarelicense");
  const canChange = useCan("operation.change_softwarelicense");

  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<LicenseCategory | "All">("All");
  const [statusFilter, setStatusFilter] = useState<LicenseStatus | "All">("All");
  const [page, setPage] = useState(1);
  const [viewId, setViewId] = useState<number | null>(null);
  const [formMode, setFormMode] = useState<"add" | "edit" | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return licenses.filter((l) => {
      const matchesCategory = categoryFilter === "All" || l.category === categoryFilter;
      const matchesStatus = statusFilter === "All" || licenseStatus(l) === statusFilter;
      const matchesQuery =
        !q ||
        l.licenseId.toLowerCase().includes(q) ||
        l.name.toLowerCase().includes(q) ||
        l.vendor.toLowerCase().includes(q);
      return matchesCategory && matchesStatus && matchesQuery;
    });
  }, [licenses, search, categoryFilter, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageItems = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const totalSeats = licenses.reduce((sum, l) => sum + l.totalSeats, 0);
  const totalSeatsUsed = licenses.reduce((sum, l) => sum + l.seatsUsed, 0);
  const needsAttention = licenses.filter((l) => {
    const s = licenseStatus(l);
    return s === "Expiring Soon" || s === "Expired";
  }).length;
  const totalCost = licenses.reduce((sum, l) => sum + l.cost, 0);

  const viewLicense = licenses.find((l) => l.id === viewId) ?? null;

  function updateSearch(value: string) {
    setSearch(value);
    setPage(1);
  }

  function updateCategoryFilter(next: LicenseCategory | "All") {
    setCategoryFilter(next);
    setPage(1);
  }

  function updateStatusFilter(next: LicenseStatus | "All") {
    setStatusFilter(next);
    setPage(1);
  }

  function openAddModal() {
    setForm({ ...emptyForm, vendor: vendors[0]?.name ?? "" });
    setFormError(null);
    setEditingId(null);
    setFormMode("add");
  }

  function openEditModal(license: SoftwareLicense) {
    setForm({
      name: license.name,
      vendor: license.vendor,
      category: license.category,
      licenseType: license.licenseType,
      licenseKey: license.licenseKey,
      totalSeats: String(license.totalSeats),
      seatsUsed: String(license.seatsUsed),
      cost: String(license.cost),
      purchaseDate: toInputDate(license.purchaseDate),
      expiryDate: license.expiryDate ? toInputDate(license.expiryDate) : "",
      autoRenew: license.autoRenew,
      notes: license.notes,
    });
    setFormError(null);
    setEditingId(license.id);
    setFormMode("edit");
  }

  function closeFormModal() {
    setFormMode(null);
    setEditingId(null);
  }

  async function handleSubmitForm(e: React.FormEvent) {
    e.preventDefault();

    if (!form.name.trim()) {
      setFormError("Enter a software name.");
      return;
    }
    const totalSeatsNum = Number(form.totalSeats);
    if (!form.totalSeats || Number.isNaN(totalSeatsNum) || totalSeatsNum <= 0) {
      setFormError("Enter a valid total seat count.");
      return;
    }
    let seatsUsedNum = 0;
    if (form.seatsUsed.trim() !== "") {
      seatsUsedNum = Number(form.seatsUsed);
      if (Number.isNaN(seatsUsedNum) || seatsUsedNum < 0) {
        setFormError("Enter a valid seats used count.");
        return;
      }
      if (seatsUsedNum > totalSeatsNum) {
        setFormError("Seats used can't exceed total seats.");
        return;
      }
    }
    const costNum = Number(form.cost);
    if (!form.cost || Number.isNaN(costNum) || costNum < 0) {
      setFormError("Enter a valid cost.");
      return;
    }
    if (form.licenseType !== "Perpetual" && !form.expiryDate) {
      setFormError("Enter an expiry date, or choose Perpetual as the license type.");
      return;
    }

    const purchaseDate = fromInputDate(form.purchaseDate);
    const expiryDate = form.licenseType === "Perpetual" ? null : fromInputDate(form.expiryDate);

    const input: SoftwareLicenseInput = {
      name: form.name.trim(),
      vendor: form.vendor,
      category: form.category,
      licenseType: form.licenseType,
      licenseKey: form.licenseKey.trim(),
      totalSeats: totalSeatsNum,
      seatsUsed: seatsUsedNum,
      purchaseDate,
      expiryDate,
      autoRenew: form.licenseType === "Perpetual" ? false : form.autoRenew,
      cost: costNum,
      notes: form.notes.trim(),
    };

    setSubmitting(true);
    setFormError(null);
    try {
      if (formMode === "edit" && editingId !== null) {
        await updateLicense(editingId, input);
        showSuccess(`License "${input.name}" updated.`);
      } else {
        await createLicense(input);
        showSuccess(`License "${input.name}" created.`);
        setCategoryFilter("All");
        setStatusFilter("All");
        setSearch("");
        setPage(1);
      }
      closeFormModal();
    } catch (error) {
      showErrorFromException(error);
      setFormError(error instanceof Error ? error.message : "Could not save this license.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleAssignSeat(id: number) {
    const license = licenses.find((l) => l.id === id);
    if (!license || license.seatsUsed >= license.totalSeats) return;
    try {
      await updateLicense(id, { ...licenseToInput(license), seatsUsed: license.seatsUsed + 1 });
    } catch (error) {
      showErrorFromException(error, "Could not assign a seat.");
    }
  }

  async function handleReleaseSeat(id: number) {
    const license = licenses.find((l) => l.id === id);
    if (!license || license.seatsUsed <= 0) return;
    try {
      await updateLicense(id, { ...licenseToInput(license), seatsUsed: license.seatsUsed - 1 });
    } catch (error) {
      showErrorFromException(error, "Could not release a seat.");
    }
  }

  async function handleRenew(id: number) {
    const license = licenses.find((l) => l.id === id);
    if (!license || license.licenseType === "Perpetual") return;
    try {
      // Extend the term from the later of today and the current expiry.
      // The original purchase date is kept (renewal history is a separate
      // record — not implemented yet).
      const from = license.expiryDate && license.expiryDate > TODAY ? license.expiryDate : TODAY;
      await updateLicense(id, {
        ...licenseToInput(license),
        expiryDate: addDays(from, termDaysFor(license.licenseType)),
      });
      showSuccess(`License "${license.name}" renewed.`);
    } catch (error) {
      showErrorFromException(error, "Could not renew this license.");
    }
  }

  async function handleDelete(id: number) {
    const license = licenses.find((l) => l.id === id);
    try {
      await deleteLicense(id);
      showSuccess(license ? `License "${license.name}" deleted.` : "License deleted.");
    } catch (error) {
      showErrorFromException(error, "Could not delete this license.");
    } finally {
      setViewId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center animate-rise-in">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Software Licenses</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {licenses.length} licenses · {needsAttention} need attention
          </p>
        </div>
        {canAdd && (
          <button
            type="button"
            onClick={openAddModal}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
          >
            <Plus className="h-4 w-4" />
            Add License
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 animate-rise-in" style={{ animationDelay: "120ms" }}>
        <div className="cursor-pointer rounded-2xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-900/[0.02] transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md hover:shadow-slate-900/5 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400">
            <KeySquare className="h-5 w-5" />
          </span>
          <p className="mt-3 text-2xl font-bold text-slate-900 dark:text-white">{licenses.length}</p>
          <p className="text-sm text-slate-500 dark:text-slate-400">Total Licenses</p>
        </div>
        <div className="cursor-pointer rounded-2xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-900/[0.02] transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md hover:shadow-slate-900/5 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400">
            <Boxes className="h-5 w-5" />
          </span>
          <p className="mt-3 text-2xl font-bold text-slate-900 dark:text-white">
            {totalSeatsUsed}/{totalSeats}
          </p>
          <p className="text-sm text-slate-500 dark:text-slate-400">Seats Assigned</p>
        </div>
        <div className="cursor-pointer rounded-2xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-900/[0.02] transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md hover:shadow-slate-900/5 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400">
            <AlertTriangle className="h-5 w-5" />
          </span>
          <p className="mt-3 text-2xl font-bold text-slate-900 dark:text-white">{needsAttention}</p>
          <p className="text-sm text-slate-500 dark:text-slate-400">Expiring / Expired</p>
        </div>
        <div className="cursor-pointer rounded-2xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-900/[0.02] transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md hover:shadow-slate-900/5 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-400">
            <IndianRupee className="h-5 w-5" />
          </span>
          <p className="mt-3 text-2xl font-bold text-slate-900 dark:text-white">₹{totalCost.toLocaleString("en-IN")}</p>
          <p className="text-sm text-slate-500 dark:text-slate-400">Total License Cost</p>
        </div>
      </div>

      <div
        className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-900/[0.02] dark:border-slate-800 dark:bg-slate-900 animate-rise-in"
        style={{ animationDelay: "240ms" }}
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => updateSearch(e.target.value)}
              placeholder="Search license ID, software, vendor..."
              className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-500/20 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-100"
            />
          </div>
          <select
            value={categoryFilter}
            onChange={(e) => updateCategoryFilter(e.target.value as LicenseCategory | "All")}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-100"
          >
            <option value="All">All Categories</option>
            {LICENSE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => updateStatusFilter("All")}
              className={cn(
                "rounded-full px-3 py-1.5 text-sm font-medium transition",
                statusFilter === "All"
                  ? "bg-blue-600 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
              )}
            >
              All
            </button>
            {LICENSE_STATUSES.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => updateStatusFilter(s)}
                className={cn(
                  "rounded-full px-3 py-1.5 text-sm font-medium transition",
                  statusFilter === s
                    ? "bg-blue-600 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                )}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div
        className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm shadow-slate-900/[0.02] dark:border-slate-800 dark:bg-slate-900 animate-rise-in"
        style={{ animationDelay: "360ms" }}
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/60 text-left text-xs uppercase tracking-wider text-slate-400 dark:border-slate-800 dark:bg-slate-800/30 dark:text-slate-500">
                <th className="px-5 py-3 font-semibold">License ID</th>
                <th className="px-4 py-3 font-semibold">Software</th>
                <th className="px-4 py-3 font-semibold">Vendor</th>
                <th className="px-4 py-3 font-semibold">Category</th>
                <th className="px-4 py-3 font-semibold">Seats</th>
                <th className="px-4 py-3 font-semibold">Expires</th>
                <th className="px-4 py-3 text-right font-semibold">Cost</th>
                <th className="w-24 px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {pageItems.map((l) => {
                const status = licenseStatus(l);
                const statusMeta = LICENSE_STATUS_META[status];
                const StatusIcon = statusMeta.icon;
                const categoryMeta = LICENSE_CATEGORY_META[l.category];
                const CategoryIcon = categoryMeta.icon;
                const typeMeta = LICENSE_TYPE_META[l.licenseType];
                const pct = utilizationPct(l);
                const expiry = daysToExpiry(l);
                return (
                  <tr
                    key={l.id}
                    onClick={() => setViewId(l.id)}
                    className="cursor-pointer border-b border-slate-50 transition last:border-0 hover:bg-slate-50 dark:border-slate-800/60 dark:hover:bg-slate-800/40"
                  >
                    <td className="px-5 py-3.5 font-mono text-sm font-semibold text-blue-600 dark:text-blue-400">
                      {l.licenseId}
                    </td>
                    <td className="px-4 py-3.5">
                      <p className="font-medium text-slate-800 dark:text-slate-100">{l.name}</p>
                      <p className="text-xs text-slate-400 dark:text-slate-500">{l.licenseType}</p>
                    </td>
                    <td className="px-4 py-3.5 text-slate-600 dark:text-slate-300">{l.vendor}</td>
                    <td className="px-4 py-3.5">
                      <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold", categoryMeta.chip)}>
                        <CategoryIcon className="h-3.5 w-3.5" />
                        {l.category}
                      </span>
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-20 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                          <div
                            className={cn(
                              "h-full rounded-full",
                              pct >= 100 ? "bg-red-500" : pct >= 80 ? "bg-amber-500" : "bg-blue-500"
                            )}
                            style={{ width: `${Math.min(100, pct)}%` }}
                          />
                        </div>
                        <span className="text-xs text-slate-500 dark:text-slate-400">
                          {l.seatsUsed}/{l.totalSeats}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex flex-col gap-1">
                        <span className={cn("inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold", statusMeta.chip)}>
                          <StatusIcon className="h-3.5 w-3.5" />
                          {status}
                        </span>
                        <span className="text-xs text-slate-400 dark:text-slate-500">
                          {l.expiryDate ? formatDate(l.expiryDate) : "No expiry"}
                          {expiry !== null && expiry >= 0 && status !== "Active" ? ` · ${expiry}d` : ""}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <p className="font-semibold text-slate-800 dark:text-slate-100">₹{l.cost.toLocaleString("en-IN")}</p>
                      <p className="text-xs text-slate-400 dark:text-slate-500">{typeMeta.costSuffix}</p>
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            setViewId(l.id);
                          }}
                          title="View details"
                          aria-label="View details"
                          className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-blue-50 hover:text-blue-600 dark:hover:bg-blue-500/10 dark:hover:text-blue-400"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                        {canChange && (
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              openEditModal(l);
                            }}
                            title="Edit license"
                            aria-label="Edit license"
                            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-300"
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

        {pageItems.length === 0 && (
          <div className="py-12 text-center text-sm text-slate-400 dark:text-slate-500">
            No licenses match your search or filters.
          </div>
        )}

        <div className="flex flex-col items-center justify-between gap-3 border-t border-slate-100 p-4 text-sm dark:border-slate-800 sm:flex-row">
          <p className="text-slate-500 dark:text-slate-400">
            Showing {pageItems.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1}–
            {Math.min(currentPage * PAGE_SIZE, filtered.length)} of {filtered.length} licenses
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
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-slate-900/40 p-4">
          <button aria-label="Close" className="absolute inset-0 cursor-default" onClick={closeFormModal} />
          <div className="relative max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl dark:bg-slate-900">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                  {formMode === "edit" ? "Edit License" : "Add License"}
                </h2>
                {formMode === "edit" && (
                  <p className="text-xs text-slate-400 dark:text-slate-500">
                    {licenses.find((l) => l.id === editingId)?.licenseId}
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
                <label className={labelClass}>
                  Software Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Microsoft 365 E3"
                  className={inputClass}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>Vendor</label>
                  <select
                    value={form.vendor}
                    onChange={(e) => setForm((f) => ({ ...f, vendor: e.target.value }))}
                    className={inputClass}
                  >
                    <option value="" disabled>
                      Select Vendor
                    </option>
                    {!vendors.some((v) => v.name === form.vendor) && form.vendor && (
                      <option value={form.vendor}>{form.vendor}</option>
                    )}
                    {vendors.map((v) => (
                      <option key={v.id} value={v.name}>
                        {v.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelClass}>
                    Category <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={form.category}
                    onChange={(e) => setForm((f) => ({ ...f, category: e.target.value as LicenseCategory }))}
                    className={inputClass}
                  >
                    {LICENSE_CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>
                    License Type <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={form.licenseType}
                    onChange={(e) => setForm((f) => ({ ...f, licenseType: e.target.value as LicenseType }))}
                    className={inputClass}
                  >
                    {LICENSE_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelClass}>
                    License Key
                    <OptionalTag />
                  </label>
                  <input
                    type="text"
                    value={form.licenseKey}
                    onChange={(e) => setForm((f) => ({ ...f, licenseKey: e.target.value }))}
                    placeholder="Auto-generated if left blank"
                    className={cn(inputClass, "font-mono")}
                  />
                </div>
              </div>

              <SectionDivider label="Seats" />

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className={labelClass}>
                    Total Seats <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={form.totalSeats}
                    onChange={(e) => setForm((f) => ({ ...f, totalSeats: e.target.value }))}
                    placeholder="e.g. 60"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>
                    Seats Used
                    <OptionalTag />
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={form.seatsUsed}
                    onChange={(e) => setForm((f) => ({ ...f, seatsUsed: e.target.value }))}
                    placeholder="Defaults to 0"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Available Seats</label>
                  <input
                    type="number"
                    value={
                      form.totalSeats.trim() === ""
                        ? ""
                        : Math.max(0, Number(form.totalSeats || 0) - Number(form.seatsUsed || 0))
                    }
                    disabled
                    placeholder="Auto-calculated"
                    className={cn(inputClass, "cursor-not-allowed opacity-60")}
                  />
                </div>
              </div>

              <SectionDivider label="Billing" />

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>
                    Cost (₹) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={form.cost}
                    onChange={(e) => setForm((f) => ({ ...f, cost: e.target.value }))}
                    placeholder="e.g. 180000"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Purchase Date</label>
                  <input
                    type="date"
                    value={form.purchaseDate}
                    onChange={(e) => setForm((f) => ({ ...f, purchaseDate: e.target.value }))}
                    className={inputClass}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>
                    Expiry Date
                    {form.licenseType === "Perpetual" && <OptionalTag />}
                    {form.licenseType !== "Perpetual" && <span className="text-red-500"> *</span>}
                  </label>
                  <input
                    type="date"
                    value={form.expiryDate}
                    disabled={form.licenseType === "Perpetual"}
                    onChange={(e) => setForm((f) => ({ ...f, expiryDate: e.target.value }))}
                    className={cn(inputClass, form.licenseType === "Perpetual" && "cursor-not-allowed opacity-50")}
                  />
                </div>
                <div className="flex items-end pb-2">
                  <label
                    className={cn(
                      "flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300",
                      form.licenseType === "Perpetual" && "cursor-not-allowed opacity-50"
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={form.autoRenew}
                      disabled={form.licenseType === "Perpetual"}
                      onChange={(e) => setForm((f) => ({ ...f, autoRenew: e.target.checked }))}
                      className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 dark:border-slate-700"
                    />
                    Auto-renew
                  </label>
                </div>
              </div>

              <div>
                <label className={labelClass}>
                  Notes
                  <OptionalTag />
                </label>
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  rows={2}
                  placeholder="Optional notes about this license"
                  className={cn(inputClass, "resize-none")}
                />
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
                  {submitting ? "Saving…" : formMode === "edit" ? "Save Changes" : "Add License"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {viewLicense && (
        <SoftwareLicenseDetailModal
          license={viewLicense}
          onClose={() => setViewId(null)}
          onEdit={(license) => {
            setViewId(null);
            openEditModal(license);
          }}
          onDelete={handleDelete}
          onAssignSeat={handleAssignSeat}
          onReleaseSeat={handleReleaseSeat}
          onRenew={handleRenew}
        />
      )}
    </div>
  );
}
