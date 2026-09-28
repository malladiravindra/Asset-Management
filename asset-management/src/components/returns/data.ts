import type { ReturnCondition } from "@/components/assignments/data";

export type Return = {
  id: number;
  returnNumber: string; // server-generated, e.g. "RET-007"
  assignmentId: number;
  assetId: number;
  assetTag: string;
  assetName: string;
  assetCategory: string;
  employeeName: string;
  department: string;
  location: string;
  assignedDate: Date;
  returnDate: Date;
  status: string;
  condition: ReturnCondition | null;
  reason: string | null;
  createdAt: Date;
};

export function returnDurationDays(returnRecord: Pick<Return, "assignedDate" | "returnDate">) {
  return Math.max(
    0,
    Math.round((returnRecord.returnDate.getTime() - returnRecord.assignedDate.getTime()) / 86_400_000)
  );
}
