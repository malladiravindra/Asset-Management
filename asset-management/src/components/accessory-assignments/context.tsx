"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useLoadOnDemand, useRequestLoad, type LoadOptions } from "@/lib/lazy";
import { apiGetAll, apiPost } from "@/lib/api";
import type { AccessoryAssignment, AccessoryAssignmentStatus } from "@/components/accessory-assignments/data";
import { parseDateOnly } from "@/lib/dates";

export type AccessoryAssignmentInput = {
  accessoryId: number;
  employeeId: number;
  quantity: number;
  assignedDate: string;
  notes?: string;
};

type AccessoryAssignmentsContextValue = {
  requestLoad: () => void;
  accessoryAssignments: AccessoryAssignment[];
  loading: boolean;
  loadError: boolean;
  createAccessoryAssignment: (input: AccessoryAssignmentInput) => Promise<AccessoryAssignment>;
  refreshAccessoryAssignments: () => Promise<void>;
};

const AccessoryAssignmentsContext = createContext<AccessoryAssignmentsContextValue | null>(null);

type BackendAccessoryAssignment = {
  id: number;
  accessory: number;
  accessory_sku: string;
  accessory_name: string;
  employee: number;
  employee_name: string;
  department: string | null;
  location: string | null;
  quantity: number;
  assigned_date: string;
  status: AccessoryAssignmentStatus;
  notes: string;
};

function fromBackend(a: BackendAccessoryAssignment): AccessoryAssignment {
  return {
    id: a.id,
    accessoryId: a.accessory,
    accessorySku: a.accessory_sku,
    accessoryName: a.accessory_name,
    employeeId: a.employee,
    employeeName: a.employee_name,
    department: a.department,
    location: a.location,
    quantity: a.quantity,
    assignedDate: parseDateOnly(a.assigned_date),
    status: a.status,
    notes: a.notes || "",
  };
}

export function AccessoryAssignmentsProvider({ children }: { children: ReactNode }) {
  const [accessoryAssignments, setAccessoryAssignments] = useState<AccessoryAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  async function refreshAccessoryAssignments() {
    try {
      const items = await apiGetAll<BackendAccessoryAssignment>("/operation/accessory-assignments/");
      setAccessoryAssignments(items.map(fromBackend));
      setLoadError(false);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }

  const [loadRequested, requestLoad] = useLoadOnDemand();

  // Loads the first time a component on screen reads this context (see lib/lazy.ts).
  useEffect(() => {
    if (!loadRequested) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on demand; state is set when the request resolves
    void refreshAccessoryAssignments();
  }, [loadRequested]);

  async function createAccessoryAssignment(input: AccessoryAssignmentInput) {
    const created = await apiPost<BackendAccessoryAssignment>("/operation/accessory-assignments/", {
      accessory: input.accessoryId,
      employee: input.employeeId,
      quantity: input.quantity,
      assigned_date: input.assignedDate,
      notes: input.notes ?? "",
    });
    const assignment = fromBackend(created);
    setAccessoryAssignments((prev) => [assignment, ...prev]);
    return assignment;
  }

  return (
    <AccessoryAssignmentsContext.Provider
      value={{ requestLoad, accessoryAssignments, loading, loadError, createAccessoryAssignment, refreshAccessoryAssignments }}
    >
      {children}
    </AccessoryAssignmentsContext.Provider>
  );
}

export function useAccessoryAssignments(options?: LoadOptions) {
  const ctx = useContext(AccessoryAssignmentsContext);
  useRequestLoad(ctx?.requestLoad, options);
  if (!ctx) throw new Error("useAccessoryAssignments must be used within an AccessoryAssignmentsProvider");
  return ctx;
}
