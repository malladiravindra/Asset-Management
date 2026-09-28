"use client";

import { createContext, useContext, useEffect, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { useLoadOnDemand, useRequestLoad, type LoadOptions } from "@/lib/lazy";
import { apiDelete, apiGetAll, apiPatch, apiPost } from "@/lib/api";
import type {
  MaintenancePriority,
  MaintenanceRecord,
  MaintenanceStatus,
  MaintenanceType,
} from "@/components/maintenance/data";
import { parseDateOnly, toDateOnly } from "@/lib/dates";

type BackendMaintenanceRecord = {
  id: number;
  asset: number;
  asset_tag: string;
  asset_name: string;
  category: string;
  location: string;
  type: MaintenanceType;
  technician: string;
  priority: MaintenancePriority;
  scheduled_date: string;
  completed_date: string | null;
  status: MaintenanceStatus;
  display_status?: string;
  cost: string | number | null;
  notes: string | null;
  created_at?: string;
  updated_at?: string;
};

export type MaintenanceCreateInput = {
  assetId: number;
  type: MaintenanceType;
  technician: string;
  priority: MaintenancePriority;
  scheduledDate: Date;
  notes?: string;
};

export type MaintenanceUpdateInput = Partial<{
  assetId: number;
  type: MaintenanceType;
  technician: string;
  priority: MaintenancePriority;
  scheduledDate: Date;
  completedDate: Date | null;
  status: MaintenanceStatus;
  cost: number | null;
  notes: string;
}>;

type MaintenanceContextValue = {
  requestLoad: () => void;
  records: MaintenanceRecord[];
  setRecords: Dispatch<SetStateAction<MaintenanceRecord[]>>;
  createMaintenanceRecord: (input: MaintenanceCreateInput) => Promise<MaintenanceRecord>;
  updateMaintenanceRecord: (id: number, input: MaintenanceUpdateInput) => Promise<MaintenanceRecord>;
  deleteMaintenanceRecord: (id: number) => Promise<void>;
};

const MaintenanceContext = createContext<MaintenanceContextValue | null>(null);

function toISODate(date: Date) {
  return toDateOnly(date);
}

function fromBackend(record: BackendMaintenanceRecord): MaintenanceRecord {
  return {
    id: record.id,
    assetId: record.asset,
    assetTag: record.asset_tag,
    assetName: record.asset_name,
    category: record.category,
    location: record.location,
    type: record.type,
    technician: record.technician,
    priority: record.priority,
    scheduledDate: parseDateOnly(record.scheduled_date),
    completedDate: record.completed_date ? parseDateOnly(record.completed_date) : null,
    status: record.status,
    cost: record.cost !== null && record.cost !== undefined ? Number(record.cost) : null,
    notes: record.notes ?? "",
  };
}

function toBackend(input: MaintenanceCreateInput | MaintenanceUpdateInput) {
  const body: Record<string, unknown> = {};
  if (input.assetId !== undefined) body.asset = input.assetId;
  if (input.type !== undefined) body.type = input.type;
  if (input.technician !== undefined) body.technician = input.technician;
  if (input.priority !== undefined) body.priority = input.priority;
  if (input.scheduledDate !== undefined) body.scheduled_date = toISODate(input.scheduledDate);
  if ("completedDate" in input && input.completedDate !== undefined) {
    body.completed_date = input.completedDate ? toISODate(input.completedDate) : null;
  }
  if ("status" in input && input.status !== undefined) body.status = input.status;
  if ("cost" in input && input.cost !== undefined) body.cost = input.cost;
  if (input.notes !== undefined) body.notes = input.notes;
  return body;
}

export function MaintenanceProvider({ children }: { children: ReactNode }) {
  const [records, setRecords] = useState<MaintenanceRecord[]>([]);

  const [loadRequested, requestLoad] = useLoadOnDemand();

  // Loads the first time a component on screen reads this context (see lib/lazy.ts).
  useEffect(() => {
    if (!loadRequested) return;
    void apiGetAll<BackendMaintenanceRecord>("/operation/maintenance/")
      .then((items) => setRecords(items.map(fromBackend)))
      .catch(() => setRecords([]));
  }, [loadRequested]);

  async function createMaintenanceRecord(input: MaintenanceCreateInput) {
    const created = await apiPost<BackendMaintenanceRecord>("/operation/maintenance/", toBackend(input));
    const record = fromBackend(created);
    // Prepend without re-sorting so the job the user just scheduled stays
    // pinned at the top instead of dropping into date-sorted order.
    setRecords((prev) => [record, ...prev]);
    return record;
  }

  async function updateMaintenanceRecord(id: number, input: MaintenanceUpdateInput) {
    const updated = await apiPatch<BackendMaintenanceRecord>(`/operation/maintenance/${id}/`, toBackend(input));
    const record = fromBackend(updated);
    setRecords((prev) => prev.map((r) => (r.id === id ? record : r)));
    return record;
  }

  async function deleteMaintenanceRecord(id: number) {
    await apiDelete(`/operation/maintenance/${id}/`);
    setRecords((prev) => prev.filter((r) => r.id !== id));
  }

  return (
    <MaintenanceContext.Provider
      value={{ requestLoad, records, setRecords, createMaintenanceRecord, updateMaintenanceRecord, deleteMaintenanceRecord }}
    >
      {children}
    </MaintenanceContext.Provider>
  );
}

export function useMaintenance(options?: LoadOptions) {
  const ctx = useContext(MaintenanceContext);
  useRequestLoad(ctx?.requestLoad, options);
  if (!ctx) throw new Error("useMaintenance must be used within a MaintenanceProvider");
  return ctx;
}
