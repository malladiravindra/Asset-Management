"use client";

import { createContext, useContext, useEffect, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { useLoadOnDemand, useRequestLoad, type LoadOptions } from "@/lib/lazy";
import { apiDelete, apiGet, apiGetAll, apiPatch, apiPost } from "@/lib/api";
import type { Asset } from "@/components/assets/data";
import { parseDateOnly } from "@/lib/dates";

type AssetInput = {
  name: string;
  categoryId: number;
  departmentId: number;
  locationId: number;
  brandId?: number | null;
  modelId?: number | null;
  vendorId?: number | null;
  serialNumber: string;
  assignedTo?: string | null;
  status: string;
  condition: string;
  // Only used when no warranty end date is given — with one, the backend
  // derives the status from the date.
  warrantyStatus: string;
  warrantyStartDate?: string | null; // 'YYYY-MM-DD'
  warrantyEndDate?: string | null; // 'YYYY-MM-DD'
  warrantyProvider?: string;
  cost: number;
  currentValue?: number;
  // 'YYYY-MM-DD' or null. The Add/Edit Asset form has no picker for this
  // (see assets/table.tsx), so callers normally omit it entirely — leaving
  // an existing asset's purchase_date untouched on edit, same as
  // brand/model/vendor below. Only passed explicitly by callers that do
  // have a picker (e.g. the Reports module's asset editor).
  purchaseDate?: string | null;
};

type AssetsContextValue = {
  requestLoad: () => void;
  assets: Asset[];
  loading: boolean;
  setAssets: Dispatch<SetStateAction<Asset[]>>;
  refreshAssets: () => Promise<void>;
  /** Re-read one asset after another module changed it server-side (a
   *  maintenance job, repair, assignment or return). No-op until the asset
   *  list has been loaded — there is nothing on screen to update. */
  refreshAsset: (id: number) => Promise<void>;
  getAsset: (id: number) => Promise<Asset>;
  createAsset: (input: AssetInput) => Promise<Asset>;
  updateAsset: (id: number, input: AssetInput) => Promise<Asset>;
  deleteAsset: (id: number) => Promise<void>;
};

const AssetsContext = createContext<AssetsContextValue | null>(null);

export type BackendAsset = {
  id: number; asset_code: string; name: string; category: string; serial_number: string;
  brand: string | null; model: string | null;
  department: string; location: string; assigned_to: { name: string } | null;
  status: string; condition: string; cost: string; current_value: string;
  warranty_status: string; created_at: string; updated_at: string; vendor: string | null;
  purchase_date: string | null;
  warranty_start_date: string | null; warranty_end_date: string | null;
  warranty_provider: string; warranty_days_remaining: number | null;
};

export function fromBackend(asset: BackendAsset): Asset {
  return {
    id: asset.id,
    tag: asset.asset_code,
    assetTag: asset.asset_code,
    name: asset.name,
    category: asset.category,
    serial: asset.serial_number,
    department: asset.department,
    location: asset.location,
    assignedTo: asset.assigned_to?.name ?? null,
    status: asset.status as Asset["status"],
    condition: asset.condition as Asset["condition"],
    cost: Number(asset.cost),
    currentValue: Number(asset.current_value),
    // Real purchase_date only; null (shown as "Not recorded") when none was set.
    purchaseDate: asset.purchase_date ? parseDateOnly(asset.purchase_date) : null,
    purchaseDateRaw: asset.purchase_date,
    vendor: asset.vendor ?? "",
    brand: asset.brand ?? "",
    model: asset.model ?? "",
    warranty: asset.warranty_status as Asset["warranty"],
    warrantyStartDate: asset.warranty_start_date ? parseDateOnly(asset.warranty_start_date) : null,
    warrantyEndDate: asset.warranty_end_date ? parseDateOnly(asset.warranty_end_date) : null,
    warrantyProvider: asset.warranty_provider ?? "",
    warrantyDaysRemaining: asset.warranty_days_remaining ?? null,
  };
}

// asset_code is server-generated and never sent. brand/model/vendor/current_value
// have no UI picker in the current form yet, so they're only included when the
// caller actually supplies an id/value; omitting them lets the backend leave them
// null (brand/model/vendor) or derive them from cost (current_value).
function toBackend(input: AssetInput) {
  const payload: Record<string, unknown> = {
    name: input.name,
    category: input.categoryId,
    department: input.departmentId,
    location: input.locationId,
    serial_number: input.serialNumber,
    status: input.status,
    condition: input.condition,
    warranty_status: input.warrantyStatus,
    cost: input.cost,
  };
  if (input.purchaseDate !== undefined) payload.purchase_date = input.purchaseDate;
  if (input.warrantyStartDate !== undefined) payload.warranty_start_date = input.warrantyStartDate;
  if (input.warrantyEndDate !== undefined) payload.warranty_end_date = input.warrantyEndDate;
  if (input.warrantyProvider !== undefined) payload.warranty_provider = input.warrantyProvider;
  if (input.brandId != null) payload.brand = input.brandId;
  if (input.modelId != null) payload.model = input.modelId;
  if (input.vendorId != null) payload.vendor = input.vendorId;
  if (input.assignedTo !== undefined) payload.assigned_to = input.assignedTo ?? "";
  if (input.currentValue != null) payload.current_value = input.currentValue;
  return payload;
}

export function AssetsProvider({ children }: { children: ReactNode }) {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);

  async function refreshAssets() {
    try {
      const items = await apiGetAll<BackendAsset>("/assets/");
      setAssets(items.map(fromBackend));
    } catch {
      setAssets([]);
    } finally {
      setLoading(false);
    }
  }

  const [loadRequested, requestLoad] = useLoadOnDemand();

  // Loads the first time a component on screen reads this context (see lib/lazy.ts).
  useEffect(() => {
    if (!loadRequested) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on demand; state is set when the request resolves
    void refreshAssets();
  }, [loadRequested]);

  async function refreshAsset(id: number) {
    if (!loadRequested) return;
    try {
      const fresh = fromBackend(await apiGet<BackendAsset>(`/assets/${id}/`));
      setAssets((prev) => (prev.some((a) => a.id === id) ? prev.map((a) => (a.id === id ? fresh : a)) : [fresh, ...prev]));
    } catch {
      // Deleted meanwhile or not visible — fall back to a full reload.
      await refreshAssets();
    }
  }

  async function getAsset(id: number): Promise<Asset> {
    const raw = await apiGet<BackendAsset>(`/assets/${id}/`);
    return fromBackend(raw);
  }

  async function createAsset(input: AssetInput) {
    const created = await apiPost<BackendAsset>("/assets/", toBackend(input));
    await refreshAssets();
    return fromBackend(created);
  }

  async function updateAsset(id: number, input: AssetInput) {
    const updated = await apiPatch<BackendAsset>(`/assets/${id}/`, toBackend(input));
    await refreshAssets();
    return fromBackend(updated);
  }

  async function deleteAsset(id: number) {
    await apiDelete(`/assets/${id}/`);
    await refreshAssets();
  }

  return (
    <AssetsContext.Provider
      value={{ requestLoad, assets, loading, setAssets, refreshAssets, refreshAsset, getAsset, createAsset, updateAsset, deleteAsset }}
    >
      {children}
    </AssetsContext.Provider>
  );
}

export function useAssets(options?: LoadOptions) {
  const ctx = useContext(AssetsContext);
  useRequestLoad(ctx?.requestLoad, options);
  if (!ctx) throw new Error("useAssets must be used within an AssetsProvider");
  return ctx;
}
