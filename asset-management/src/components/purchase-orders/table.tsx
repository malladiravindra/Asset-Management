"use client";

import { useMemo, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Clock3,
  Eye,
  IndianRupee,
  Plus,
  Search,
  ShoppingCart,
  Trash2,
  X,
} from "lucide-react";
import { useCan } from "@/components/auth/context";
import { usePurchaseOrders } from "@/components/purchase-orders/context";
import {
  GST_RATES,
  PO_STATUS_META,
  PURCHASE_ORDER_STATUSES,
  totalUnits,
  totalValue,
  type PurchaseOrderStatus,
} from "@/components/purchase-orders/data";
import { PurchaseOrderDetailModal } from "@/components/purchase-orders/detail-modal";
import { TODAY, formatDate } from "@/components/assets/data";
import { useModels } from "@/components/models/context";
import { useDepartments } from "@/components/departments/context";
import { useEmployees } from "@/components/employees/context";
import { useVendors } from "@/components/vendors/context";
import { useToast } from "@/components/ui/toast";
import { useRuntimeSettings } from "@/components/settings/runtime";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 10;

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

type DraftItem = { modelId: number | null; quantity: string; unitCost: string };

function emptyDraftItem(): DraftItem {
  return { modelId: null, quantity: "1", unitCost: "" };
}

// Local date components (not UTC) so a picked date never shifts by a day
// in timezones ahead of/behind UTC.
function dateInputValue(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseDateInputValue(value: string) {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function PurchaseOrdersTable() {
  const { orders, createPurchaseOrder, updatePurchaseOrder, deletePurchaseOrder } = usePurchaseOrders();
  const { models } = useModels();
  const { departments } = useDepartments();
  const { employees } = useEmployees();
  const { vendors } = useVendors();
  const { values: runtimeSettings } = useRuntimeSettings();
  const { showSuccess, showErrorFromException } = useToast();
  const canAdd = useCan("operations.add_purchaseorder");
  const canDelete = useCan("operations.delete_purchaseorder");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<PurchaseOrderStatus | "All">("All");
  const [page, setPage] = useState(1);
  const [viewId, setViewId] = useState<number | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [vendor, setVendor] = useState("");
  const [vendorName, setVendorName] = useState("");
  const [vendorCompanyName, setVendorCompanyName] = useState("");
  const [vendorEmail, setVendorEmail] = useState("");
  const [vendorPhone, setVendorPhone] = useState("");
  const [vendorAddress, setVendorAddress] = useState("");
  const [department, setDepartment] = useState("");
  const [requestedBy, setRequestedBy] = useState("");
  const [expectedDate, setExpectedDate] = useState(dateInputValue(new Date(TODAY.getTime() + 14 * 86_400_000)));
  const [gstRate, setGstRate] = useState(18);
  const [notes, setNotes] = useState("");
  const [draftItems, setDraftItems] = useState<DraftItem[]>([emptyDraftItem()]);

  const requesterOptions = useMemo(
    () => (department ? employees.filter((e) => e.department === department) : employees),
    [employees, department]
  );

  function handleDepartmentChange(value: string) {
    setDepartment(value);
    setRequestedBy((prev) => (employees.find((e) => e.name === prev)?.department === value ? prev : ""));
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return orders.filter((o) => {
      const matchesStatus = statusFilter === "All" || o.status === statusFilter;
      const matchesQuery =
        !q ||
        o.poNumber.toLowerCase().includes(q) ||
        o.vendor.toLowerCase().includes(q) ||
        o.requestedBy.toLowerCase().includes(q);
      return matchesStatus && matchesQuery;
    });
  }, [orders, search, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageItems = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const totalOrderValue = orders.reduce((sum, o) => sum + totalValue(o), 0);
  const awaitingAction = orders.filter((o) => o.status === "Draft" || o.status === "Pending Approval").length;
  const receivedCount = orders.filter((o) => o.status === "Received").length;

  const viewOrder = orders.find((o) => o.id === viewId) ?? null;

  function updateFilter(next: PurchaseOrderStatus | "All") {
    setStatusFilter(next);
    setPage(1);
  }

  function updateSearch(value: string) {
    setSearch(value);
    setPage(1);
  }

  function openAddModal() {
    setVendor("");
    setVendorName("");
    setVendorCompanyName("");
    setVendorEmail("");
    setVendorPhone("");
    setVendorAddress("");
    setDepartment("");
    setRequestedBy("");
    setExpectedDate(dateInputValue(new Date(TODAY.getTime() + 14 * 86_400_000)));
    setGstRate(18);
    setNotes("");
    setDraftItems([emptyDraftItem()]);
    setFormError(null);
    setFormOpen(true);
  }

  function selectVendor(name: string) {
    setVendor(name);
    const match = vendors.find((v) => v.name === name);
    setVendorName(match?.name ?? name);
    setVendorCompanyName(match?.companyName ?? "");
    setVendorEmail(match?.email ?? "");
    setVendorPhone(match?.phone ?? "");
  }

  function updateDraftItem(index: number, patch: Partial<DraftItem>) {
    setDraftItems((prev) => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  }

  function addDraftItem() {
    setDraftItems((prev) => [...prev, emptyDraftItem()]);
  }

  function removeDraftItem(index: number) {
    setDraftItems((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== index) : prev));
  }

  const draftSubtotal = draftItems.reduce((sum, item) => {
    const model = item.modelId !== null ? models.find((m) => m.id === item.modelId) : null;
    const qty = Number(item.quantity) || 0;
    const cost = Number(item.unitCost) || 0;
    return model ? sum + qty * cost : sum;
  }, 0);
  const draftTax = Math.round((draftSubtotal * gstRate) / 100);
  const draftTotal = draftSubtotal + draftTax;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!vendor) {
      setFormError("Select a vendor.");
      return;
    }
    if (!department) {
      setFormError("Select a department.");
      return;
    }
    if (!requestedBy) {
      setFormError("Select a requester.");
      return;
    }

    const items: { name: string; category: string; quantity: number; unitCost: number }[] = [];
    for (const draft of draftItems) {
      const model = draft.modelId !== null ? models.find((m) => m.id === draft.modelId) : null;
      const quantity = Number(draft.quantity);
      if (!model || !quantity || quantity <= 0) continue;

      const unitCost = Number(draft.unitCost);
      if (!draft.unitCost.trim() || Number.isNaN(unitCost) || unitCost <= 0) {
        setFormError("Enter a unit cost for every line item.");
        return;
      }

      items.push({ name: model.name, category: model.category, quantity, unitCost });
    }

    if (items.length === 0) {
      setFormError("Add at least one item with a valid quantity.");
      return;
    }
    if (!expectedDate) {
      setFormError("Choose an expected delivery date.");
      return;
    }

    setSubmitting(true);
    setFormError(null);
    try {
      await createPurchaseOrder({
        vendor: vendorName.trim() || vendor,
        vendorCompanyName: vendorCompanyName.trim() || undefined,
        vendorEmail: vendorEmail.trim() || undefined,
        vendorPhone: vendorPhone.trim() || undefined,
        vendorAddress: vendorAddress.trim() || undefined,
        department,
        requestedBy,
        items,
        // Settings > Purchase Orders > Default PO Status (was always "Draft").
        status: (runtimeSettings?.default_po_status as PurchaseOrderStatus | undefined) ?? "Draft",
        expectedDate: parseDateInputValue(expectedDate),
        receivedDate: null,
        notes: notes.trim(),
        gstRate: gstRate || undefined,
        tax: draftTax || undefined,
      });
      showSuccess("Purchase order created.");
      setFormOpen(false);
      setStatusFilter("All");
      setSearch("");
      setPage(1);
    } catch (error) {
      showErrorFromException(error);
      setFormError(error instanceof Error ? error.message : "Could not create this purchase order.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleAdvance(id: number, status: PurchaseOrderStatus) {
    const order = orders.find((o) => o.id === id);
    try {
      await updatePurchaseOrder(id, {
        status,
        receivedDate:
          status === "Received" || status === "Partially Received" ? TODAY : order?.receivedDate,
      });
      showSuccess(`Purchase order marked as ${status}.`);
    } catch (error) {
      showErrorFromException(error, "Could not update this purchase order.");
    }
  }

  async function handleCancel(id: number) {
    try {
      await updatePurchaseOrder(id, { status: "Cancelled" });
      showSuccess("Purchase order cancelled.");
    } catch (error) {
      showErrorFromException(error, "Could not cancel this purchase order.");
    }
  }

  async function handleDelete(id: number) {
    try {
      await deletePurchaseOrder(id);
      showSuccess("Purchase order deleted.");
      setViewId(null);
    } catch (error) {
      showErrorFromException(error, "Could not delete this purchase order.");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center animate-tilt-in">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Purchase Orders</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {orders.length} orders · ₹{(totalOrderValue / 100000).toFixed(1)}L total value
          </p>
        </div>
        {canAdd && (
          <button
            type="button"
            onClick={openAddModal}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
          >
            <Plus className="h-4 w-4" />
            New Order
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 animate-tilt-in" style={{ animationDelay: "120ms" }}>
        <div className="cursor-pointer rounded-2xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-900/[0.02] transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md hover:shadow-slate-900/5 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400">
            <ShoppingCart className="h-5 w-5" />
          </span>
          <p className="mt-3 text-2xl font-bold text-slate-900 dark:text-white">{orders.length}</p>
          <p className="text-sm text-slate-500 dark:text-slate-400">Total Orders</p>
        </div>
        <div className="cursor-pointer rounded-2xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-900/[0.02] transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md hover:shadow-slate-900/5 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400">
            <IndianRupee className="h-5 w-5" />
          </span>
          <p className="mt-3 text-2xl font-bold text-slate-900 dark:text-white">₹{(totalOrderValue / 100000).toFixed(1)}L</p>
          <p className="text-sm text-slate-500 dark:text-slate-400">Total Value</p>
        </div>
        <div className="cursor-pointer rounded-2xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-900/[0.02] transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md hover:shadow-slate-900/5 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400">
            <Clock3 className="h-5 w-5" />
          </span>
          <p className="mt-3 text-2xl font-bold text-slate-900 dark:text-white">{awaitingAction}</p>
          <p className="text-sm text-slate-500 dark:text-slate-400">Awaiting Action</p>
        </div>
        <div className="cursor-pointer rounded-2xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-900/[0.02] transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md hover:shadow-slate-900/5 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-400">
            <ShoppingCart className="h-5 w-5" />
          </span>
          <p className="mt-3 text-2xl font-bold text-slate-900 dark:text-white">{receivedCount}</p>
          <p className="text-sm text-slate-500 dark:text-slate-400">Received</p>
        </div>
      </div>

      <div
        className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-900/[0.02] dark:border-slate-800 dark:bg-slate-900 animate-tilt-in"
        style={{ animationDelay: "240ms" }}
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => updateSearch(e.target.value)}
              placeholder="Search PO number, vendor, requester..."
              className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-500/20 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-100"
            />
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => updateFilter("All")}
              className={cn(
                "rounded-full px-3 py-1.5 text-sm font-medium transition",
                statusFilter === "All"
                  ? "bg-blue-600 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
              )}
            >
              All
            </button>
            {PURCHASE_ORDER_STATUSES.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => updateFilter(s)}
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
        className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm shadow-slate-900/[0.02] dark:border-slate-800 dark:bg-slate-900 animate-tilt-in"
        style={{ animationDelay: "360ms" }}
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/60 text-left text-xs uppercase tracking-wider text-slate-400 dark:border-slate-800 dark:bg-slate-800/30 dark:text-slate-500">
                <th className="px-5 py-3 font-semibold">PO Number</th>
                <th className="px-4 py-3 font-semibold">Vendor</th>
                <th className="px-4 py-3 font-semibold">Items</th>
                <th className="px-4 py-3 font-semibold">Value</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Date</th>
                <th className="w-16 px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {pageItems.map((o) => {
                const meta = PO_STATUS_META[o.status];
                const StatusIcon = meta.icon;
                return (
                  <tr
                    key={o.id}
                    onClick={() => setViewId(o.id)}
                    className="cursor-pointer border-b border-slate-50 transition last:border-0 hover:bg-slate-50 dark:border-slate-800/60 dark:hover:bg-slate-800/40"
                  >
                    <td className="px-5 py-3.5 font-mono text-sm font-semibold text-blue-600 dark:text-blue-400">
                      {o.poNumber}
                    </td>
                    <td className="px-4 py-3.5">
                      <p className="font-medium text-slate-800 dark:text-slate-100">{o.vendor}</p>
                      <p className="text-xs text-slate-400 dark:text-slate-500">{o.requestedBy}</p>
                    </td>
                    <td className="px-4 py-3.5 text-slate-600 dark:text-slate-300">
                      {totalUnits(o)} units
                      <span className="ml-1 text-xs text-slate-400 dark:text-slate-500">
                        ({o.items.length} item{o.items.length === 1 ? "" : "s"})
                      </span>
                    </td>
                    <td className="px-4 py-3.5 font-semibold text-slate-800 dark:text-slate-100">
                      ₹{totalValue(o).toLocaleString("en-IN")}
                    </td>
                    <td className="px-4 py-3.5">
                      <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold", meta.chip)}>
                        <StatusIcon className="h-3.5 w-3.5" />
                        {o.status}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-slate-500 dark:text-slate-400">{formatDate(o.orderDate)}</td>
                    <td className="px-4 py-3.5 text-right">
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          setViewId(o.id);
                        }}
                        title="View details"
                        aria-label="View details"
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-blue-50 hover:text-blue-600 dark:hover:bg-blue-500/10 dark:hover:text-blue-400"
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {pageItems.length === 0 && (
          <div className="py-12 text-center text-sm text-slate-400 dark:text-slate-500">
            No purchase orders match your search or filters.
          </div>
        )}

        <div className="flex flex-col items-center justify-between gap-3 border-t border-slate-100 p-4 text-sm dark:border-slate-800 sm:flex-row">
          <p className="text-slate-500 dark:text-slate-400">
            Showing {pageItems.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1}–
            {Math.min(currentPage * PAGE_SIZE, filtered.length)} of {filtered.length} orders
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

      {formOpen && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-slate-900/40 p-4">
          <button aria-label="Close" className="absolute inset-0 cursor-default" onClick={() => setFormOpen(false)} />
          <div className="relative flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl dark:bg-slate-900">
            <div className="flex shrink-0 items-center justify-between border-b border-slate-100 p-6 dark:border-slate-800">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Add Purchase Order</h2>
              <button
                type="button"
                onClick={() => setFormOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6">
              <div className="space-y-4">
                <SectionDivider label="Basic Information" />

                <p className="-mt-1 text-xs text-slate-400 dark:text-slate-500">
                  The PO number is generated automatically once the order is created.
                </p>

                <div>
                  <label className={labelClass}>
                    Vendor <span className="text-red-500">*</span>
                  </label>
                  <select value={vendor} onChange={(e) => selectVendor(e.target.value)} className={inputClass}>
                    <option value="" disabled>
                      Select Vendor
                    </option>
                    {vendors.map((v) => (
                      <option key={v.id} value={v.name}>
                        {v.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className={labelClass}>
                      Company Name
                      <OptionalTag />
                    </label>
                    <input
                      type="text"
                      value={vendorCompanyName}
                      onChange={(e) => setVendorCompanyName(e.target.value)}
                      placeholder="e.g. Redington Limited"
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>
                      Vendor Name
                      <OptionalTag />
                    </label>
                    <input
                      type="text"
                      value={vendorName}
                      onChange={(e) => setVendorName(e.target.value)}
                      placeholder="e.g. Redington IT Hardware"
                      className={inputClass}
                    />
                  </div>
                </div>

                <div>
                  <label className={labelClass}>
                    Vendor Email
                    <OptionalTag />
                  </label>
                  <input
                    type="email"
                    value={vendorEmail}
                    onChange={(e) => setVendorEmail(e.target.value)}
                    placeholder="vendor@example.com"
                    className={inputClass}
                  />
                </div>

                <div>
                  <label className={labelClass}>
                    Vendor Address
                    <OptionalTag />
                  </label>
                  <input
                    type="text"
                    value={vendorAddress}
                    onChange={(e) => setVendorAddress(e.target.value)}
                    placeholder="Billing / shipping address"
                    className={inputClass}
                  />
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className={labelClass}>
                      Department <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={department}
                      onChange={(e) => handleDepartmentChange(e.target.value)}
                      className={inputClass}
                    >
                      <option value="" disabled>
                        Select Department
                      </option>
                      {departments.map((d) => (
                        <option key={d.id} value={d.name}>
                          {d.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={labelClass}>
                      Requested By <span className="text-red-500">*</span>
                    </label>
                    <select value={requestedBy} onChange={(e) => setRequestedBy(e.target.value)} className={inputClass}>
                      <option value="" disabled>
                        {department ? "Select Requester" : "Select department first"}
                      </option>
                      {requesterOptions.map((e) => (
                        <option key={e.id} value={e.name}>
                          {e.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className={labelClass}>
                    Expected Delivery <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={expectedDate}
                    onChange={(e) => setExpectedDate(e.target.value)}
                    className={inputClass}
                  />
                </div>

                <SectionDivider label="Line Items" />

                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Line Items</label>
                    <button
                      type="button"
                      onClick={addDraftItem}
                      className="flex items-center gap-1 text-sm font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Add Item
                    </button>
                  </div>

                  <div className="hidden gap-2 px-3 sm:grid sm:grid-cols-[1fr_6rem_7rem_5.5rem_2.25rem]">
                    <span className="text-xs font-medium text-slate-400 dark:text-slate-500">
                      Item <span className="text-red-500">*</span>
                    </span>
                    <span className="text-xs font-medium text-slate-400 dark:text-slate-500">
                      Quantity <span className="text-red-500">*</span>
                    </span>
                    <span className="text-xs font-medium text-slate-400 dark:text-slate-500">
                      Unit Cost <span className="text-red-500">*</span>
                    </span>
                    <span className="text-right text-xs font-medium text-slate-400 dark:text-slate-500">
                      Line Total
                    </span>
                    <span />
                  </div>

                  <div className="mt-1.5 space-y-2">
                    {draftItems.map((item, i) => {
                      const model = item.modelId !== null ? models.find((m) => m.id === item.modelId) : null;
                      const lineTotal = model ? (Number(item.quantity) || 0) * (Number(item.unitCost) || 0) : 0;
                      return (
                        <div
                          key={i}
                          className="grid grid-cols-1 items-center gap-2 rounded-xl border border-slate-200 p-3 dark:border-slate-800 sm:grid-cols-[1fr_6rem_7rem_5.5rem_2.25rem]"
                        >
                          <select
                            value={item.modelId ?? ""}
                            onChange={(e) =>
                              updateDraftItem(i, {
                                modelId: e.target.value === "" ? null : Number(e.target.value),
                              })
                            }
                            className={inputClass}
                          >
                            <option value="" disabled>
                              Select Item
                            </option>
                            {models.map((m) => (
                              <option key={m.id} value={m.id}>
                                {m.name} ({m.brand} · {m.category})
                              </option>
                            ))}
                          </select>
                          <input
                            type="number"
                            min={1}
                            value={item.quantity}
                            onChange={(e) => updateDraftItem(i, { quantity: e.target.value })}
                            placeholder="Qty"
                            className={inputClass}
                          />
                          <input
                            type="number"
                            min={1}
                            required
                            value={item.unitCost}
                            onChange={(e) => updateDraftItem(i, { unitCost: e.target.value })}
                            placeholder="₹ 0.00"
                            className={inputClass}
                          />
                          <p className="text-right text-sm font-semibold text-slate-700 dark:text-slate-200 sm:text-sm">
                            ₹{lineTotal.toLocaleString("en-IN")}
                          </p>
                          <button
                            type="button"
                            onClick={() => removeDraftItem(i)}
                            disabled={draftItems.length === 1}
                            className="flex h-9 w-9 shrink-0 items-center justify-center justify-self-end rounded-lg text-slate-400 transition hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-30 dark:hover:bg-red-500/10"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <SectionDivider label="Order Summary" />

                <div className="space-y-2 rounded-xl border border-slate-200 p-4 dark:border-slate-800">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-500 dark:text-slate-400">Subtotal</span>
                    <span className="font-medium text-slate-700 dark:text-slate-200">
                      ₹{draftSubtotal.toLocaleString("en-IN")}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
                      GST
                      <select
                        value={gstRate}
                        onChange={(e) => setGstRate(Number(e.target.value))}
                        className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-200"
                      >
                        {GST_RATES.map((rate) => (
                          <option key={rate} value={rate}>
                            {rate}%
                          </option>
                        ))}
                      </select>
                    </span>
                    <span className="font-medium text-slate-700 dark:text-slate-200">
                      ₹{draftTax.toLocaleString("en-IN")}
                    </span>
                  </div>
                  <div className="flex items-center justify-between border-t border-slate-100 pt-2 text-sm dark:border-slate-800">
                    <span className="font-semibold text-slate-700 dark:text-slate-200">Order Total</span>
                    <span className="text-base font-bold text-slate-900 dark:text-white">
                      ₹{draftTotal.toLocaleString("en-IN")}
                    </span>
                  </div>
                </div>

                <SectionDivider label="Additional Information" />

                <div>
                  <label className={labelClass}>
                    Notes
                    <OptionalTag />
                  </label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={2}
                    placeholder="Add context for approvers..."
                    className={cn(inputClass, "resize-none")}
                  />
                </div>

                {formError && (
                  <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-500/10 dark:text-red-400">
                    {formError}
                  </p>
                )}
              </div>

              <div className="mt-5 flex justify-end gap-2 border-t border-slate-100 pt-4 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setFormOpen(false)}
                  disabled={submitting}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-70 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {submitting ? "Creating…" : "Create Purchase Order"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {viewOrder && (
        <PurchaseOrderDetailModal
          order={viewOrder}
          onClose={() => setViewId(null)}
          onAdvance={handleAdvance}
          onCancel={handleCancel}
          onDelete={canDelete ? handleDelete : undefined}
        />
      )}
    </div>
  );
}
