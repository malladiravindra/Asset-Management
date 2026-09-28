import { LogIn, LogOut, PackagePlus, Pencil, Trash2, Undo2, UserCheck, type LucideIcon } from "lucide-react";

export type AuditAction = "CREATE" | "UPDATE" | "ASSIGN" | "RETURN" | "DELETE" | "LOGIN" | "LOGOUT";

export type AuditLogEntry = {
  id: number;
  action: AuditAction;
  title: string;
  actor: string;
  context?: string;
  timestamp: Date;
};

export const ACTION_ORDER: AuditAction[] = ["CREATE", "UPDATE", "ASSIGN", "RETURN", "DELETE"];

export const ACTION_META: Record<AuditAction, { label: string; icon: LucideIcon; chip: string; dot: string }> = {
  CREATE: {
    label: "Create",
    icon: PackagePlus,
    chip: "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400",
    dot: "bg-emerald-500",
  },
  UPDATE: {
    label: "Update",
    icon: Pencil,
    chip: "bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400",
    dot: "bg-blue-500",
  },
  ASSIGN: {
    label: "Assign",
    icon: UserCheck,
    chip: "bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-400",
    dot: "bg-violet-500",
  },
  RETURN: {
    label: "Return",
    icon: Undo2,
    chip: "bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400",
    dot: "bg-amber-500",
  },
  DELETE: {
    label: "Delete",
    icon: Trash2,
    chip: "bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400",
    dot: "bg-red-500",
  },
  // Emitted only when Settings > Audit Logs > Track Login / Track Logout
  // are on. Deliberately not in ACTION_ORDER, so the existing filter-card
  // row keeps its layout; these entries still render in the list/dashboard
  // and count toward "All Activity".
  LOGIN: {
    label: "Login",
    icon: LogIn,
    chip: "bg-slate-100 text-slate-600 dark:bg-slate-500/10 dark:text-slate-300",
    dot: "bg-slate-500",
  },
  LOGOUT: {
    label: "Logout",
    icon: LogOut,
    chip: "bg-slate-100 text-slate-600 dark:bg-slate-500/10 dark:text-slate-300",
    dot: "bg-slate-400",
  },
};

const DAY = 86_400_000;

// Mock/in-memory sample data (formerly INITIAL_AUDIT_LOGS) has been removed —
// the backend /api/audit-logs/ API (see api.ts + context.tsx) is now the
// sole, permanent source of audit log entries. No hardcoded audit-log data
// remains anywhere in this module.

export function timeAgo(date: Date, now: Date = new Date()) {
  const diffMs = Math.max(0, now.getTime() - date.getTime());
  const minute = 60_000;
  const hour = 3_600_000;
  const day = 86_400_000;

  if (diffMs < minute) return "Just now";
  if (diffMs < hour) return `${Math.floor(diffMs / minute)}m ago`;
  if (diffMs < day) return `${Math.floor(diffMs / hour)}h ago`;

  const days = Math.floor(diffMs / day);
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

export function dayLabel(date: Date, now: Date = new Date()) {
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diffDays = Math.round((startOfDay(now) - startOfDay(date)) / DAY);

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;

  return date.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
  });
}

export function auditLogsToCSV(logs: AuditLogEntry[]) {
  const header = ["Action", "Details", "Actor", "Context", "Timestamp"];
  const rows = logs.map((l) => [
    ACTION_META[l.action].label,
    l.title,
    l.actor,
    l.context ?? "—",
    l.timestamp.toISOString(),
  ]);

  const escape = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return [header, ...rows].map((r) => r.map(escape).join(",")).join("\n");
}
