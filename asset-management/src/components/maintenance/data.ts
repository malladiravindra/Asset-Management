import {
  AlertTriangle,
  Battery,
  CalendarCheck2,
  CheckCircle2,
  Clock3,
  HardDriveDownload,
  RefreshCw,
  ShieldCheck,
  Wrench,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { TODAY } from "@/components/assets/data";

export type MaintenanceType =
  | "Preventive"
  | "Corrective"
  | "Inspection"
  | "Battery Replace"
  | "OS Reinstall"
  | "Software Update";

export const MAINTENANCE_TYPES: MaintenanceType[] = [
  "Preventive",
  "Corrective",
  "Inspection",
  "Battery Replace",
  "OS Reinstall",
  "Software Update",
];

export const MAINTENANCE_TYPE_META: Record<MaintenanceType, { icon: LucideIcon; chip: string }> = {
  Preventive: { icon: ShieldCheck, chip: "bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400" },
  Corrective: { icon: Wrench, chip: "bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400" },
  Inspection: { icon: CalendarCheck2, chip: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300" },
  "Battery Replace": {
    icon: Battery,
    chip: "bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-400",
  },
  "OS Reinstall": {
    icon: HardDriveDownload,
    chip: "bg-cyan-50 text-cyan-600 dark:bg-cyan-500/10 dark:text-cyan-400",
  },
  "Software Update": {
    icon: RefreshCw,
    chip: "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400",
  },
};

export type MaintenancePriority = "Low" | "Medium" | "High";

export const MAINTENANCE_PRIORITIES: MaintenancePriority[] = ["Low", "Medium", "High"];

export const PRIORITY_STYLES: Record<MaintenancePriority, string> = {
  Low: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400",
  Medium: "bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400",
  High: "bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400",
};

// Stored status — the lifecycle a record actually transitions through.
export type MaintenanceStatus = "Scheduled" | "In Progress" | "Completed" | "Cancelled";

// Display status — adds a computed "Overdue" variant for anything still open
// past its scheduled date, without needing a background job to mutate state.
export type MaintenanceDisplayStatus = MaintenanceStatus | "Overdue";

export const MAINTENANCE_DISPLAY_STATUSES: MaintenanceDisplayStatus[] = [
  "Overdue",
  "Scheduled",
  "In Progress",
  "Completed",
  "Cancelled",
];

export const MAINTENANCE_STATUS_META: Record<
  MaintenanceDisplayStatus,
  { icon: LucideIcon; chip: string; dot: string }
> = {
  Scheduled: {
    icon: Clock3,
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

// The natural forward path through a maintenance job's lifecycle.
export const MAINTENANCE_STATUS_FLOW: MaintenanceStatus[] = ["Scheduled", "In Progress", "Completed"];

export function nextMaintenanceStatus(status: MaintenanceStatus): MaintenanceStatus | null {
  const idx = MAINTENANCE_STATUS_FLOW.indexOf(status);
  if (idx === -1 || idx === MAINTENANCE_STATUS_FLOW.length - 1) return null;
  return MAINTENANCE_STATUS_FLOW[idx + 1];
}

export type MaintenanceRecord = {
  id: number;
  assetId: number;
  assetTag: string;
  assetName: string;
  category: string;
  location: string;
  type: MaintenanceType;
  technician: string;
  priority: MaintenancePriority;
  scheduledDate: Date;
  completedDate: Date | null;
  status: MaintenanceStatus;
  cost: number | null;
  notes: string;
};

export function displayStatus(record: MaintenanceRecord): MaintenanceDisplayStatus {
  const isOpen = record.status === "Scheduled" || record.status === "In Progress";
  if (isOpen && record.scheduledDate.getTime() < TODAY.getTime()) return "Overdue";
  return record.status;
}

export function daysFromToday(date: Date) {
  return Math.round((date.getTime() - TODAY.getTime()) / 86_400_000);
}

// Surfaces the jobs that need attention first (overdue, then active, then
// upcoming) and pushes finished/cancelled history to the bottom.
const DISPLAY_STATUS_RANK: Record<MaintenanceDisplayStatus, number> = {
  Overdue: 0,
  "In Progress": 1,
  Scheduled: 2,
  Completed: 3,
  Cancelled: 4,
};

export function compareMaintenanceRecords(a: MaintenanceRecord, b: MaintenanceRecord) {
  const rankA = DISPLAY_STATUS_RANK[displayStatus(a)];
  const rankB = DISPLAY_STATUS_RANK[displayStatus(b)];
  if (rankA !== rankB) return rankA - rankB;
  const isHistory = rankA === DISPLAY_STATUS_RANK.Completed || rankA === DISPLAY_STATUS_RANK.Cancelled;
  return isHistory
    ? b.scheduledDate.getTime() - a.scheduledDate.getTime()
    : a.scheduledDate.getTime() - b.scheduledDate.getTime();
}

