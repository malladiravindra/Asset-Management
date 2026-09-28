"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useLoadOnDemand, useRequestLoad, type LoadOptions } from "@/lib/lazy";
import { apiGetAll, apiPost } from "@/lib/api";
import { useAssignments } from "@/components/assignments/context";
import type { ReturnCondition } from "@/components/assignments/data";
import type { Return } from "@/components/returns/data";
import { parseDateOnly } from "@/lib/dates";

// Everything but the assignment is optional: the Assignments page's quick
// "Unassign" sends only the assignment (the backend defaults return_date to
// today); the Returns page's form sends all four.
type ReturnInput = {
  assignmentId: number;
  returnDate?: string;
  condition?: ReturnCondition;
  reason?: string;
};

type ReturnsContextValue = {
  requestLoad: () => void;
  returns: Return[];
  createReturn: (input: ReturnInput) => Promise<Return>;
};

const ReturnsContext = createContext<ReturnsContextValue | null>(null);

type BackendReturn = {
  id: number;
  return_number: string | null;
  assignment: number;
  asset_id: number;
  asset_tag: string;
  asset_name: string;
  asset_category: string;
  employee_name: string;
  // null when the employee has no department/location on file.
  department: string | null;
  location: string | null;
  assigned_date: string;
  return_date: string;
  status: string;
  condition: ReturnCondition | null;
  reason: string | null;
  created_at: string;
};

function fromBackend(record: BackendReturn): Return {
  return {
    id: record.id,
    returnNumber: record.return_number ?? "",
    assignmentId: record.assignment,
    assetId: record.asset_id,
    assetTag: record.asset_tag,
    assetName: record.asset_name,
    assetCategory: record.asset_category,
    employeeName: record.employee_name,
    department: record.department ?? "",
    location: record.location ?? "",
    assignedDate: parseDateOnly(record.assigned_date),
    returnDate: parseDateOnly(record.return_date),
    status: record.status,
    condition: record.condition,
    reason: record.reason,
    createdAt: new Date(record.created_at),
  };
}

export function ReturnsProvider({ children }: { children: ReactNode }) {
  const [returns, setReturns] = useState<Return[]>([]);

  const [loadRequested, requestLoad] = useLoadOnDemand();

  // Loads the first time a component on screen reads this context (see lib/lazy.ts).
  useEffect(() => {
    if (!loadRequested) return;
    void apiGetAll<BackendReturn>("/operations/returns/")
      .then((items) => setReturns(items.map(fromBackend)))
      .catch(() => setReturns([]));
  }, [loadRequested]);

  // The one way the app records a return: POST /operations/returns/. The
  // backend closes the assignment and frees the asset in the same
  // transaction; the affected assignment row is re-read here so the
  // Assignments list never goes stale.
  const { refreshAssignment } = useAssignments({ load: false });

  async function createReturn(input: ReturnInput) {
    const created = await apiPost<BackendReturn>("/operations/returns/", {
      assignment: input.assignmentId,
      ...(input.returnDate !== undefined ? { return_date: input.returnDate } : {}),
      ...(input.condition !== undefined ? { condition: input.condition } : {}),
      ...(input.reason !== undefined ? { reason: input.reason } : {}),
    });
    const record = fromBackend(created);
    setReturns((prev) => [record, ...prev]);
    await refreshAssignment(input.assignmentId).catch(() => {});
    return record;
  }

  return (
    <ReturnsContext.Provider value={{ requestLoad, returns, createReturn }}>{children}</ReturnsContext.Provider>
  );
}

export function useReturns(options?: LoadOptions) {
  const ctx = useContext(ReturnsContext);
  useRequestLoad(ctx?.requestLoad, options);
  if (!ctx) throw new Error("useReturns must be used within a ReturnsProvider");
  return ctx;
}
