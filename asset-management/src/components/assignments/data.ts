import { RotateCcw, UserCheck, type LucideIcon } from "lucide-react";
import { TODAY } from "@/components/assets/data";

export type AssignmentStatus = "Assigned" | "Unassigned";

export type ReturnCondition = "Excellent" | "Good" | "Fair" | "Poor";

export const RETURN_CONDITIONS: ReturnCondition[] = ["Excellent", "Good", "Fair", "Poor"];

export const RETURN_CONDITION_STYLES: Record<ReturnCondition, string> = {
  Excellent: "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400",
  Good: "bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400",
  Fair: "bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400",
  Poor: "bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400",
};

export const RETURN_REASONS = [
  "Project ended",
  "Employee exit",
  "Upgrade",
  "Department transfer",
  "Damaged / Faulty",
  "Warranty replacement",
] as const;

export type Assignment = {
  id: number;
  assetId: number;
  assetTag: string;
  assetName: string;
  assetCategory: string;
  employeeName: string;
  department: string;
  location: string;
  assignedDate: Date;
  unassignedDate: Date | null;
  status: AssignmentStatus;
  condition: ReturnCondition | null;
  reason: string | null;
};

export const ASSIGNMENT_STATUSES: AssignmentStatus[] = ["Assigned", "Unassigned"];

export const ASSIGNMENT_STATUS_META: Record<AssignmentStatus, { icon: LucideIcon; chip: string; dot: string }> = {
  Assigned: {
    icon: UserCheck,
    chip: "bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400",
    dot: "bg-blue-500",
  },
  Unassigned: {
    icon: RotateCcw,
    chip: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400",
    dot: "bg-slate-400",
  },
};

export function durationDays(assignment: Assignment) {
  const end = assignment.unassignedDate ?? TODAY;
  return Math.max(0, Math.round((end.getTime() - assignment.assignedDate.getTime()) / 86_400_000));
}

