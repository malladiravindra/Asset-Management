"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useLoadOnDemand, useRequestLoad, type LoadOptions } from "@/lib/lazy";
import { apiDelete, apiGet, apiGetAll, apiPost } from "@/lib/api";
import type { Assignment, AssignmentStatus, ReturnCondition } from "@/components/assignments/data";
import { parseDateOnly } from "@/lib/dates";

type AssignmentInput = {
  assetId: number;
  personId: number;
  assignedDate: string;
};

type AssignmentsContextValue = {
  requestLoad: () => void;
  assignments: Assignment[];
  createAssignment: (input: AssignmentInput) => Promise<Assignment>;
  deleteAssignment: (id: number) => Promise<void>;
  refreshAssignment: (id: number) => Promise<Assignment>;
};

const AssignmentsContext = createContext<AssignmentsContextValue | null>(null);

type BackendAssignment = {
  id: number;
  asset: number;
  asset_tag: string;
  asset_name: string;
  asset_category: string;
  person: number;
  employee_name: string;
  // null when the employee has no department/location on file.
  department: string | null;
  location: string | null;
  assigned_date: string;
  unassigned_date: string | null;
  status: AssignmentStatus;
  condition: ReturnCondition | null;
  reason: string | null;
};

function fromBackend(assignment: BackendAssignment): Assignment {
  return {
    id: assignment.id,
    assetId: assignment.asset,
    assetTag: assignment.asset_tag,
    assetName: assignment.asset_name,
    assetCategory: assignment.asset_category,
    employeeName: assignment.employee_name,
    department: assignment.department ?? "",
    location: assignment.location ?? "",
    assignedDate: parseDateOnly(assignment.assigned_date),
    unassignedDate: assignment.unassigned_date ? parseDateOnly(assignment.unassigned_date) : null,
    status: assignment.status,
    condition: assignment.condition,
    reason: assignment.reason,
  };
}

export function AssignmentsProvider({ children }: { children: ReactNode }) {
  const [assignments, setAssignments] = useState<Assignment[]>([]);

  const [loadRequested, requestLoad] = useLoadOnDemand();

  // Loads the first time a component on screen reads this context (see lib/lazy.ts).
  useEffect(() => {
    if (!loadRequested) return;
    void apiGetAll<BackendAssignment>("/operations/assignments/")
      .then((items) => setAssignments(items.map(fromBackend)))
      .catch(() => setAssignments([]));
  }, [loadRequested]);

  async function createAssignment(input: AssignmentInput) {
    const created = await apiPost<BackendAssignment>("/operations/assignments/", {
      asset: input.assetId,
      person: input.personId,
      assigned_date: input.assignedDate,
    });
    const assignment = fromBackend(created);
    setAssignments((prev) => [assignment, ...prev]);
    return assignment;
  }

  async function refreshAssignment(id: number) {
    const updated = await apiGet<BackendAssignment>(`/operations/assignments/${id}/`);
    const assignment = fromBackend(updated);
    setAssignments((prev) => prev.map((a) => (a.id === id ? assignment : a)));
    return assignment;
  }

  async function deleteAssignment(id: number) {
    await apiDelete(`/operations/assignments/${id}/`);
    setAssignments((prev) => prev.filter((a) => a.id !== id));
  }

  return (
    <AssignmentsContext.Provider
      value={{ requestLoad, assignments, createAssignment, deleteAssignment, refreshAssignment }}
    >
      {children}
    </AssignmentsContext.Provider>
  );
}

export function useAssignments(options?: LoadOptions) {
  const ctx = useContext(AssignmentsContext);
  useRequestLoad(ctx?.requestLoad, options);
  if (!ctx) throw new Error("useAssignments must be used within an AssignmentsProvider");
  return ctx;
}
