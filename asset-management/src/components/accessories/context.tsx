"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useLoadOnDemand, useRequestLoad, type LoadOptions } from "@/lib/lazy";
import { apiDelete, apiGetAll, apiPatch, apiPost } from "@/lib/api";
import type { Accessory, AccessoryCondition, AccessoryItemStatus } from "@/components/accessories/data";

export type AccessoryInput = {
  sku: string;
  name: string;
  category: string;
  brand: string;
  model: string;
  description: string;
  totalQty: number;
  assignedQty: number;
  reorderThreshold: number;
  reorderQty: number;
  unitCost: number;
  vendor: string;
  purchaseDate: Date | null;
  purchaseOrder: string;
  warrantyExpiry: Date | null;
  locationId: number | null;
  storageLocation: string;
  condition: AccessoryCondition;
  itemStatus: AccessoryItemStatus;
  lastRestocked: Date | null;
};

type AccessoriesContextValue = {
  requestLoad: () => void;
  accessories: Accessory[];
  createAccessory: (input: AccessoryInput) => Promise<Accessory>;
  updateAccessory: (id: number, input: AccessoryInput) => Promise<Accessory>;
  deleteAccessory: (id: number) => Promise<void>;
  refreshAccessories: () => Promise<void>;
};

const AccessoriesContext = createContext<AccessoriesContextValue | null>(null);

type BackendAccessory = {
  id: number;
  sku: string;
  name: string;
  category: string;
  brand: string;
  model: string;
  description: string;
  total_qty: number;
  assigned_qty: number;
  reorder_threshold: number;
  reorder_qty: number;
  unit_cost: string | number;
  vendor: string;
  purchase_date: string | null;
  purchase_order: string;
  warranty_expiry: string | null;
  location: number | null;
  location_name: string | null;
  storage_location: string;
  condition: AccessoryCondition;
  item_status: AccessoryItemStatus;
  last_restocked: string | null;
};

function toDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const [y, m, d] = value.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

function toISODate(date: Date | null): string | null {
  if (!date) return null;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function fromBackend(accessory: BackendAccessory): Accessory {
  return {
    id: accessory.id,
    sku: accessory.sku,
    name: accessory.name,
    category: accessory.category,
    brand: accessory.brand || "",
    model: accessory.model || "",
    description: accessory.description || "",
    totalQty: accessory.total_qty,
    assignedQty: accessory.assigned_qty,
    reorderThreshold: accessory.reorder_threshold,
    reorderQty: accessory.reorder_qty,
    unitCost: Number(accessory.unit_cost) || 0,
    vendor: accessory.vendor || "",
    purchaseDate: toDate(accessory.purchase_date),
    purchaseOrder: accessory.purchase_order || "",
    warrantyExpiry: toDate(accessory.warranty_expiry),
    location: accessory.location_name || "",
    storageLocation: accessory.storage_location || "",
    condition: accessory.condition,
    itemStatus: accessory.item_status,
    lastRestocked: toDate(accessory.last_restocked),
  };
}

function toBackend(input: AccessoryInput) {
  return {
    sku: input.sku,
    name: input.name,
    category: input.category,
    brand: input.brand,
    model: input.model,
    description: input.description,
    total_qty: input.totalQty,
    assigned_qty: input.assignedQty,
    reorder_threshold: input.reorderThreshold,
    reorder_qty: input.reorderQty,
    unit_cost: input.unitCost,
    vendor: input.vendor,
    purchase_date: toISODate(input.purchaseDate),
    purchase_order: input.purchaseOrder,
    warranty_expiry: toISODate(input.warrantyExpiry),
    location: input.locationId,
    storage_location: input.storageLocation,
    condition: input.condition,
    item_status: input.itemStatus,
    last_restocked: toISODate(input.lastRestocked),
  };
}

export function AccessoriesProvider({ children }: { children: ReactNode }) {
  const [accessories, setAccessories] = useState<Accessory[]>([]);

  async function refreshAccessories() {
    const items = await apiGetAll<BackendAccessory>("/operation/accessories/");
    setAccessories(items.map(fromBackend));
  }

  const [loadRequested, requestLoad] = useLoadOnDemand();

  // Loads the first time a component on screen reads this context (see lib/lazy.ts).
  useEffect(() => {
    if (!loadRequested) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on demand; state is set when the request resolves
    void refreshAccessories().catch(() => setAccessories([]));
  }, [loadRequested]);

  async function createAccessory(input: AccessoryInput) {
    const created = await apiPost<BackendAccessory>("/operation/accessories/", toBackend(input));
    const accessory = fromBackend(created);
    setAccessories((prev) => [accessory, ...prev]);
    return accessory;
  }

  async function updateAccessory(id: number, input: AccessoryInput) {
    const updated = await apiPatch<BackendAccessory>(`/operation/accessories/${id}/`, toBackend(input));
    const accessory = fromBackend(updated);
    setAccessories((prev) => prev.map((a) => (a.id === id ? accessory : a)));
    return accessory;
  }

  async function deleteAccessory(id: number) {
    await apiDelete(`/operation/accessories/${id}/`);
    setAccessories((prev) => prev.filter((a) => a.id !== id));
  }

  return (
    <AccessoriesContext.Provider
      value={{ requestLoad, accessories, createAccessory, updateAccessory, deleteAccessory, refreshAccessories }}
    >
      {children}
    </AccessoriesContext.Provider>
  );
}

export function useAccessories(options?: LoadOptions) {
  const ctx = useContext(AccessoriesContext);
  useRequestLoad(ctx?.requestLoad, options);
  if (!ctx) throw new Error("useAccessories must be used within an AccessoriesProvider");
  return ctx;
}
