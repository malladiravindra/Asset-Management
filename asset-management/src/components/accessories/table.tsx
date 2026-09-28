"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  Boxes,
  ChevronLeft,
  ChevronRight,
  Eye,
  IndianRupee,
  Layers,
  Pencil,
  Plus,
  Search,
  Tag,
  UserPlus,
  X,
} from "lucide-react";
import { useCan } from "@/components/auth/context";
import { AssignAccessoryModal } from "@/components/accessories/assign-modal";
import { useAccessories, type AccessoryInput } from "@/components/accessories/context";
import { useBrands } from "@/components/brands/context";
import { useCategories } from "@/components/categories/context";
import { CATEGORY_COLORS, colorFor, iconFor } from "@/components/categories/data";
import { useLocations } from "@/components/locations/context";
import {
  ACCESSORY_CONDITIONS,
  ACCESSORY_STATUSES,
  STOCK_STATUS_META,
  availableQty,
  stockStatus,
  stockValue,
  type Accessory,
  type AccessoryCondition,
  type AccessoryItemStatus,
  type StockStatus,
} from "@/components/accessories/data";
import { AccessoryDetailModal } from "@/components/accessories/detail-modal";
import { TODAY } from "@/components/assets/data";
import { useVendors } from "@/components/vendors/context";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 10;
const STOCK_STATUSES: StockStatus[] = ["In Stock", "Low Stock", "Out of Stock"];

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
  category: "",
  brand: "",
  model: "",
  sku: "",
  description: "",
  totalQty: "",
  availableQty: "",
  reorderThreshold: "5",
  reorderQty: "10",
  unitCost: "",
  vendor: "",
  purchaseDate: toInputDate(TODAY),
  purchaseOrder: "",
  warrantyExpiry: "",
  location: "",
  storageLocation: "",
  condition: ACCESSORY_CONDITIONS[0] as AccessoryCondition,
  itemStatus: ACCESSORY_STATUSES[0] as AccessoryItemStatus,
};

function accessoryToInput(a: Accessory, locationId: number | null): AccessoryInput {
  return {
    sku: a.sku,
    name: a.name,
    category: a.category,
    brand: a.brand,
    model: a.model,
    description: a.description,
    totalQty: a.totalQty,
    assignedQty: a.assignedQty,
    reorderThreshold: a.reorderThreshold,
    reorderQty: a.reorderQty,
    unitCost: a.unitCost,
    vendor: a.vendor,
    purchaseDate: a.purchaseDate,
    purchaseOrder: a.purchaseOrder,
    warrantyExpiry: a.warrantyExpiry,
    locationId,
    storageLocation: a.storageLocation,
    condition: a.condition,
    itemStatus: a.itemStatus,
    lastRestocked: a.lastRestocked,
  };
}

export function AccessoriesTable() {
  const { accessories, createAccessory, updateAccessory, deleteAccessory } = useAccessories();
  const { brands } = useBrands();
  const { categories } = useCategories();
  const { locations } = useLocations();
  const { vendors } = useVendors();
  const { showSuccess, showErrorFromException } = useToast();
  const canAdd = useCan("operation.add_accessory");
  const canChange = useCan("operation.change_accessory");
  const canAssign = useCan("operation.add_accessoryassignment");

  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string | "All">("All");
  const [statusFilter, setStatusFilter] = useState<StockStatus | "All">("All");
  const [page, setPage] = useState(1);
  const [viewId, setViewId] = useState<number | null>(null);
  const [formMode, setFormMode] = useState<"add" | "edit" | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [assignAccessoryId, setAssignAccessoryId] = useState<number | "any" | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return accessories.filter((a) => {
      const matchesCategory = categoryFilter === "All" || a.category === categoryFilter;
      const matchesStatus = statusFilter === "All" || stockStatus(a) === statusFilter;
      const matchesQuery =
        !q || a.sku.toLowerCase().includes(q) || a.name.toLowerCase().includes(q) || a.vendor.toLowerCase().includes(q);
      return matchesCategory && matchesStatus && matchesQuery;
    });
  }, [accessories, search, categoryFilter, statusFilter]);

  const categoryOptions = useMemo(
    () => Array.from(new Set(accessories.map((a) => a.category))).sort((a, b) => a.localeCompare(b)),
    [accessories]
  );

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageItems = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const totalUnits = accessories.reduce((sum, a) => sum + a.totalQty, 0);
  const totalAssigned = accessories.reduce((sum, a) => sum + a.assignedQty, 0);
  const needsAttention = accessories.filter((a) => stockStatus(a) !== "In Stock").length;
  const totalValue = accessories.reduce((sum, a) => sum + stockValue(a), 0);

  const viewAccessory = accessories.find((a) => a.id === viewId) ?? null;

  function updateSearch(value: string) {
    setSearch(value);
    setPage(1);
  }

  function updateCategoryFilter(next: string | "All") {
    setCategoryFilter(next);
    setPage(1);
  }

  function updateStatusFilter(next: StockStatus | "All") {
    setStatusFilter(next);
    setPage(1);
  }

  function openAddModal() {
    setForm({
      ...emptyForm,
      brand: brands[0]?.name ?? "",
      location: locations[0]?.name ?? "",
      vendor: vendors[0]?.name ?? "",
    });
    setFormError(null);
    setEditingId(null);
    setFormMode("add");
  }

  function categoryDisplayFor(name: string) {
    const match = categories.find((c) => c.name === name);
    if (match) return { Icon: iconFor(match.iconLabel), chip: colorFor(match.colorKey).chip };
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) % 1000;
    return { Icon: Tag, chip: CATEGORY_COLORS[hash % CATEGORY_COLORS.length].chip };
  }

  function openEditModal(accessory: Accessory) {
    setForm({
      name: accessory.name,
      category: accessory.category,
      brand: accessory.brand,
      model: accessory.model,
      sku: accessory.sku,
      description: accessory.description,
      totalQty: String(accessory.totalQty),
      availableQty: String(availableQty(accessory)),
      reorderThreshold: String(accessory.reorderThreshold),
      reorderQty: String(accessory.reorderQty),
      unitCost: String(accessory.unitCost),
      vendor: accessory.vendor,
      purchaseDate: toInputDate(accessory.purchaseDate),
      purchaseOrder: accessory.purchaseOrder,
      warrantyExpiry: toInputDate(accessory.warrantyExpiry),
      location: accessory.location,
      storageLocation: accessory.storageLocation,
      condition: accessory.condition,
      itemStatus: accessory.itemStatus,
    });
    setFormError(null);
    setEditingId(accessory.id);
    setFormMode("edit");
  }

  function closeFormModal() {
    setFormMode(null);
    setEditingId(null);
  }

  async function handleSubmitForm(e: React.FormEvent) {
    e.preventDefault();

    if (!form.name.trim()) {
      setFormError("Enter an accessory name.");
      return;
    }
    if (!form.category.trim()) {
      setFormError("Enter a category.");
      return;
    }
    const totalQty = Number(form.totalQty);
    if (!form.totalQty || Number.isNaN(totalQty) || totalQty <= 0) {
      setFormError("Enter a valid total quantity.");
      return;
    }
    const reorderThreshold = Number(form.reorderThreshold);
    if (form.reorderThreshold === "" || Number.isNaN(reorderThreshold) || reorderThreshold < 0) {
      setFormError("Enter a valid reorder threshold.");
      return;
    }
    const reorderQty = Number(form.reorderQty);
    if (form.reorderQty === "" || Number.isNaN(reorderQty) || reorderQty < 0) {
      setFormError("Enter a valid reorder quantity.");
      return;
    }
    const unitCost = Number(form.unitCost);
    if (!form.unitCost || Number.isNaN(unitCost) || unitCost < 0) {
      setFormError("Enter a valid unit cost.");
      return;
    }
    if (!form.vendor) {
      setFormError("Select a vendor.");
      return;
    }
    if (!form.location) {
      setFormError("Select a location.");
      return;
    }
    const matchedLocation = locations.find((l) => l.name === form.location);
    if (!matchedLocation) {
      setFormError("Select a valid location.");
      return;
    }

    let assignedQty: number | null = null;
    if (form.availableQty.trim() !== "") {
      const availableVal = Number(form.availableQty);
      if (Number.isNaN(availableVal) || availableVal < 0) {
        setFormError("Enter a valid available quantity.");
        return;
      }
      if (availableVal > totalQty) {
        setFormError("Available quantity can't exceed total quantity.");
        return;
      }
      assignedQty = totalQty - availableVal;
    }

    const purchaseDate = fromInputDate(form.purchaseDate);
    const warrantyExpiry = fromInputDate(form.warrantyExpiry);

    const existing = formMode === "edit" && editingId !== null ? accessories.find((a) => a.id === editingId) : null;
    const nextAssignedQty = assignedQty ?? existing?.assignedQty ?? 0;
    if (formMode === "edit" && totalQty < nextAssignedQty) {
      setFormError(`Total can't be less than the ${nextAssignedQty} units already assigned.`);
      return;
    }

    const input: AccessoryInput = {
      sku: form.sku.trim(),
      name: form.name.trim(),
      category: form.category.trim(),
      brand: form.brand.trim(),
      model: form.model.trim(),
      description: form.description.trim(),
      totalQty,
      assignedQty: nextAssignedQty,
      reorderThreshold,
      reorderQty,
      unitCost,
      vendor: form.vendor,
      purchaseDate,
      purchaseOrder: form.purchaseOrder.trim(),
      warrantyExpiry,
      locationId: matchedLocation.id,
      storageLocation: form.storageLocation.trim(),
      condition: form.condition,
      itemStatus: form.itemStatus,
      // No restock input yet: keep the stored value (null on create).
      lastRestocked: existing?.lastRestocked ?? null,
    };

    setSubmitting(true);
    setFormError(null);
    try {
      if (formMode === "edit" && editingId !== null) {
        await updateAccessory(editingId, input);
        showSuccess(`Accessory "${input.name}" updated.`);
      } else {
        await createAccessory(input);
        showSuccess(`Accessory "${input.name}" created.`);
        setCategoryFilter("All");
        setStatusFilter("All");
        setSearch("");
        setPage(1);
      }
      closeFormModal();
    } catch (error) {
      showErrorFromException(error);
      setFormError(error instanceof Error ? error.message : "Could not save this accessory.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleAssignOne(id: number) {
    const accessory = accessories.find((a) => a.id === id);
    if (!accessory || accessory.assignedQty >= accessory.totalQty) return;
    const locationId = locations.find((l) => l.name === accessory.location)?.id ?? null;
    try {
      await updateAccessory(id, { ...accessoryToInput(accessory, locationId), assignedQty: accessory.assignedQty + 1 });
    } catch (error) {
      showErrorFromException(error, "Could not assign this unit.");
    }
  }

  async function handleReturnOne(id: number) {
    const accessory = accessories.find((a) => a.id === id);
    if (!accessory || accessory.assignedQty <= 0) return;
    const locationId = locations.find((l) => l.name === accessory.location)?.id ?? null;
    try {
      await updateAccessory(id, { ...accessoryToInput(accessory, locationId), assignedQty: accessory.assignedQty - 1 });
    } catch (error) {
      showErrorFromException(error, "Could not return this unit.");
    }
  }

  async function handleDelete(id: number) {
    const accessory = accessories.find((a) => a.id === id);
    try {
      await deleteAccessory(id);
      showSuccess(accessory ? `Accessory "${accessory.name}" deleted.` : "Accessory deleted.");
    } catch (error) {
      showErrorFromException(error, "Could not delete this accessory.");
    } finally {
      setViewId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center animate-pop-in">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Accessories</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {accessories.length} SKUs · {needsAttention} need attention
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canAssign && (
            <button
              type="button"
              onClick={() => setAssignAccessoryId("any")}
              className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <UserPlus className="h-4 w-4" />
              Assign Accessory
            </button>
          )}
          {canAdd && (
            <button
              type="button"
              onClick={openAddModal}
              className="flex items-center gap-2 rounded-lg bg-blue-600 px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
            >
              <Plus className="h-4 w-4" />
              Add
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 animate-pop-in" style={{ animationDelay: "120ms" }}>
        <div className="cursor-pointer rounded-2xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-900/[0.02] transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md hover:shadow-slate-900/5 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400">
            <Layers className="h-5 w-5" />
          </span>
          <p className="mt-3 text-2xl font-bold text-slate-900 dark:text-white">{accessories.length}</p>
          <p className="text-sm text-slate-500 dark:text-slate-400">Total SKUs</p>
        </div>
        <div className="cursor-pointer rounded-2xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-900/[0.02] transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md hover:shadow-slate-900/5 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400">
            <Boxes className="h-5 w-5" />
          </span>
          <p className="mt-3 text-2xl font-bold text-slate-900 dark:text-white">
            {totalAssigned}/{totalUnits}
          </p>
          <p className="text-sm text-slate-500 dark:text-slate-400">Units Assigned</p>
        </div>
        <div className="cursor-pointer rounded-2xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-900/[0.02] transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md hover:shadow-slate-900/5 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400">
            <AlertTriangle className="h-5 w-5" />
          </span>
          <p className="mt-3 text-2xl font-bold text-slate-900 dark:text-white">{needsAttention}</p>
          <p className="text-sm text-slate-500 dark:text-slate-400">Low / Out of Stock</p>
        </div>
        <div className="cursor-pointer rounded-2xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-900/[0.02] transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md hover:shadow-slate-900/5 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-400">
            <IndianRupee className="h-5 w-5" />
          </span>
          <p className="mt-3 text-2xl font-bold text-slate-900 dark:text-white">₹{totalValue.toLocaleString("en-IN")}</p>
          <p className="text-sm text-slate-500 dark:text-slate-400">Total Stock Value</p>
        </div>
      </div>

      <div
        className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-900/[0.02] dark:border-slate-800 dark:bg-slate-900 animate-pop-in"
        style={{ animationDelay: "240ms" }}
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => updateSearch(e.target.value)}
              placeholder="Search SKU, name, vendor..."
              className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-500/20 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-100"
            />
          </div>
          <select
            value={categoryFilter}
            onChange={(e) => updateCategoryFilter(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-100"
          >
            <option value="All">All Categories</option>
            {categoryOptions.map((name) => (
              <option key={name} value={name}>
                {name}
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
            {STOCK_STATUSES.map((s) => (
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
        className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm shadow-slate-900/[0.02] dark:border-slate-800 dark:bg-slate-900 animate-pop-in"
        style={{ animationDelay: "360ms" }}
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/60 text-left text-xs uppercase tracking-wider text-slate-400 dark:border-slate-800 dark:bg-slate-800/30 dark:text-slate-500">
                <th className="px-5 py-3 font-semibold">SKU</th>
                <th className="px-4 py-3 font-semibold">Name</th>
                <th className="px-4 py-3 font-semibold">Category</th>
                <th className="px-4 py-3 text-right font-semibold">Total</th>
                <th className="px-4 py-3 text-right font-semibold">Assigned</th>
                <th className="px-4 py-3 text-right font-semibold">Available</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="w-24 px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {pageItems.map((a) => {
                const available = availableQty(a);
                const status = stockStatus(a);
                const meta = STOCK_STATUS_META[status];
                const StatusIcon = meta.icon;
                const { Icon: CategoryIcon, chip: categoryChip } = categoryDisplayFor(a.category);
                return (
                  <tr
                    key={a.id}
                    onClick={() => setViewId(a.id)}
                    className="cursor-pointer border-b border-slate-50 transition last:border-0 hover:bg-slate-50 dark:border-slate-800/60 dark:hover:bg-slate-800/40"
                  >
                    <td className="px-5 py-3.5 font-mono text-sm font-semibold text-blue-600 dark:text-blue-400">
                      {a.sku}
                    </td>
                    <td className="px-4 py-3.5 font-medium text-slate-800 dark:text-slate-100">{a.name}</td>
                    <td className="px-4 py-3.5">
                      <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold", categoryChip)}>
                        <CategoryIcon className="h-3.5 w-3.5" />
                        {a.category}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-right text-slate-600 dark:text-slate-300">{a.totalQty}</td>
                    <td className="px-4 py-3.5 text-right text-slate-600 dark:text-slate-300">{a.assignedQty}</td>
                    <td className="px-4 py-3.5 text-right font-semibold text-slate-800 dark:text-slate-100">
                      {available}
                    </td>
                    <td className="px-4 py-3.5">
                      <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold", meta.chip)}>
                        <StatusIcon className="h-3.5 w-3.5" />
                        {status}
                      </span>
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            setViewId(a.id);
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
                              openEditModal(a);
                            }}
                            title="Edit accessory"
                            aria-label="Edit accessory"
                            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-300"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                        )}
                        {canAssign && (
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              setAssignAccessoryId(a.id);
                            }}
                            disabled={available === 0}
                            title="Assign Accessory"
                            aria-label="Assign Accessory"
                            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-blue-50 hover:text-blue-600 disabled:cursor-not-allowed disabled:opacity-40 dark:hover:bg-blue-500/10 dark:hover:text-blue-400"
                          >
                            <UserPlus className="h-3.5 w-3.5" />
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
            No accessories match your search or filters.
          </div>
        )}

        <div className="flex flex-col items-center justify-between gap-3 border-t border-slate-100 p-4 text-sm dark:border-slate-800 sm:flex-row">
          <p className="text-slate-500 dark:text-slate-400">
            Showing {pageItems.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1}–
            {Math.min(currentPage * PAGE_SIZE, filtered.length)} of {filtered.length} accessories
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
                  {formMode === "edit" ? "Edit Accessory" : "Add Accessory"}
                </h2>
                {formMode === "edit" && (
                  <p className="text-xs text-slate-400 dark:text-slate-500">
                    {accessories.find((a) => a.id === editingId)?.sku}
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
                  Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Dell USB Mouse"
                  className={inputClass}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>Brand</label>
                  <select
                    value={form.brand}
                    onChange={(e) => setForm((f) => ({ ...f, brand: e.target.value }))}
                    className={inputClass}
                  >
                    {!brands.some((b) => b.name === form.brand) && form.brand && (
                      <option value={form.brand}>{form.brand}</option>
                    )}
                    {brands.map((b) => (
                      <option key={b.id} value={b.name}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelClass}>
                    Category <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={form.category}
                    onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                    placeholder="e.g. Mouse"
                    className={inputClass}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>
                    Model
                    <OptionalTag />
                  </label>
                  <input
                    type="text"
                    value={form.model}
                    onChange={(e) => setForm((f) => ({ ...f, model: e.target.value }))}
                    placeholder="e.g. USB Mouse"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>
                    SKU / Item Code
                    <OptionalTag />
                  </label>
                  <input
                    type="text"
                    value={form.sku}
                    onChange={(e) => setForm((f) => ({ ...f, sku: e.target.value }))}
                    placeholder="Auto-generated if left blank"
                    className={inputClass}
                  />
                </div>
              </div>

              <div>
                <label className={labelClass}>Description</label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  rows={2}
                  placeholder="Optional notes about this accessory"
                  className={cn(inputClass, "resize-none")}
                />
              </div>

              <SectionDivider label="Inventory" />

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>
                    Total Qty <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={form.totalQty}
                    onChange={(e) => setForm((f) => ({ ...f, totalQty: e.target.value }))}
                    placeholder="e.g. 40"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Available Qty</label>
                  <input
                    type="number"
                    min={0}
                    value={form.availableQty}
                    onChange={(e) => setForm((f) => ({ ...f, availableQty: e.target.value }))}
                    placeholder="Defaults to unassigned stock"
                    className={inputClass}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>Reorder Threshold</label>
                  <input
                    type="number"
                    min={0}
                    value={form.reorderThreshold}
                    onChange={(e) => setForm((f) => ({ ...f, reorderThreshold: e.target.value }))}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Reorder Qty</label>
                  <input
                    type="number"
                    min={0}
                    value={form.reorderQty}
                    onChange={(e) => setForm((f) => ({ ...f, reorderQty: e.target.value }))}
                    className={inputClass}
                  />
                </div>
              </div>

              <div>
                <label className={labelClass}>
                  Unit Cost (₹) <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  min={0}
                  value={form.unitCost}
                  onChange={(e) => setForm((f) => ({ ...f, unitCost: e.target.value }))}
                  placeholder="e.g. 650"
                  className={inputClass}
                />
              </div>

              <SectionDivider label="Procurement" />

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>
                    Vendor <span className="text-red-500">*</span>
                  </label>
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
                    Purchase Order
                    <OptionalTag />
                  </label>
                  <input
                    type="text"
                    value={form.purchaseOrder}
                    onChange={(e) => setForm((f) => ({ ...f, purchaseOrder: e.target.value }))}
                    placeholder="e.g. PO-2026-1042"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Warranty Expiry</label>
                  <input
                    type="date"
                    value={form.warrantyExpiry}
                    onChange={(e) => setForm((f) => ({ ...f, warrantyExpiry: e.target.value }))}
                    className={inputClass}
                  />
                </div>
              </div>

              <SectionDivider label="Storage" />

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>
                    Location <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={form.location}
                    onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
                    className={inputClass}
                  >
                    {!locations.some((l) => l.name === form.location) && form.location && (
                      <option value={form.location}>{form.location}</option>
                    )}
                    {locations.map((l) => (
                      <option key={l.id} value={l.name}>
                        {l.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelClass}>
                    Storage Location
                    <OptionalTag />
                  </label>
                  <input
                    type="text"
                    value={form.storageLocation}
                    onChange={(e) => setForm((f) => ({ ...f, storageLocation: e.target.value }))}
                    placeholder="e.g. Rack A-3"
                    className={inputClass}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>Condition</label>
                  <select
                    value={form.condition}
                    onChange={(e) => setForm((f) => ({ ...f, condition: e.target.value as AccessoryCondition }))}
                    className={inputClass}
                  >
                    {ACCESSORY_CONDITIONS.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Status</label>
                  <select
                    value={form.itemStatus}
                    onChange={(e) => setForm((f) => ({ ...f, itemStatus: e.target.value as AccessoryItemStatus }))}
                    className={inputClass}
                  >
                    {ACCESSORY_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
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
                  {submitting ? "Saving…" : formMode === "edit" ? "Save Changes" : "Add Accessory"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {viewAccessory && (
        <AccessoryDetailModal
          accessory={viewAccessory}
          onClose={() => setViewId(null)}
          onEdit={(accessory) => {
            setViewId(null);
            openEditModal(accessory);
          }}
          onDelete={handleDelete}
          onAssignOne={handleAssignOne}
          onReturnOne={handleReturnOne}
          onAssignAccessory={(accessory) => {
            setViewId(null);
            setAssignAccessoryId(accessory.id);
          }}
        />
      )}

      {assignAccessoryId !== null && (
        <AssignAccessoryModal
          defaultAccessoryId={assignAccessoryId === "any" ? null : assignAccessoryId}
          onClose={() => setAssignAccessoryId(null)}
        />
      )}
    </div>
  );
}
