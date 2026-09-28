export type AccessoryAssignmentStatus = "Assigned" | "Returned";

export type AccessoryAssignment = {
  id: number;
  accessoryId: number;
  accessorySku: string;
  accessoryName: string;
  employeeId: number;
  employeeName: string;
  department: string | null;
  location: string | null;
  quantity: number;
  assignedDate: Date;
  status: AccessoryAssignmentStatus;
  notes: string;
};

export type AssignedAccessorySummary = {
  accessoryId: number;
  accessorySku: string;
  accessoryName: string;
  quantity: number;
};

/** Active (status "Assigned") rows for one employee, summed per accessory —
 * an employee holding two separate issuances of the same accessory shows as
 * one row with the combined quantity, matching how "Currently Assigned"
 * should read (see the Assign Accessory modal). */
export function assignedAccessoriesFor(
  assignments: AccessoryAssignment[],
  employeeId: number
): AssignedAccessorySummary[] {
  const summaries = new Map<number, AssignedAccessorySummary>();
  for (const a of assignments) {
    if (a.employeeId !== employeeId || a.status !== "Assigned") continue;
    const existing = summaries.get(a.accessoryId);
    if (existing) {
      existing.quantity += a.quantity;
    } else {
      summaries.set(a.accessoryId, {
        accessoryId: a.accessoryId,
        accessorySku: a.accessorySku,
        accessoryName: a.accessoryName,
        quantity: a.quantity,
      });
    }
  }
  return [...summaries.values()];
}
