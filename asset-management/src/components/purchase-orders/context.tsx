"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useLoadOnDemand, useRequestLoad, type LoadOptions } from "@/lib/lazy";
import { apiDelete, apiGetAll, apiPatch, apiPost } from "@/lib/api";
import type { PurchaseOrder, PurchaseOrderItem, PurchaseOrderStatus } from "@/components/purchase-orders/data";

export type PurchaseOrderItemInput = {
  name: string;
  category?: string;
  quantity: number;
  unitCost: number;
};

// Fields that map onto real backend columns. `items` is required when
// creating a PO (it must be a non-empty array); it's optional when
// updating, since omitting it entirely from a PATCH leaves the PO's
// existing line items untouched (used for status-only updates).
export type PurchaseOrderWriteInput = {
  vendor: string;
  vendorCompanyName?: string;
  vendorEmail?: string;
  vendorPhone?: string;
  vendorAddress?: string;
  department: string;
  requestedBy: string;
  items?: PurchaseOrderItemInput[];
  status: PurchaseOrderStatus;
  expectedDate: Date;
  receivedDate?: Date | null;
  notes: string;
  gstRate?: number;
  tax?: number;
};

export type PurchaseOrderCreateInput = Omit<PurchaseOrderWriteInput, "items"> & {
  items: PurchaseOrderItemInput[];
};

export type PurchaseOrderUpdateInput = Partial<PurchaseOrderWriteInput>;

type PurchaseOrdersContextValue = {
  requestLoad: () => void;
  orders: PurchaseOrder[];
  createPurchaseOrder: (input: PurchaseOrderCreateInput) => Promise<PurchaseOrder>;
  updatePurchaseOrder: (id: number, input: PurchaseOrderUpdateInput) => Promise<PurchaseOrder>;
  deletePurchaseOrder: (id: number) => Promise<void>;
};

const PurchaseOrdersContext = createContext<PurchaseOrdersContextValue | null>(null);

type BackendPurchaseOrderItem = {
  id?: number;
  name: string;
  category?: string | null;
  quantity: number;
  unit_cost: string | number;
};

type BackendPurchaseOrder = {
  id: number;
  po_number: string;
  vendor: string;
  vendor_company_name: string;
  vendor_email: string;
  vendor_phone: string;
  vendor_address: string;
  department: string;
  requested_by: string;
  items: BackendPurchaseOrderItem[];
  status: PurchaseOrderStatus;
  order_date: string;
  expected_date: string;
  received_date: string | null;
  notes: string | null;
  gst_rate: string | number | null;
  subtotal: string | number;
  tax: string | number;
  total: string | number;
};

// Parse/format dates using local date components (not UTC) so a date
// picked or received from the API never shifts by a day in timezones
// ahead of/behind UTC.
function parseDateOnly(value: string): Date {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

function formatDateOnly(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function fromBackendItem(item: BackendPurchaseOrderItem): PurchaseOrderItem {
  return {
    name: item.name,
    category: item.category ?? "",
    quantity: item.quantity,
    unitCost: Number(item.unit_cost),
  };
}

// vendor_company_name/email/phone/address are derived live from the
// linked Vendor record (see PurchaseOrderSerializer) — real backend
// fields now, not client-only "extras" that used to vanish on reload.
// Same for gst_rate/subtotal/tax/total, computed server-side from the
// order's own gst_rate column and its actual line items.
function fromBackend(order: BackendPurchaseOrder): PurchaseOrder {
  return {
    id: order.id,
    poNumber: order.po_number,
    vendor: order.vendor,
    vendorCompanyName: order.vendor_company_name || undefined,
    vendorEmail: order.vendor_email || undefined,
    vendorPhone: order.vendor_phone || undefined,
    vendorAddress: order.vendor_address || undefined,
    department: order.department,
    requestedBy: order.requested_by,
    items: order.items.map(fromBackendItem),
    status: order.status,
    orderDate: parseDateOnly(order.order_date),
    expectedDate: parseDateOnly(order.expected_date),
    receivedDate: order.received_date ? parseDateOnly(order.received_date) : null,
    notes: order.notes ?? "",
    gstRate: order.gst_rate != null ? Number(order.gst_rate) : undefined,
    tax: Number(order.tax),
  };
}

// Only include a key in the payload when it was actually provided, so a
// partial update (e.g. status-only) never sends `items` and therefore
// never wipes the PO's existing line items server-side.
function toBackend(input: PurchaseOrderUpdateInput) {
  const payload: Record<string, unknown> = {};
  if (input.vendor !== undefined) payload.vendor = input.vendor;
  if (input.department !== undefined) payload.department = input.department;
  if (input.requestedBy !== undefined) payload.requested_by = input.requestedBy;
  if (input.items !== undefined) {
    payload.items = input.items.map((item) => ({
      name: item.name,
      category: item.category || "",
      quantity: item.quantity,
      unit_cost: item.unitCost,
    }));
  }
  if (input.status !== undefined) payload.status = input.status;
  if (input.expectedDate !== undefined) payload.expected_date = formatDateOnly(input.expectedDate);
  if (input.receivedDate !== undefined) {
    payload.received_date = input.receivedDate ? formatDateOnly(input.receivedDate) : null;
  }
  if (input.notes !== undefined) payload.notes = input.notes;
  if (input.gstRate !== undefined) payload.gst_rate = input.gstRate;
  // po_number, order_date, and the vendor_* detail fields are server-
  // controlled/derived-read-only and are intentionally never included here.
  return payload;
}

export function PurchaseOrdersProvider({ children }: { children: ReactNode }) {
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);

  const [loadRequested, requestLoad] = useLoadOnDemand();

  // Loads the first time a component on screen reads this context (see lib/lazy.ts).
  useEffect(() => {
    if (!loadRequested) return;
    void apiGetAll<BackendPurchaseOrder>("/operations/purchase-orders/")
      .then((items) => setOrders(items.map((o) => fromBackend(o))))
      .catch(() => setOrders([]));
  }, [loadRequested]);

  async function createPurchaseOrder(input: PurchaseOrderCreateInput) {
    const created = await apiPost<BackendPurchaseOrder>("/operations/purchase-orders/", toBackend(input));
    const order = fromBackend(created);
    setOrders((prev) => [order, ...prev]);
    return order;
  }

  async function updatePurchaseOrder(id: number, input: PurchaseOrderUpdateInput) {
    const updated = await apiPatch<BackendPurchaseOrder>(`/operations/purchase-orders/${id}/`, toBackend(input));
    const order = fromBackend(updated);
    setOrders((prev) => prev.map((o) => (o.id === id ? order : o)));
    return order;
  }

  async function deletePurchaseOrder(id: number) {
    await apiDelete(`/operations/purchase-orders/${id}/`);
    setOrders((prev) => prev.filter((o) => o.id !== id));
  }

  return (
    <PurchaseOrdersContext.Provider
      value={{ requestLoad, orders, createPurchaseOrder, updatePurchaseOrder, deletePurchaseOrder }}
    >
      {children}
    </PurchaseOrdersContext.Provider>
  );
}

export function usePurchaseOrders(options?: LoadOptions) {
  const ctx = useContext(PurchaseOrdersContext);
  useRequestLoad(ctx?.requestLoad, options);
  if (!ctx) throw new Error("usePurchaseOrders must be used within a PurchaseOrdersProvider");
  return ctx;
}
