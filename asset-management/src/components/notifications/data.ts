import {
  Bell,
  Hammer,
  KeyRound,
  ShieldAlert,
  ShieldX,
  ShoppingCart,
  Undo2,
  UserCheck,
  Wrench,
  type LucideIcon,
} from "lucide-react";

/**
 * Notification types come from the backend (asset_backend/notifications/
 * models.py Notification.TYPE_CHOICES). The frontend never creates
 * notifications — it only displays the current user's rows from
 * GET /api/notifications/.
 */
export type NotificationType =
  | "assignment_created"
  | "return_processed"
  | "repair_status_changed"
  | "maintenance_status_changed"
  | "purchase_order_status_changed"
  | "warranty_expiring"
  | "warranty_expired"
  | "maintenance_overdue"
  | "repair_overdue"
  | "license_expiring"
  | "license_expired";

export type NotificationPriority = "low" | "normal" | "high";

export type Notification = {
  id: number;
  type: NotificationType | string;
  title: string;
  message: string;
  priority: NotificationPriority;
  href: string;
  read: boolean;
  createdAt: Date;
};

export type BackendNotification = {
  id: number;
  type: string;
  title: string;
  message: string;
  priority: NotificationPriority;
  target_type: string;
  target_id: number | null;
  action_url: string;
  is_read: boolean;
  read_at: string | null;
  created_at: string;
};

export function fromBackend(n: BackendNotification): Notification {
  return {
    id: n.id,
    type: n.type,
    title: n.title,
    message: n.message,
    priority: n.priority,
    href: n.action_url || "/dashboard/notifications",
    read: n.is_read,
    createdAt: new Date(n.created_at),
  };
}

const RED = "bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400";
const AMBER = "bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400";
const BLUE = "bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400";
const EMERALD = "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400";
const INDIGO = "bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400";
const SLATE = "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300";

const TYPE_META: Record<NotificationType, { icon: LucideIcon; chip: string }> = {
  assignment_created: { icon: UserCheck, chip: EMERALD },
  return_processed: { icon: Undo2, chip: SLATE },
  repair_status_changed: { icon: Hammer, chip: AMBER },
  repair_overdue: { icon: Hammer, chip: RED },
  maintenance_status_changed: { icon: Wrench, chip: BLUE },
  maintenance_overdue: { icon: Wrench, chip: RED },
  purchase_order_status_changed: { icon: ShoppingCart, chip: INDIGO },
  warranty_expiring: { icon: ShieldAlert, chip: AMBER },
  warranty_expired: { icon: ShieldX, chip: RED },
  license_expiring: { icon: KeyRound, chip: AMBER },
  license_expired: { icon: KeyRound, chip: RED },
};

const FALLBACK = { icon: Bell, chip: SLATE };

export function iconFor(type: string) {
  return (TYPE_META[type as NotificationType] ?? FALLBACK).icon;
}

export function chipFor(type: string) {
  return (TYPE_META[type as NotificationType] ?? FALLBACK).chip;
}

const DESTINATION_LABEL: Record<string, string> = {
  "/dashboard/assets": "View in Assets",
  "/dashboard/repairs": "View in Repairs",
  "/dashboard/maintenance": "View in Maintenance",
  "/dashboard/assignments": "View in Assignments",
  "/dashboard/returns": "View in Returns",
  "/dashboard/purchase-orders": "View in Purchase Orders",
  "/dashboard/software-licenses": "View in Software Licenses",
};

export function destinationLabelFor(href: string) {
  return DESTINATION_LABEL[href] ?? "View details";
}

/** "25 Sep 2026, 14:05" — when the backend recorded the notification. */
export function formatNotificationTime(date: Date) {
  return date.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
