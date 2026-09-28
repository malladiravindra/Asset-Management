import {
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  Cpu,
  Droplets,
  Keyboard,
  Monitor,
  RefreshCw,
  Wrench,
  XCircle,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { TODAY } from "@/components/assets/data";

export type RepairIssueType =
  | "Screen Damage"
  | "Battery Issue"
  | "Keyboard / Input"
  | "Charging / Power"
  | "Motherboard"
  | "Software / OS"
  | "Water / Liquid Damage"
  | "Other Hardware";

export const REPAIR_ISSUE_TYPES: RepairIssueType[] = [
  "Screen Damage",
  "Battery Issue",
  "Keyboard / Input",
  "Charging / Power",
  "Motherboard",
  "Software / OS",
  "Water / Liquid Damage",
  "Other Hardware",
];

export const REPAIR_ISSUE_META: Record<RepairIssueType, { icon: LucideIcon; chip: string }> = {
  "Screen Damage": { icon: Monitor, chip: "bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400" },
  "Battery Issue": { icon: Zap, chip: "bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400" },
  "Keyboard / Input": {
    icon: Keyboard,
    chip: "bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-400",
  },
  "Charging / Power": {
    icon: Zap,
    chip: "bg-orange-50 text-orange-600 dark:bg-orange-500/10 dark:text-orange-400",
  },
  Motherboard: { icon: Cpu, chip: "bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400" },
  "Software / OS": {
    icon: RefreshCw,
    chip: "bg-cyan-50 text-cyan-600 dark:bg-cyan-500/10 dark:text-cyan-400",
  },
  "Water / Liquid Damage": {
    icon: Droplets,
    chip: "bg-sky-50 text-sky-600 dark:bg-sky-500/10 dark:text-sky-400",
  },
  "Other Hardware": {
    icon: Wrench,
    chip: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  },
};

export type RepairPriority = "Low" | "Medium" | "High";

export const REPAIR_PRIORITIES: RepairPriority[] = ["Low", "Medium", "High"];

export const REPAIR_PRIORITY_STYLES: Record<RepairPriority, string> = {
  Low: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400",
  Medium: "bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400",
  High: "bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400",
};

// Stored status — the lifecycle a repair job actually transitions through.
export type RepairStatus = "Reported" | "In Progress" | "Completed" | "Cancelled";

// Display status — adds a computed "Overdue" variant for anything still open
// past its expected return date, mirroring the maintenance module.
export type RepairDisplayStatus = RepairStatus | "Overdue";

export const REPAIR_DISPLAY_STATUSES: RepairDisplayStatus[] = [
  "Overdue",
  "Reported",
  "In Progress",
  "Completed",
  "Cancelled",
];

export const REPAIR_STATUS_META: Record<RepairDisplayStatus, { icon: LucideIcon; chip: string; dot: string }> = {
  Reported: {
    icon: ClipboardList,
    chip: "bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400",
    dot: "bg-blue-500",
  },
  "In Progress": {
    icon: Wrench,
    chip: "bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400",
    dot: "bg-amber-500",
  },
  Overdue: {
    icon: AlertTriangle,
    chip: "bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400",
    dot: "bg-red-500",
  },
  Completed: {
    icon: CheckCircle2,
    chip: "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400",
    dot: "bg-emerald-500",
  },
  Cancelled: {
    icon: XCircle,
    chip: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400",
    dot: "bg-slate-400",
  },
};

// The natural forward path through a repair job's lifecycle.
export const REPAIR_STATUS_FLOW: RepairStatus[] = ["Reported", "In Progress", "Completed"];

export function nextRepairStatus(status: RepairStatus): RepairStatus | null {
  const idx = REPAIR_STATUS_FLOW.indexOf(status);
  if (idx === -1 || idx === REPAIR_STATUS_FLOW.length - 1) return null;
  return REPAIR_STATUS_FLOW[idx + 1];
}

export type RepairRecord = {
  id: number;
  repairId: string;
  assetId: number;
  assetTag: string;
  assetName: string;
  category: string;
  location: string;
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
};

export function displayStatus(record: RepairRecord): RepairDisplayStatus {
  const isOpen = record.status === "Reported" || record.status === "In Progress";
  if (isOpen && record.expectedReturnDate.getTime() < TODAY.getTime()) return "Overdue";
  return record.status;
}

export function daysFromToday(date: Date) {
  return Math.round((date.getTime() - TODAY.getTime()) / 86_400_000);
}

// Surfaces the jobs that need attention first (overdue, then active, then
// upcoming) and pushes finished/cancelled history to the bottom.
const DISPLAY_STATUS_RANK: Record<RepairDisplayStatus, number> = {
  Overdue: 0,
  "In Progress": 1,
  Reported: 2,
  Completed: 3,
  Cancelled: 4,
};

export function compareRepairRecords(a: RepairRecord, b: RepairRecord) {
  const rankA = DISPLAY_STATUS_RANK[displayStatus(a)];
  const rankB = DISPLAY_STATUS_RANK[displayStatus(b)];
  if (rankA !== rankB) return rankA - rankB;
  const isHistory = rankA === DISPLAY_STATUS_RANK.Completed || rankA === DISPLAY_STATUS_RANK.Cancelled;
  return isHistory
    ? b.expectedReturnDate.getTime() - a.expectedReturnDate.getTime()
    : a.expectedReturnDate.getTime() - b.expectedReturnDate.getTime();
}

