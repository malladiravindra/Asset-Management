"use client";

import { useMemo, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  Loader2,
  Pencil,
  Plus,
  Search,
  SlidersHorizontal,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { useCan } from "@/components/auth/context";
import { useAssets } from "@/components/assets/context";
import { useAuditLog } from "@/components/audit-logs/context";
import { useDepartments } from "@/components/departments/context";
import { useCategories } from "@/components/categories/context";
import { useLocations } from "@/components/locations/context";
import { useRuntimeSettings } from "@/components/settings/runtime";
import {
  CONDITION_STYLES,
  STATUS_BREAKDOWN,
  WARRANTY_STYLES,
  statusChip,
  type Asset,
  type StatusLabel,
} from "@/components/assets/data";
import { AssetDetailModal } from "@/components/assets/detail-modal";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { ApiError, apiDownload, apiUpload } from "@/lib/api";
import { toDateOnly } from "@/lib/dates";

const PAGE_SIZE = 10;

const CONDITIONS: Asset["condition"][] = ["Good", "Fair", "Poor"];
const WARRANTIES: Asset["warranty"][] = ["Active", "Expiring", "Expired"];

const SERIAL_PATTERN = /^[A-Z]{2}\d{6,10}$/;

const emptyForm = {
  name: "",
  category: "",
  serial: "",
  department: "",
  location: "",
  status: "Available" as StatusLabel,
  assignedTo: "",
  condition: "Good" as Asset["condition"],
  warranty: "Active" as Asset["warranty"],
  warrantyStart: "", // 'YYYY-MM-DD'
  warrantyEnd: "", // 'YYYY-MM-DD' — when set, the backend derives the warranty status
  warrantyProvider: "",
  cost: "",
};

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

type ImportSummary = {
  created: number;
  updated: number;
  failed: number;
  errors: { row: number; reason: string }[];
  total: number;
  ignored_columns?: string[];
};

export function AssetsTable() {
  const router = useRouter();
  const { assets, loading, getAsset, refreshAssets, createAsset, updateAsset, deleteAsset: deleteAssetApi } = useAssets();
  // Only to refresh the log if it is already loaded — never loads it here.
  const { refresh: refreshAuditLog } = useAuditLog({ load: false });
  const { departments } = useDepartments();
  const { categories } = useCategories();
  const { locations } = useLocations();
  const { values: runtimeSettings } = useRuntimeSettings();
  const { showSuccess, showErrorFromException } = useToast();
  const canAdd = useCan("assets.add_asset");
  const canChange = useCan("assets.change_asset");
  const canDelete = useCan("assets.delete_asset");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusLabel | "All">("All");
  const [page, setPage] = useState(1);
  const [formMode, setFormMode] = useState<"add" | "edit" | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [viewAsset, setViewAsset] = useState<Asset | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  // Export state
  const [exporting, setExporting] = useState(false);

  // Import state
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [importSummary, setImportSummary] = useState<ImportSummary | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Live status counts calculated from backend response
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {
      All: assets.length,
      Assigned: 0,
      Available: 0,
      "In Repair": 0,
      Reserved: 0,
      Maintenance: 0,
    };
    for (const a of assets) {
      if (counts[a.status] !== undefined) {
        counts[a.status]++;
      }
    }
    return counts;
  }, [assets]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return assets.filter((a) => {
      const matchesStatus = statusFilter === "All" || a.status === statusFilter;
      const matchesQuery =
        !q ||
        a.tag.toLowerCase().includes(q) ||
        a.name.toLowerCase().includes(q) ||
        a.department.toLowerCase().includes(q) ||
        a.serial.toLowerCase().includes(q) ||
        (a.assignedTo?.toLowerCase().includes(q) ?? false);
      return matchesStatus && matchesQuery;
    });
  }, [assets, search, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageItems = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  function updateFilter(next: StatusLabel | "All") {
    setStatusFilter(next);
    setPage(1);
  }

  function updateSearch(value: string) {
    setSearch(value);
    setPage(1);
  }

  function openAddModal() {
    // Settings > Asset Management / Organization defaults; each falls back
    // to the previous built-in default when unset or not loaded.
    const defaultDepartment = departments.find((d) => d.id === runtimeSettings?.default_department)?.name;
    const defaultLocation = locations.find((l) => l.id === runtimeSettings?.default_location)?.name;
    setForm({
      ...emptyForm,
      status: (runtimeSettings?.default_asset_status as StatusLabel | undefined) ?? emptyForm.status,
      condition: (runtimeSettings?.default_asset_condition as Asset["condition"] | undefined) ?? emptyForm.condition,
      category: categories[0]?.name ?? "",
      department: defaultDepartment ?? departments[0]?.name ?? "",
      location: defaultLocation ?? locations[0]?.name ?? "",
    });
    setFieldErrors({});
    setFormError(null);
    setEditingId(null);
    setFormMode("add");
  }

  async function openEditModal(asset: Asset) {
    try {
      const fresh = await getAsset(asset.id);
      setForm({
        name: fresh.name,
        category: fresh.category,
        serial: fresh.serial,
        department: fresh.department,
        location: fresh.location,
        status: fresh.status,
        assignedTo: fresh.assignedTo ?? "",
        condition: fresh.condition,
        warranty: fresh.warranty,
        warrantyStart: fresh.warrantyStartDate ? toDateOnly(fresh.warrantyStartDate) : "",
        warrantyEnd: fresh.warrantyEndDate ? toDateOnly(fresh.warrantyEndDate) : "",
        warrantyProvider: fresh.warrantyProvider,
        cost: String(fresh.cost),
      });
      setFieldErrors({});
      setFormError(null);
      setEditingId(fresh.id);
      setFormMode("edit");
    } catch (error) {
      showErrorFromException(error, "Could not load asset details for editing.");
    }
  }

  async function openViewModal(asset: Asset) {
    try {
      const fresh = await getAsset(asset.id);
      setViewAsset(fresh);
    } catch (error) {
      showErrorFromException(error, "Could not load asset details.");
      setViewAsset(asset);
    }
  }

  // Reuses the real Assignments page/flow (POST /api/operations/assignments/
  // via AssignmentsContext.createAssignment) instead of duplicating that API
  // call here — this just navigates there with the asset preselected.
  // AssignmentsTable reads ?assetId= on mount and opens its existing "New
  // Assignment" modal preset with this asset when it's still Available.
  function handleAssign(asset: Asset) {
    setViewAsset(null);
    router.push(`/dashboard/assignments?assetId=${asset.id}`);
  }

  async function performDelete(id: number) {
    const asset = assets.find((a) => a.id === id);
    try {
      await deleteAssetApi(id);
      showSuccess(asset ? `Asset ${asset.tag} deleted.` : "Asset deleted.");
      void refreshAuditLog();
    } catch (error) {
      showErrorFromException(error, "Could not delete this asset.");
    }
  }

  async function handleDeleteFromRow(id: number) {
    await performDelete(id);
    setConfirmDeleteId(null);
  }

  async function handleDeleteFromDetail(id: number) {
    await performDelete(id);
    setViewAsset(null);
  }

  function closeFormModal() {
    setFormMode(null);
    setEditingId(null);
    setFieldErrors({});
    setFormError(null);
  }

  function closeImportModal() {
    setImportModalOpen(false);
    setImportFile(null);
    setImportSummary(null);
    setImportError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleExport() {
    setExporting(true);
    try {
      // Open download endpoint — no auth header required. apiDownload reads
      // the filename from the response's Content-Disposition header,
      // falling back to "assets_export.xlsx" if it's missing.
      await apiDownload("/assets/export/?format=xlsx", "assets_export.xlsx");
      showSuccess("Assets exported successfully.");
    } catch (error) {
      showErrorFromException(error, "Export failed. Please try again.");
    } finally {
      setExporting(false);
    }
  }

  async function handleImportSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!importFile) return;

    setImporting(true);
    setImportError(null);
    setImportSummary(null);

    try {
      const res = await apiUpload<ImportSummary>("/assets/import/", importFile);
      setImportSummary(res);
      await refreshAssets();
      void refreshAuditLog();
      if (res.failed === 0) {
        showSuccess(`Imported ${res.created + res.updated} asset(s) successfully.`);
      } else {
        showSuccess(`Import completed: ${res.created} created, ${res.updated} updated, ${res.failed} failed.`);
      }
    } catch (error) {
      showErrorFromException(error, "Import failed.");
      setImportError(error instanceof Error ? error.message : "Import failed.");
    } finally {
      setImporting(false);
    }
  }

  function downloadSampleCsv() {
    const header = "name,category,serial_number,department,location,cost,status,condition,warranty_status,assigned_to\n";
    const sampleRow = "Dell Latitude 5440,Laptops,DL123456789,Engineering,Headquarters,45000,Available,Good,Active,Rohit Verma\n";
    const blob = new Blob([header + sampleRow], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "assets_template.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function handleSubmitForm(e: React.FormEvent) {
    e.preventDefault();

    const errors: Record<string, string> = {};

    if (!form.name.trim()) {
      errors.name = "Asset name is required.";
    }

    const serialNormalized = form.serial.trim().toUpperCase();
    if (!serialNormalized) {
      errors.serial = "Serial number is required.";
    } else if (!SERIAL_PATTERN.test(serialNormalized)) {
      errors.serial = "Format: 2 uppercase letters + 6-10 digits (e.g. DL123456789).";
    }

    if (!form.category.trim()) {
      errors.category = "Category is required.";
    }

    if (!form.department.trim()) {
      errors.department = "Department is required.";
    }

    if (!form.location.trim()) {
      errors.location = "Location is required.";
    }

    if (!form.status) {
      errors.status = "Status is required.";
    }

    if (!form.condition) {
      errors.condition = "Condition is required.";
    }

    if (!form.warranty && !form.warrantyEnd) {
      errors.warranty = "Warranty is required.";
    }
    if (form.warrantyStart && form.warrantyEnd && form.warrantyEnd < form.warrantyStart) {
      errors.warrantyEnd = "Warranty end date can't be before the start date.";
    }

    const cost = Number(form.cost);
    if (!form.cost || Number.isNaN(cost) || cost <= 0) {
      errors.cost = "Cost must be a positive number.";
    }

    const category = categories.find((c) => c.name === form.category);
    const department = departments.find((d) => d.name === form.department);
    const location = locations.find((l) => l.name === form.location);

    if (!category && !errors.category) {
      errors.category = "Please select a valid category.";
    }
    if (!department && !errors.department) {
      errors.department = "Please select a valid department.";
    }
    if (!location && !errors.location) {
      errors.location = "Please select a valid location.";
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      setFormError("Please fix the required fields marked below.");
      return;
    }

    const assignedTo = form.status === "Assigned" ? form.assignedTo.trim() : "";
    const input = {
      name: form.name.trim(),
      categoryId: category!.id,
      departmentId: department!.id,
      locationId: location!.id,
      serialNumber: serialNormalized,
      assignedTo,
      status: form.status,
      condition: form.condition,
      warrantyStatus: form.warranty,
      warrantyStartDate: form.warrantyStart || null,
      warrantyEndDate: form.warrantyEnd || null,
      warrantyProvider: form.warrantyProvider.trim(),
      cost,
    };

    setSubmitting(true);
    setFieldErrors({});
    setFormError(null);

    try {
      if (formMode === "edit" && editingId !== null) {
        const updated = await updateAsset(editingId, input);
        showSuccess(`Asset "${updated.name}" (${updated.tag}) updated.`);
      } else {
        const created = await createAsset(input);
        showSuccess(`Asset ${created.tag} registered successfully.`);
        setStatusFilter("All");
        setSearch("");
        setPage(1);
      }
      void refreshAuditLog();
      closeFormModal();
    } catch (error) {
      if (error instanceof ApiError && error.status === 400 && typeof error.details === "object" && error.details !== null) {
        const backendErrors = error.details as Record<string, unknown>;
        const mapped: Record<string, string> = {};
        for (const [key, val] of Object.entries(backendErrors)) {
          const msg = Array.isArray(val) ? val.join(" ") : String(val);
          if (key === "serial_number") mapped.serial = msg;
          else if (key === "category") mapped.category = msg;
          else if (key === "department") mapped.department = msg;
          else if (key === "location") mapped.location = msg;
          else if (key === "status") mapped.status = msg;
          else if (key === "condition") mapped.condition = msg;
          else if (key === "warranty_status") mapped.warranty = msg;
          else if (key === "warranty_start_date") mapped.warrantyStart = msg;
          else if (key === "warranty_end_date") mapped.warrantyEnd = msg;
          else if (key === "warranty_provider") mapped.warrantyProvider = msg;
          else if (key === "cost") mapped.cost = msg;
          else if (key === "name") mapped.name = msg;
          else if (key === "assigned_to") mapped.assignedTo = msg;
          else mapped[key] = msg;
        }
        setFieldErrors(mapped);
        const topError = mapped.non_field_errors || mapped.detail || "Please fix the validation errors below.";
        setFormError(topError);
        showErrorFromException(error, topError);
      } else {
        const msg = error instanceof Error ? error.message : "Could not save this asset.";
        setFormError(msg);
        showErrorFromException(error, msg);
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center animate-slide-in-left">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Asset Inventory</h1>
          <p className="mt-1 flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
            <span className="inline-flex items-center rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-blue-600 dark:bg-blue-500/10 dark:text-blue-400">
              {assets.length} Total
            </span>
            <span>across {categories.length} categories</span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canAdd && (
            <button
              type="button"
              onClick={() => {
                setImportSummary(null);
                setImportError(null);
                setImportFile(null);
                if (fileInputRef.current) fileInputRef.current.value = "";
                setImportModalOpen(true);
              }}
              className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <Upload className="h-4 w-4" />
              Import
            </button>
          )}

          <button
            type="button"
            onClick={() => void handleExport()}
            disabled={exporting}
            className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-60 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            {exporting ? (
              <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            <span>Export</span>
          </button>

          {canAdd && (
            <button
              type="button"
              onClick={openAddModal}
              className="flex items-center gap-2 rounded-lg bg-blue-600 px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
            >
              <Plus className="h-4 w-4" />
              Add Asset
            </button>
          )}
        </div>
      </div>

      <div
        className="rounded-2xl border border-slate-200 bg-white shadow-sm shadow-slate-900/[0.02] dark:border-slate-800 dark:bg-slate-900 animate-slide-in-left"
        style={{ animationDelay: "120ms" }}
      >
      <div className="flex flex-col gap-3 border-b border-slate-100 p-4 dark:border-slate-800 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => updateSearch(e.target.value)}
            placeholder="Search assets, tags, serials, employees..."
            className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-500/20 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-100"
          />
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => updateFilter("All")}
            className={cn(
              "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition",
              statusFilter === "All"
                ? "bg-blue-600 text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
            )}
          >
            <span>All</span>
            <span
              className={cn(
                "rounded-full px-1.5 py-0.5 text-xs font-semibold",
                statusFilter === "All"
                  ? "bg-blue-500 text-white"
                  : "bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200"
              )}
            >
              {statusCounts.All}
            </span>
          </button>
          {STATUS_BREAKDOWN.map((s) => (
            <button
              key={s.label}
              type="button"
              onClick={() => updateFilter(s.label)}
              className={cn(
                "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition",
                statusFilter === s.label
                  ? "bg-blue-600 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
              )}
            >
              <span>{s.label}</span>
              <span
                className={cn(
                  "rounded-full px-1.5 py-0.5 text-xs font-semibold",
                  statusFilter === s.label
                    ? "bg-blue-500 text-white"
                    : "bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200"
                )}
              >
                {statusCounts[s.label] ?? 0}
              </span>
            </button>
          ))}
          <button
            type="button"
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition hover:bg-slate-50 dark:border-slate-800 dark:text-slate-400 dark:hover:bg-slate-800"
            aria-label="More filters"
          >
            <SlidersHorizontal className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[1100px] text-left text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-xs uppercase tracking-wider text-slate-400 dark:border-slate-800 dark:text-slate-500">
              <th className="py-3 pl-4 font-semibold">Asset</th>
              <th className="py-3 pr-4 font-semibold">Serial</th>
              <th className="py-3 pr-4 font-semibold">Department</th>
              <th className="py-3 pr-4 font-semibold">Location</th>
              <th className="py-3 pr-4 font-semibold">Assigned To</th>
              <th className="py-3 pr-4 font-semibold">Status</th>
              <th className="py-3 pr-4 font-semibold">Condition</th>
              <th className="py-3 pr-4 text-right font-semibold">Cost</th>
              <th className="py-3 pr-4 font-semibold">Warranty</th>
              <th className="w-10 py-3 pr-4" />
            </tr>
          </thead>
          <tbody>
            {pageItems.map((a) => (
              <tr
                key={a.id}
                onClick={() => openViewModal(a)}
                className="cursor-pointer border-b border-slate-50 transition hover:bg-slate-50 dark:border-slate-800/60 dark:hover:bg-slate-800/40"
              >
                <td className="py-3 pl-4 pr-4">
                  <p className="font-semibold text-blue-600 dark:text-blue-400">{a.tag}</p>
                  <p className="font-medium text-slate-800 dark:text-slate-100">{a.name}</p>
                  <p className="text-xs text-slate-400 dark:text-slate-500">{a.category}</p>
                </td>
                <td className="py-3 pr-4 font-mono text-xs text-slate-500 dark:text-slate-400">
                  {a.serial}
                </td>
                <td className="py-3 pr-4 text-slate-600 dark:text-slate-300">{a.department}</td>
                <td className="py-3 pr-4 text-slate-600 dark:text-slate-300">{a.location}</td>
                <td className="py-3 pr-4">
                  {a.assignedTo ? (
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold",
                          avatarTone(a.assignedTo)
                        )}
                      >
                        {initials(a.assignedTo)}
                      </span>
                      <span className="whitespace-nowrap text-slate-700 dark:text-slate-200">
                        {a.assignedTo}
                      </span>
                    </div>
                  ) : (
                    <span className="text-slate-400 dark:text-slate-500">Unassigned</span>
                  )}
                </td>
                <td className="py-3 pr-4">
                  <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold", statusChip(a.status))}>
                    <span className="h-1.5 w-1.5 rounded-full bg-current" />
                    {a.status}
                  </span>
                </td>
                <td className="py-3 pr-4">
                  <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold", CONDITION_STYLES[a.condition])}>
                    <span className="h-1.5 w-1.5 rounded-full bg-current" />
                    {a.condition}
                  </span>
                </td>
                <td className="py-3 pr-4 text-right font-medium text-slate-800 dark:text-slate-100">
                  ₹{a.cost.toLocaleString("en-IN")}
                </td>
                <td className="py-3 pr-4">
                  <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold", WARRANTY_STYLES[a.warranty])}>
                    <span className="h-1.5 w-1.5 rounded-full bg-current" />
                    {a.warranty}
                  </span>
                </td>
                <td className="py-3 pr-4">
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        openViewModal(a);
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
                          openEditModal(a);
                        }}
                        title="Edit asset"
                        aria-label="Edit asset"
                        className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-300"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    )}
                    {canDelete && (
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          setConfirmDeleteId(a.id);
                        }}
                        title="Delete asset"
                        aria-label="Delete asset"
                        className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 transition hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10 dark:hover:text-red-400"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {pageItems.length === 0 && (
              <tr>
                <td colSpan={10} className="py-12 text-center text-sm text-slate-400">
                  No assets match your search or filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-col items-center justify-between gap-3 border-t border-slate-100 p-4 text-sm dark:border-slate-800 sm:flex-row">
        <p className="text-slate-500 dark:text-slate-400">
          Showing {pageItems.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1}–
          {Math.min(currentPage * PAGE_SIZE, filtered.length)} of {filtered.length} assets
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
          <button
            aria-label="Close"
            className="absolute inset-0 cursor-default"
            onClick={closeFormModal}
          />
          <div className="relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl dark:bg-slate-900">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                  {formMode === "edit" ? "Edit Asset" : "Add Asset"}
                </h2>
                {formMode === "edit" && (
                  <p className="text-xs text-slate-400 dark:text-slate-500">
                    {assets.find((a) => a.id === editingId)?.tag}
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
                  Asset name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => {
                    setForm((f) => ({ ...f, name: e.target.value }));
                    setFieldErrors((prev) => ({ ...prev, name: "" }));
                  }}
                  placeholder="e.g. Dell Latitude 5440"
                  className={cn(
                    "w-full rounded-lg border bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition focus:ring-2 dark:bg-slate-800 dark:text-slate-100",
                    fieldErrors.name
                      ? "border-red-300 focus:border-red-500 focus:ring-red-500/20 dark:border-red-500/40"
                      : "border-slate-200 focus:border-blue-500 focus:ring-blue-500/20 dark:border-slate-800"
                  )}
                />
                {fieldErrors.name && (
                  <p className="mt-1.5 text-xs font-medium text-red-600 dark:text-red-400">{fieldErrors.name}</p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
                    Category <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={form.category}
                    onChange={(e) => {
                      setForm((f) => ({ ...f, category: e.target.value }));
                      setFieldErrors((prev) => ({ ...prev, category: "" }));
                    }}
                    className={cn(
                      "w-full rounded-lg border bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:ring-2 dark:bg-slate-800 dark:text-slate-100",
                      fieldErrors.category
                        ? "border-red-300 focus:border-red-500 focus:ring-red-500/20 dark:border-red-500/40"
                        : "border-slate-200 focus:border-blue-500 focus:ring-blue-500/20 dark:border-slate-800"
                    )}
                  >
                    {categories.map((c) => (
                      <option key={c.id} value={c.name}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  {fieldErrors.category && (
                    <p className="mt-1.5 text-xs font-medium text-red-600 dark:text-red-400">{fieldErrors.category}</p>
                  )}
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
                    Serial number <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={form.serial}
                    onChange={(e) => {
                      setForm((f) => ({ ...f, serial: e.target.value }));
                      setFieldErrors((prev) => ({ ...prev, serial: "" }));
                    }}
                    placeholder="e.g. DL123456789"
                    className={cn(
                      "w-full rounded-lg border bg-white px-3 py-2 font-mono text-sm text-slate-900 placeholder:text-slate-400 outline-none transition focus:ring-2 dark:bg-slate-800 dark:text-slate-100",
                      fieldErrors.serial
                        ? "border-red-300 focus:border-red-500 focus:ring-red-500/20 dark:border-red-500/40"
                        : "border-slate-200 focus:border-blue-500 focus:ring-blue-500/20 dark:border-slate-800"
                    )}
                  />
                  {fieldErrors.serial && (
                    <p className="mt-1.5 text-xs font-medium text-red-600 dark:text-red-400">{fieldErrors.serial}</p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
                    Department <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={form.department}
                    onChange={(e) => {
                      setForm((f) => ({ ...f, department: e.target.value }));
                      setFieldErrors((prev) => ({ ...prev, department: "" }));
                    }}
                    className={cn(
                      "w-full rounded-lg border bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:ring-2 dark:bg-slate-800 dark:text-slate-100",
                      fieldErrors.department
                        ? "border-red-300 focus:border-red-500 focus:ring-red-500/20 dark:border-red-500/40"
                        : "border-slate-200 focus:border-blue-500 focus:ring-blue-500/20 dark:border-slate-800"
                    )}
                  >
                    {departments.map((d) => (
                      <option key={d.id} value={d.name}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                  {fieldErrors.department && (
                    <p className="mt-1.5 text-xs font-medium text-red-600 dark:text-red-400">{fieldErrors.department}</p>
                  )}
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
                    Location <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={form.location}
                    onChange={(e) => {
                      setForm((f) => ({ ...f, location: e.target.value }));
                      setFieldErrors((prev) => ({ ...prev, location: "" }));
                    }}
                    className={cn(
                      "w-full rounded-lg border bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:ring-2 dark:bg-slate-800 dark:text-slate-100",
                      fieldErrors.location
                        ? "border-red-300 focus:border-red-500 focus:ring-red-500/20 dark:border-red-500/40"
                        : "border-slate-200 focus:border-blue-500 focus:ring-blue-500/20 dark:border-slate-800"
                    )}
                  >
                    {locations.map((l) => (
                      <option key={l.id} value={l.name}>
                        {l.name}
                      </option>
                    ))}
                  </select>
                  {fieldErrors.location && (
                    <p className="mt-1.5 text-xs font-medium text-red-600 dark:text-red-400">{fieldErrors.location}</p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
                    Status <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={form.status}
                    onChange={(e) => {
                      setForm((f) => ({ ...f, status: e.target.value as StatusLabel }));
                      setFieldErrors((prev) => ({ ...prev, status: "" }));
                    }}
                    className={cn(
                      "w-full rounded-lg border bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:ring-2 dark:bg-slate-800 dark:text-slate-100",
                      fieldErrors.status
                        ? "border-red-300 focus:border-red-500 focus:ring-red-500/20 dark:border-red-500/40"
                        : "border-slate-200 focus:border-blue-500 focus:ring-blue-500/20 dark:border-slate-800"
                    )}
                  >
                    {STATUS_BREAKDOWN.map((s) => (
                      <option key={s.label} value={s.label}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                  {fieldErrors.status && (
                    <p className="mt-1.5 text-xs font-medium text-red-600 dark:text-red-400">{fieldErrors.status}</p>
                  )}
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
                    Assigned to
                  </label>
                  <input
                    type="text"
                    value={form.assignedTo}
                    onChange={(e) => setForm((f) => ({ ...f, assignedTo: e.target.value }))}
                    placeholder="Employee name"
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-100"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
                    Condition
                  </label>
                  <select
                    value={form.condition}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, condition: e.target.value as Asset["condition"] }))
                    }
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-100"
                  >
                    {CONDITIONS.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
                    Warranty
                  </label>
                  <select
                    value={form.warranty}
                    // With an end date on file the backend derives the status from it.
                    disabled={Boolean(form.warrantyEnd)}
                    title={form.warrantyEnd ? "Set automatically from the warranty end date" : undefined}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, warranty: e.target.value as Asset["warranty"] }))
                    }
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-100"
                  >
                    {WARRANTIES.map((w) => (
                      <option key={w} value={w}>
                        {w}
                      </option>
                    ))}
                  </select>
                  {fieldErrors.warranty && <p className="mt-1.5 text-xs font-medium text-red-600 dark:text-red-400">{fieldErrors.warranty}</p>}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
                    Warranty start
                  </label>
                  <input
                    type="date"
                    value={form.warrantyStart}
                    onChange={(e) => setForm((f) => ({ ...f, warrantyStart: e.target.value }))}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-100"
                  />
                  {fieldErrors.warrantyStart && <p className="mt-1.5 text-xs font-medium text-red-600 dark:text-red-400">{fieldErrors.warrantyStart}</p>}
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
                    Warranty end
                  </label>
                  <input
                    type="date"
                    value={form.warrantyEnd}
                    min={form.warrantyStart || undefined}
                    onChange={(e) => setForm((f) => ({ ...f, warrantyEnd: e.target.value }))}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-100"
                  />
                  {fieldErrors.warrantyEnd && <p className="mt-1.5 text-xs font-medium text-red-600 dark:text-red-400">{fieldErrors.warrantyEnd}</p>}
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
                  Warranty provider
                </label>
                <input
                  type="text"
                  value={form.warrantyProvider}
                  onChange={(e) => setForm((f) => ({ ...f, warrantyProvider: e.target.value }))}
                  placeholder="e.g. Dell ProSupport"
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-100"
                />
                {fieldErrors.warrantyProvider && <p className="mt-1.5 text-xs font-medium text-red-600 dark:text-red-400">{fieldErrors.warrantyProvider}</p>}
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
                  Purchase cost (₹)
                </label>
                <input
                  type="number"
                  min="0"
                  value={form.cost}
                  onChange={(e) => setForm((f) => ({ ...f, cost: e.target.value }))}
                  placeholder="45000"
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-100"
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
                  {submitting ? "Saving…" : formMode === "edit" ? "Save Changes" : "Add Asset"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {importModalOpen && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-slate-900/40 p-4">
          <button
            aria-label="Close"
            className="absolute inset-0 cursor-default"
            onClick={closeImportModal}
          />
          <div className="relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl dark:bg-slate-900">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Import Assets</h2>
              <button
                type="button"
                onClick={closeImportModal}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
              Upload a CSV or Excel (.xlsx) file to bulk create or update assets. An existing
              asset is matched by its asset code or serial number.
            </p>

            <button
              type="button"
              onClick={downloadSampleCsv}
              className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 transition hover:underline dark:text-blue-400"
            >
              <Download className="h-3.5 w-3.5" />
              Download sample CSV template
            </button>

            <form onSubmit={handleImportSubmit} className="mt-4 space-y-4">
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.xlsx,.xls"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0] ?? null;
                  setImportFile(file);
                  setImportError(null);
                  setImportSummary(null);
                }}
              />

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center transition hover:border-blue-400 hover:bg-blue-50/40 dark:border-slate-700 dark:bg-slate-800/40 dark:hover:border-blue-500/60"
              >
                <Upload className="h-6 w-6 text-slate-400" />
                {importFile ? (
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
                    {importFile.name}
                  </span>
                ) : (
                  <>
                    <span className="text-sm font-medium text-slate-600 dark:text-slate-300">
                      Click to choose a file
                    </span>
                    <span className="text-xs text-slate-400 dark:text-slate-500">
                      CSV or Excel (.xlsx)
                    </span>
                  </>
                )}
              </button>

              {importError && (
                <p className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-500/10 dark:text-red-400">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{importError}</span>
                </p>
              )}

              {importSummary && (
                <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm dark:border-slate-800 dark:bg-slate-800/40">
                  <div className="flex items-center gap-2 font-medium text-slate-700 dark:text-slate-200">
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                    <span>
                      {importSummary.created} created · {importSummary.updated} updated ·{" "}
                      {importSummary.failed} failed (of {importSummary.total})
                    </span>
                  </div>
                  {importSummary.ignored_columns && importSummary.ignored_columns.length > 0 && (
                    <p className="text-xs text-slate-400 dark:text-slate-500">
                      Ignored column(s): {importSummary.ignored_columns.join(", ")}
                    </p>
                  )}
                  {importSummary.errors.length > 0 && (
                    <ul className="max-h-40 space-y-1 overflow-y-auto text-xs text-red-600 dark:text-red-400">
                      {importSummary.errors.map((err) => (
                        <li key={err.row}>
                          Row {err.row}: {err.reason}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={closeImportModal}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  Close
                </button>
                <button
                  type="submit"
                  disabled={!importFile || importing}
                  className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {importing && <Loader2 className="h-4 w-4 animate-spin" />}
                  {importing ? "Importing…" : "Import"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {viewAsset && (
        <AssetDetailModal
          asset={viewAsset}
          onClose={() => setViewAsset(null)}
          onEdit={(asset) => {
            setViewAsset(null);
            openEditModal(asset);
          }}
          onAssign={handleAssign}
          onDelete={handleDeleteFromDetail}
        />
      )}

      {confirmDeleteId !== null && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-slate-900/40 p-4">
          <button
            aria-label="Close"
            className="absolute inset-0 cursor-default"
            onClick={() => setConfirmDeleteId(null)}
          />
          <div className="relative w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl dark:bg-slate-900">
            <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400">
              <Trash2 className="h-5 w-5" />
            </div>
            <h2 className="mt-4 text-center text-lg font-semibold text-slate-900 dark:text-white">
              Delete this asset?
            </h2>
            <p className="mt-1.5 text-center text-sm text-slate-500 dark:text-slate-400">
              {(() => {
                const target = assets.find((a) => a.id === confirmDeleteId);
                return target
                  ? `"${target.name}" (${target.tag}) will be permanently removed. This can't be undone.`
                  : "This asset will be permanently removed. This can't be undone.";
              })()}
            </p>
            <div className="mt-6 flex justify-center gap-2">
              <button
                type="button"
                onClick={() => setConfirmDeleteId(null)}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  if (confirmDeleteId !== null) void handleDeleteFromRow(confirmDeleteId);
                }}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-red-700"
              >
                Delete Asset
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
