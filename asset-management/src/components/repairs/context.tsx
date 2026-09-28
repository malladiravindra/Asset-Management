"use client";

import { createContext, useContext, useEffect, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { useLoadOnDemand, useRequestLoad, type LoadOptions } from "@/lib/lazy";
import { apiDelete, apiGetAll, apiPatch, apiPost } from "@/lib/api";
import type {
  RepairIssueType,
  RepairPriority,
  RepairRecord,
  RepairStatus,
} from "@/components/repairs/data";
import { parseDateOnly, toDateOnly } from "@/lib/dates";

type BackendRepairRecord = {
  id: number;
  repair_id: string;
  asset: number;
  asset_tag: string;
  asset_name: string;
  category: string;
  location: string;
  issue_type: RepairIssueType;
  issue: string;
  vendor: string;
  priority: RepairPriority;
  under_warranty: boolean;
  cost: string | number;
  reported_date: string;
  expected_return_date: string;
  completed_date: string | null;
  status: RepairStatus;
  display_status?: string;
  notes: string | null;
  created_at?: string;
  updated_at?: string;
};

export type RepairCreateInput = {
  assetId: number;
  issueType: RepairIssueType;
  issue: string;
  vendor: string;
  priority: RepairPriority;
  underWarranty: boolean;
  cost: number;
  reportedDate: Date;
  expectedReturnDate: Date;
  notes?: string;
};

export type RepairUpdateInput = Partial<{
  assetId: number;
  issueType: RepairIssueType;
  issue: string;
  vendor: string;
  priority: RepairPriority;
  underWarranty: boolean;
  cost: number;
  reportedDate: Date;
  expectedReturnDate: Date;
  completedDate: Date | null;
  status: RepairStatus;
  notes: string;
}>;

type RepairsContextValue = {
  requestLoad: () => void;
  records: RepairRecord[];
  setRecords: Dispatch<SetStateAction<RepairRecord[]>>;
  createRepairRecord: (input: RepairCreateInput) => Promise<RepairRecord>;
  updateRepairRecord: (id: number, input: RepairUpdateInput) => Promise<RepairRecord>;
  deleteRepairRecord: (id: number) => Promise<void>;
};

const RepairsContext = createContext<RepairsContextValue | null>(null);

function toISODate(date: Date) {
  return toDateOnly(date);
}

function fromBackend(record: BackendRepairRecord): RepairRecord {
  return {
    id: record.id,
    repairId: record.repair_id,
    assetId: record.asset,
    assetTag: record.asset_tag,
    assetName: record.asset_name,
    category: record.category,
    location: record.location,
    issueType: record.issue_type,
    issue: record.issue,
    vendor: record.vendor,
    priority: record.priority,
    underWarranty: record.under_warranty,
    cost: record.cost !== null && record.cost !== undefined ? Number(record.cost) : 0,
    reportedDate: parseDateOnly(record.reported_date),
    expectedReturnDate: parseDateOnly(record.expected_return_date),
    completedDate: record.completed_date ? parseDateOnly(record.completed_date) : null,
    status: record.status,
    notes: record.notes ?? "",
  };
}

function toBackend(input: RepairCreateInput | RepairUpdateInput) {
  const body: Record<string, unknown> = {};
  if (input.assetId !== undefined) body.asset = input.assetId;
  if (input.issueType !== undefined) body.issue_type = input.issueType;
  if (input.issue !== undefined) body.issue = input.issue;
  if (input.vendor !== undefined) body.vendor = input.vendor;
  if (input.priority !== undefined) body.priority = input.priority;
  if (input.underWarranty !== undefined) body.under_warranty = input.underWarranty;
  if (input.cost !== undefined) body.cost = input.cost;
  if (input.reportedDate !== undefined) body.reported_date = toISODate(input.reportedDate);
  if (input.expectedReturnDate !== undefined) body.expected_return_date = toISODate(input.expectedReturnDate);
  if ("completedDate" in input && input.completedDate !== undefined) {
    body.completed_date = input.completedDate ? toISODate(input.completedDate) : null;
  }
  if ("status" in input && input.status !== undefined) body.status = input.status;
  if (input.notes !== undefined) body.notes = input.notes;
  return body;
}

export function RepairsProvider({ children }: { children: ReactNode }) {
  const [records, setRecords] = useState<RepairRecord[]>([]);

  const [loadRequested, requestLoad] = useLoadOnDemand();

  // Loads the first time a component on screen reads this context (see lib/lazy.ts).
  useEffect(() => {
    if (!loadRequested) return;
    void apiGetAll<BackendRepairRecord>("/operation/repairs/")
      .then((items) => setRecords(items.map(fromBackend)))
      .catch(() => setRecords([]));
  }, [loadRequested]);

  async function createRepairRecord(input: RepairCreateInput) {
    const created = await apiPost<BackendRepairRecord>("/operation/repairs/", toBackend(input));
    const record = fromBackend(created);
    // Prepend without re-sorting so the repair the user just logged stays
    // pinned at the top instead of dropping into date-sorted order.
    setRecords((prev) => [record, ...prev]);
    return record;
  }

  async function updateRepairRecord(id: number, input: RepairUpdateInput) {
    const updated = await apiPatch<BackendRepairRecord>(`/operation/repairs/${id}/`, toBackend(input));
    const record = fromBackend(updated);
    setRecords((prev) => prev.map((r) => (r.id === id ? record : r)));
    return record;
  }

  async function deleteRepairRecord(id: number) {
    await apiDelete(`/operation/repairs/${id}/`);
    setRecords((prev) => prev.filter((r) => r.id !== id));
  }

  return (
    <RepairsContext.Provider
      value={{ requestLoad, records, setRecords, createRepairRecord, updateRepairRecord, deleteRepairRecord }}
    >
      {children}
    </RepairsContext.Provider>
  );
}

export function useRepairs(options?: LoadOptions) {
  const ctx = useContext(RepairsContext);
  useRequestLoad(ctx?.requestLoad, options);
  if (!ctx) throw new Error("useRepairs must be used within a RepairsProvider");
  return ctx;
}
